"""
Trajectory Plotting and Metric Evaluation Module (Module D)
Ingests simulation outputs from output/results.npz and generates:
1. Benchmark quantitative metrics (D, E, Drift %).
2. High-resolution 2D spatial trajectory plot saved to output/trajectory_drift_plot.png.
"""

import os
import argparse
import numpy as np
import matplotlib.pyplot as plt


def plot_trajectory(results_path="output/results.npz", output_plot_path="output/trajectory_drift_plot.png"):
    if not os.path.exists(results_path):
        raise FileNotFoundError(f"Results file not found at: {results_path}")

    # 1. Load Simulation Results
    data = np.load(results_path)
    p_pred = data["p_pred"]
    p_gt = data["p_gt"]
    timestamps = data["timestamps"]
    mode = data["mode"]
    t_start = int(data["t_start"])
    t_end = int(data["t_end"])

    blackout_dur = float(data["blackout_duration"]) if "blackout_duration" in data else timestamps[t_end] - timestamps[t_start]
    
    # 2. Compute Benchmark Metrics
    outage_gt = p_gt[t_start:t_end]
    outage_pred = p_pred[t_start:t_end]

    # Cumulative distance (arc length)
    D = float(np.sum(np.linalg.norm(np.diff(outage_gt, axis=0), axis=1)))
    # Final 2D Euclidean position error at t_end
    E_2d = float(np.linalg.norm(outage_pred[-1, :2] - outage_gt[-1, :2]))
    # Drift percentage
    drift_pct = (E_2d / D) * 100.0 if D > 0 else 0.0

    print("=======================================================")
    print("           EVALUATION METRIC SUMMARY                   ")
    print("=======================================================")
    print(f"Results File:          {results_path}")
    print(f"Blackout Window:       Timesteps [{t_start}:{t_end}]")
    print(f"Blackout Duration:     {blackout_dur:.1f} seconds")
    print(f"Distance Traveled (D): {D:.2f} meters")
    print(f"Final Drift Error (E): {E_2d:.2f} meters")
    print(f"Drift Percentage:      {drift_pct:.2f}%")
    print("=======================================================")

    # 3. Create 2D Trajectory Plot
    plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")
    fig, ax = plt.subplots(figsize=(12, 9), dpi=300)

    # Mode 1: Pre-blackout trajectory (Green)
    ax.plot(p_gt[:t_start, 0], p_gt[:t_start, 1], color="#2ca02c", linewidth=2.5, label="Mode 1: Normal GNSS-Aided Trajectory")

    # Mode 2: Ground Truth Blackout Path (Gray Dashed)
    ax.plot(p_gt[t_start:t_end, 0], p_gt[t_start:t_end, 1], color="#7f7f7f", linestyle="--", linewidth=2.5, label="Mode 2: Ground Truth Outage (Tunnel)")

    # Mode 2: AI Dead Reckoning Estimated Path (Red)
    ax.plot(p_pred[t_start:t_end, 0], p_pred[t_start:t_end, 1], color="#d62728", linewidth=2.5, label="Mode 2: AI-IMU-DR Predicted Trajectory")

    # Mode 3: Post-blackout trajectory (Green)
    if len(p_gt) > t_end:
        ax.plot(p_gt[t_end:, 0], p_gt[t_end:, 1], color="#2ca02c", linewidth=2.5, linestyle=":", label="Mode 3: Restored GNSS Trajectory")

    # Key Landmark Markers
    ax.scatter(p_gt[0, 0], p_gt[0, 1], marker="o", color="#1f77b4", s=100, zorder=5, label="Trip Origin (0,0)")
    ax.scatter(p_gt[t_start, 0], p_gt[t_start, 1], marker="X", color="#ff7f0e", s=130, zorder=5, label="Blackout Start (GNSS Lost)")
    ax.scatter(p_gt[t_end - 1, 0], p_gt[t_end - 1, 1], marker="P", color="#2ca02c", s=130, zorder=5, label="Blackout End (GNSS Restored - GT)")
    ax.scatter(p_pred[t_end - 1, 0], p_pred[t_end - 1, 1], marker="*", color="#d62728", s=180, zorder=5, label="Blackout End (Predicted)")

    # Connect final predicted position to ground truth with error bar line
    ax.plot([outage_pred[-1, 0], outage_gt[-1, 0]], [outage_pred[-1, 1], outage_gt[-1, 1]], color="black", linestyle=":", linewidth=1.5, label=f"Final Drift Vector (E = {E_2d:.1f} m)")

    # Titles and labels
    ax.set_title("AI-IMU Dead Reckoning Trajectory & Blackout Evaluation\n(IO-VNBD Vehicle Dataset: S-M.csv)", fontsize=14, fontweight="bold", pad=12)
    ax.set_xlabel("Local East [X] (meters)", fontsize=12, labelpad=8)
    ax.set_ylabel("Local North [Y] (meters)", fontsize=12, labelpad=8)
    ax.grid(True, linestyle="--", alpha=0.6)
    ax.legend(loc="upper right", frameon=True, framealpha=0.9, facecolor="white", fontsize=9.5)

    # Dynamic metrics information card
    status_label = "PASSED (< 10%)" if drift_pct < 10.0 else f"Target: < 10%"
    info_text = (
        f"Blackout Duration: {blackout_dur:.1f} s\n"
        f"Distance Traveled: {D:.1f} m\n"
        f"Final Drift Error: {E_2d:.2f} m\n"
        f"Drift Percentage: {drift_pct:.2f}% ({status_label})"
    )
    props = dict(boxstyle="round,pad=0.6", facecolor="#f8f9fa", edgecolor="#343a40", alpha=0.95, linewidth=1.2)
    ax.text(0.03, 0.05, info_text, transform=ax.transAxes, fontsize=11, fontweight="semibold", verticalalignment="bottom", bbox=props)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_plot_path), exist_ok=True)
    plt.tight_layout()
    plt.savefig(output_plot_path, dpi=300)
    plt.close()

    print(f"\nPlot successfully saved to: {output_plot_path}")
    return output_plot_path, D, E_2d, drift_pct


def main():
    parser = argparse.ArgumentParser(description="AI-IMU-DR Trajectory and Drift Plotter")
    parser.add_argument("--results_path", type=str, default="output/results.npz", help="Path to results.npz")
    parser.add_argument("--output_plot", type=str, default="output/trajectory_drift_plot.png", help="Path to save plot PNG")
    args = parser.parse_args()

    plot_trajectory(results_path=args.results_path, output_plot_path=args.output_plot)


if __name__ == "__main__":
    main()
