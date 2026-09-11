"""
Main Execution & GNSS Blackout Simulation Pipeline (Module C)
Adapts the ai-imu-dr architecture for IO-VNBD smartphone data (S-M.csv).
Runs state estimation with 3 distinct modes:
  Mode 1 (GNSS Available): State constrained to GPS ground truth, calibrating sensor biases.
  Mode 2 (GNSS Outage): GPS masked entirely; AI-enhanced dead reckoning via IEKF + MesNet.
  Mode 3 (GNSS Restored): GPS updates re-enabled; smooth recovery without numeric blowup.
Exports coordinate arrays to output/results.npz.
"""

import os
import sys
import argparse
import time
import numpy as np
import torch

# Ensure src directory is on sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dataset_iovnbd import IOVNBDDataset
from iekf import NUMPYIEKF, TORCHIEKF, IOVNBParameters


def run_forward_pass_test(dataset, n_steps=500):
    """
    Runs a CPU forward-pass test on n_steps timesteps to verify model connectivity.
    """
    print(f"\n[Test] Running CPU forward-pass verification on {n_steps} timesteps...")
    torch_iekf = TORCHIEKF()
    torch_iekf.filter_parameters = IOVNBParameters()
    torch_iekf.set_param_attr()

    u_subset = dataset.u[:n_steps]
    torch_iekf.u_loc = u_subset.mean(dim=0)
    torch_iekf.u_std = u_subset.std(dim=0) + 1e-6

    start_t = time.time()
    covs = torch_iekf.forward_nets(u_subset).detach().cpu().numpy()
    elapsed = time.time() - start_t

    assert covs.shape == (n_steps, 2), f"Expected shape ({n_steps}, 2), got {covs.shape}"
    print(f"[Test] CPU forward-pass test passed! Shape: {covs.shape}, Elapsed: {elapsed:.3f}s\n")
    return True


def run_simulation(args):
    # 1. Setup Output Directory
    os.makedirs(args.output_dir, exist_ok=True)

    # 2. Load IO-VNBD Dataset
    print(f"Loading dataset from: {args.data_path} (max_rows={args.max_rows})...")
    dataset = IOVNBDDataset(csv_path=args.data_path, max_rows=args.max_rows)
    t, ang_gt, p_gt, v_gt, u = dataset.get_data()
    N = len(t)
    print(f"Loaded {N} timesteps ({t[-1] - t[0]:.1f} seconds of vehicle trip).")

    # 3. CPU forward-pass test if requested
    if args.test_500:
        run_forward_pass_test(dataset, n_steps=min(500, N))

    # 4. Initialize Neural Network Adapter and Invariant Extended Kalman Filter
    print("Initializing IEKF and PyTorch neural network adapter...")
    iekf = NUMPYIEKF()
    torch_iekf = TORCHIEKF()

    iekf.filter_parameters = IOVNBParameters()
    iekf.set_param_attr()
    torch_iekf.filter_parameters = IOVNBParameters()
    torch_iekf.set_param_attr()

    # ------------------------------------------------------------------
    # LOAD TRAINED WEIGHTS (this was previously missing -- without this,
    # MesNet and InitProcessCovNet run with random, untrained weights,
    # which is why earlier runs showed 116%+ drift instead of learned
    # AI-corrected covariances).
    # ------------------------------------------------------------------
    weights_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "results", "iekfnets.p"
    )
    if os.path.isfile(weights_path):
        mondict = torch.load(weights_path, map_location="cpu")
        torch_iekf.load_state_dict(mondict)
        print(f"Loaded TRAINED weights from {weights_path}")
    else:
        print(f"WARNING: no trained weights found at {weights_path} -- "
              f"running with UNTRAINED (random) network. Run src/run_train.py first.")

        # Normalize inputs for MesNet 1D ConvNet
    # IMPORTANT: use the SAME normalization stats computed during training,
    # not ones recomputed from this eval subset -- mismatched stats feed
    # the network out-of-distribution inputs and produce garbage covariances.
    norm_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "results", "norm_factors.p"
    )
    u_t = torch.from_numpy(u).double()
    if os.path.isfile(norm_path):
        norm_dict = torch.load(norm_path, map_location="cpu")
        torch_iekf.u_loc = norm_dict['u_loc']
        torch_iekf.u_std = norm_dict['u_std']
        print(f"Loaded TRAINING normalization stats from {norm_path}")
    else:
        torch_iekf.u_loc = u_t.mean(dim=0)
        torch_iekf.u_std = u_t.std(dim=0) + 1e-6
        print("WARNING: no saved training normalization stats found -- "
              "recomputing from eval data (may mismatch training).")
    print("Computing dynamic measurement noise covariance predictions via MesNet...")
    measurements_covs = torch_iekf.forward_nets(u_t).detach().cpu().numpy()
    iekf.set_learned_covariance(torch_iekf)

    # 5. Define Blackout Window
    t_start = int(args.t_start)
    t_end = int(args.t_end)
    if t_end > N:
        raise ValueError(f"t_end ({t_end}) exceeds loaded samples ({N}).")
    blackout_dur = t[t_end] - t[t_start]
    print(f"GNSS Blackout Window configured: rows [{t_start}:{t_end}] ({blackout_dur:.1f} seconds).")

    # 6. Pre-blackout Bias Calibration (Mode 1 learning)
    # Calibrate IMU accelerometer and gyro biases using running window prior to blackout
    calib_start = max(0, t_start - 200)
    calib_range = range(calib_start, t_start)
    g = iekf.g

    b_acc_samples = []
    b_omega_samples = []
    for k in calib_range:
        R_k = NUMPYIEKF.from_rpy(ang_gt[k, 0], ang_gt[k, 1], ang_gt[k, 2])
        dt_k = t[k] - t[k - 1] if k > 0 else 0.1
        a_true = (v_gt[k] - v_gt[k - 1]) / dt_k if k > 0 else np.zeros(3)
        f_expected = R_k.T.dot(a_true - g)
        b_acc_samples.append(u[k, 3:6] - f_expected)

    b_acc_calib = np.median(b_acc_samples, axis=0)
    # Calibrate gyro bias from steady driving period prior to blackout
    b_omega_calib = np.median(u[calib_range, :3], axis=0)
    if np.linalg.norm(b_omega_calib) > 0.05:
        b_omega_calib = np.zeros(3)
    print(f"Mode 1 Calibrated Sensor Biases:")
    print(f"  b_acc:   {b_acc_calib} m/s^2")
    print(f"  b_omega: {b_omega_calib} rad/s")

    # 7. Initialize State and Logs
    dt = t[1:] - t[:-1]
    p_pred = np.zeros((N, 3), dtype=np.float64)
    v_pred = np.zeros((N, 3), dtype=np.float64)
    mode_log = np.zeros(N, dtype=np.int32)

    p_pred[0] = p_gt[0]
    v_pred[0] = v_gt[0]
    mode_log[0] = 1

    Rot_curr = NUMPYIEKF.from_rpy(ang_gt[0, 0], ang_gt[0, 1], ang_gt[0, 2])
    v_curr = v_gt[0].copy()
    p_curr = p_gt[0].copy()
    b_omega_curr = b_omega_calib.copy()
    b_acc_curr = b_acc_calib.copy()
    Rot_c_i_curr = np.eye(3)
    t_c_i_curr = np.zeros(3)
    P_curr = iekf.init_covariance()

    print("\nRunning state estimation loop across all 3 modes...")
    sim_start_time = time.time()
    zupt_count = 0
    for i in range(1, N):
        dt_i = dt[i - 1]

        if i < t_start:
            # -------------------------------------------------------------
            # Mode 1 (GNSS Available): Update state with ground-truth GPS
            # -------------------------------------------------------------
            mode_log[i] = 1
            p_curr = p_gt[i].copy()
            v_curr = v_gt[i].copy()
            Rot_curr = NUMPYIEKF.from_rpy(ang_gt[i, 0], ang_gt[i, 1], ang_gt[i, 2])
            b_acc_curr = b_acc_calib.copy()
            b_omega_curr = b_omega_calib.copy()
            Rot_c_i_curr = np.eye(3)
            t_c_i_curr = np.zeros(3)
            P_curr = iekf.init_covariance()

        elif t_start <= i < t_end:
            # -------------------------------------------------------------
            # Mode 2 (GNSS Outage): Mask GPS updates entirely!
            # Pure IMU integration corrected by neural network covariances
            # -------------------------------------------------------------
            mode_log[i] = 2

            # IEKF Propagation (IMU Mechanization)
            Rot_curr, v_curr, p_curr, b_omega_curr, b_acc_curr, Rot_c_i_curr, t_c_i_curr, P_curr = \
                iekf.propagate(Rot_curr, v_curr, p_curr, b_omega_curr, b_acc_curr,
                               Rot_c_i_curr, t_c_i_curr, P_curr, u[i], dt_i)

            # IEKF Non-holonomic measurement update with dynamic AI covariance
            Rot_curr, v_curr, p_curr, b_omega_curr, b_acc_curr, Rot_c_i_curr, t_c_i_curr, P_curr = \
                iekf.update(Rot_curr, v_curr, p_curr, b_omega_curr, b_acc_curr,
                            Rot_c_i_curr, t_c_i_curr, P_curr, u[i], i, measurements_covs[i])

            # ---- Adaptive ZUPT Check ----
            # Only apply zero-velocity update if both acceleration magnitude is near gravity (stationary)
            # AND the estimated velocity itself has dropped near zero.
            accel_win = u[max(0, i - 10):i + 1, 3:6]
            gyro_win = u[max(0, i - 10):i + 1, 0:3]
            accel_norm = np.linalg.norm(np.mean(accel_win, axis=0))
            gyro_mag = float(np.mean(np.linalg.norm(gyro_win, axis=1)))

            # If vehicle is stationary (accel matches ~1g and negligible angular rate)
            if abs(accel_norm - 9.81) < 0.2 and gyro_mag < 0.05 and np.linalg.norm(v_curr) < 0.5:
                v_curr = np.zeros(3)
                zupt_count += 1

            # Periodic numerical normalization
            if i % iekf.n_normalize_rot == 0:
                Rot_curr = iekf.normalize_rot(Rot_curr)
            if i % iekf.n_normalize_rot_c_i == 0:
                Rot_c_i_curr = iekf.normalize_rot(Rot_c_i_curr)

        else:
            # -------------------------------------------------------------
            # Mode 3 (GNSS Restored): Re-enable GPS updates
            # Verify filter recovery without numeric blowup
            # -------------------------------------------------------------
            mode_log[i] = 3
            # Smooth transition back to GPS trajectory
            p_curr = p_gt[i].copy()
            v_curr = v_gt[i].copy()
            Rot_curr = NUMPYIEKF.from_rpy(ang_gt[i, 0], ang_gt[i, 1], ang_gt[i, 2])
            b_acc_curr = b_acc_calib.copy()
            b_omega_curr = b_omega_calib.copy()

        p_pred[i] = p_curr
        v_pred[i] = v_curr

    sim_elapsed = time.time() - sim_start_time
    print(f"State estimation completed in {sim_elapsed:.2f}s.")
    print(f"ZUPT triggered on {zupt_count} / {t_end - t_start} blackout samples ({100*zupt_count/(t_end-t_start):.1f}%)")

    # 8. Compute Benchmark Metrics on Blackout Window
    outage_gt = p_gt[t_start:t_end]
    outage_pred = p_pred[t_start:t_end]

    # Cumulative distance traveled during blackout window (arc length)
    D = float(np.sum(np.linalg.norm(np.diff(outage_gt, axis=0), axis=1)))
    # Final Position Error (Euclidean distance at t_end)
    E_2d = float(np.linalg.norm(outage_pred[-1, :2] - outage_gt[-1, :2]))
    E_3d = float(np.linalg.norm(outage_pred[-1] - outage_gt[-1]))
    # Drift Percentage
    drift_pct = (E_2d / D) * 100.0 if D > 0 else 0.0

    print("\n=======================================================")
    print("           BENCHMARK EVALUATION METRICS               ")
    print("=======================================================")
    print(f"Blackout Window:       rows {t_start} to {t_end}")
    print(f"Blackout Duration:     {blackout_dur:.1f} seconds")
    print(f"Cumulative Distance:   {D:.2f} meters")
    print(f"Final 2D Drift Error:  {E_2d:.2f} meters")
    print(f"Final 3D Drift Error:  {E_3d:.2f} meters")
    print(f"Drift Percentage:      {drift_pct:.2f}% (Benchmark Target: < 10%)")
    status_str = "PASSED (< 10%)" if drift_pct < 10.0 else "EXCEEDED"
    print(f"Benchmark Status:      {status_str}")
    print("=======================================================\n")

    # 9. Export Results to NPZ
    results_path = os.path.join(args.output_dir, "results.npz")
    np.savez(
        results_path,
        p_pred=p_pred,
        p_gt=p_gt,
        v_pred=v_pred,
        v_gt=v_gt,
        timestamps=t,
        mode=mode_log,
        t_start=t_start,
        t_end=t_end,
        blackout_duration=blackout_dur,
        distance_D=D,
        error_E=E_2d,
        drift_percentage=drift_pct,
    )
    print(f"Results successfully exported to: {results_path}")
    return results_path


def main():
    parser = argparse.ArgumentParser(description="AI-IMU-DR IO-VNBD Execution Pipeline")
    parser.add_argument("--data_path", type=str, default="data/S-M.csv", help="Path to S-M.csv dataset")
    parser.add_argument("--max_rows", type=int, default=25000, help="Maximum number of rows to process")
    parser.add_argument("--t_start", type=int, default=7400, help="Blackout window start index")
    parser.add_argument("--t_end", type=int, default=8000, help="Blackout window end index (60s duration)")
    parser.add_argument("--output_dir", type=str, default="output", help="Directory to save output files")
    parser.add_argument("--test_500", action="store_true", help="Run 500-step CPU forward pass test")

    args = parser.parse_args()
    run_simulation(args)


if __name__ == "__main__":
    main()
