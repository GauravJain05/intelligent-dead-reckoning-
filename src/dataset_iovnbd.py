"""
IO-VNBD Dataloader Module (Module B)
Parses the smartphone CSV dataset (e.g. S-M.csv) and formats it into PyTorch tensors
compatible with the ai-imu-dr architecture.
"""

import os
import sys
import numpy as np
import pandas as pd
import scipy.signal
import torch
from torch.utils.data import Dataset

# Ensure src directory is on sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from geo_transform import gps_to_enu


class IOVNBDataset(Dataset):
    """
    PyTorch Dataset for IO-VNBD smartphone vehicle trip data.
    """
    def __init__(self, csv_path="data/S-M.csv", max_rows=None, low_pass_cutoff=5.0):
        super(IOVNBDataset, self).__init__()
        
        # Fallback to root if data/ does not exist
        if not os.path.exists(csv_path):
            alt_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "S-M.csv")
            if os.path.exists(alt_path):
                csv_path = alt_path
            elif os.path.exists("S-M.csv"):
                csv_path = "S-M.csv"
            else:
                raise FileNotFoundError(f"Cannot find dataset file at {csv_path}")

        self.csv_path = csv_path
        self.max_rows = max_rows
        self.low_pass_cutoff = low_pass_cutoff
        
        # Load and preprocess
        self._load_and_preprocess()

    @staticmethod
    def _find_col(columns, keywords):
        for c in columns:
            c_clean = c.strip().upper()
            if all(k.upper() in c_clean for k in keywords):
                return c
        return None

    def _load_and_preprocess(self):
        # 1. Read CSV with Latin-1 encoding to support special characters
        df = pd.read_csv(self.csv_path, nrows=self.max_rows, encoding="latin-1")
        df.columns = df.columns.str.strip()
        cols = list(df.columns)

        # 2. Dynamically match columns
        time_col = self._find_col(cols, ["TIME", "START"]) or self._find_col(cols, ["TIME"])
        lat_col = self._find_col(cols, ["LAT"])
        lon_col = self._find_col(cols, ["LON"])
        alt_col = self._find_col(cols, ["ALT"])
        speed_col = self._find_col(cols, ["SPEED"])
        bearing_col = self._find_col(cols, ["GPS", "ORIENT"]) or self._find_col(cols, ["BEAR"])

        ax_col = self._find_col(cols, ["ACCEL", "X"])
        ay_col = self._find_col(cols, ["ACCEL", "Y"])
        az_col = self._find_col(cols, ["ACCEL", "Z"])

        gx_col = self._find_col(cols, ["GYRO", "ROLL"]) or self._find_col(cols, ["GYRO", "X"])
        gy_col = self._find_col(cols, ["GYRO", "PITCH"]) or self._find_col(cols, ["GYRO", "Y"])
        gz_col = self._find_col(cols, ["GYRO", "YAW"]) or self._find_col(cols, ["GYRO", "Z"])

        required_cols = [ax_col, ay_col, az_col, gx_col, gy_col, gz_col, lat_col, lon_col]
        if any(c is None for c in required_cols):
            raise KeyError(f"Could not resolve all required columns. Detected: ax={ax_col}, ay={ay_col}, "
                           f"az={az_col}, gx={gx_col}, gy={gy_col}, gz={gz_col}, lat={lat_col}, lon={lon_col}")

        # 3. Handle Timestamps and unwrapping potential app resets
        if time_col is not None:
            t_raw = df[time_col].values.astype(np.float64)
            # Check for negative jumps (sensor app resets)
            diffs = np.diff(t_raw, prepend=t_raw[0])
            resets = np.where(diffs < 0)[0]
            for r_idx in resets:
                offset = t_raw[r_idx - 1] - t_raw[r_idx] + 100.0  # 100ms standard step
                t_raw[r_idx:] += offset
            # Convert milliseconds to seconds relative to start
            timestamps = (t_raw - t_raw[0]) / 1000.0
        else:
            timestamps = np.arange(len(df), dtype=np.float64) * 0.1

        # 4. Handle GPS position interpolation between true fixes
        # Raw phone GPS logs repeat positions until a new fix arrives; linear interpolation reconstructs the true path.
        lat_s = df[lat_col].copy()
        lon_s = df[lon_col].copy()
        alt_s = df[alt_col].copy() if alt_col is not None else pd.Series(np.zeros(len(df)))

        fix_changed = (lat_s.diff() != 0) | (lon_s.diff() != 0)
        fix_changed.iloc[0] = True

        lat_interp = lat_s.where(fix_changed).interpolate(method="linear").bfill().ffill().values.astype(np.float64)
        lon_interp = lon_s.where(fix_changed).interpolate(method="linear").bfill().ffill().values.astype(np.float64)
        alt_interp = alt_s.where(fix_changed).interpolate(method="linear").bfill().ffill().values.astype(np.float64)

        # 5. Extract Accelerometer and apply Butterworth Low-Pass Filter
        ax = df[ax_col].interpolate().bfill().ffill().values.astype(np.float64)
        ay = df[ay_col].interpolate().bfill().ffill().values.astype(np.float64)
        az = df[az_col].interpolate().bfill().ffill().values.astype(np.float64)

        dt_median = float(np.median(np.diff(timestamps))) if len(timestamps) > 1 else 0.1
        if dt_median <= 0:
            dt_median = 0.1
        fs = 1.0 / dt_median

        nyquist = fs / 2.0
        cutoff = min(self.low_pass_cutoff, 0.9 * nyquist)
        if len(ax) > 15:
            b, a = scipy.signal.butter(2, cutoff, fs=fs, btype="low")
            ax = scipy.signal.filtfilt(b, a, ax, axis=0)
            ay = scipy.signal.filtfilt(b, a, ay, axis=0)
            az = scipy.signal.filtfilt(b, a, az, axis=0)

        # 6. Extract Gyroscope (normalize to rad/s if needed)
        gx = df[gx_col].interpolate().bfill().ffill().values.astype(np.float64)
        gy = df[gy_col].interpolate().bfill().ffill().values.astype(np.float64)
        gz = df[gz_col].interpolate().bfill().ffill().values.astype(np.float64)

        if "DEG" in gx_col.upper() or np.nanmax(np.abs(gx)) > 15.0:
            gx = np.deg2rad(gx)
            gy = np.deg2rad(gy)
            gz = np.deg2rad(gz)

        # 7. Convert GPS Coordinates to local Cartesian ENU
        gt_p = gps_to_enu(lat_interp, lon_interp, alt_interp)

        # 8. Compute Ground Truth Velocity (gt_v) via finite differences of gt_p
        if len(timestamps) > 1:
            gt_v = np.gradient(gt_p, timestamps, axis=0)
        else:
            gt_v = np.zeros_like(gt_p)

        # 9. Extract Ground Truth Attitude [roll, pitch, yaw] in radians
        # Roll and pitch from gravity acceleration; yaw from ground-truth velocity course
        roll = np.arctan2(-ay, az)
        pitch = np.arctan2(ax, np.sqrt(ay**2 + az**2))

        speed_xy = np.linalg.norm(gt_v[:, :2], axis=1)
        yaw = np.zeros(len(df), dtype=np.float64)
        for i in range(len(df)):
            if speed_xy[i] > 0.5:
                yaw[i] = np.arctan2(gt_v[i, 1], gt_v[i, 0])
            elif i > 0:
                yaw[i] = yaw[i - 1]
            else:
                yaw[i] = 0.0

        yaw = np.unwrap(yaw)
        ang_gt = np.column_stack((roll, pitch, yaw))

        # 10. Construct IMU input tensor u: [gx, gy, gz, ax, ay, az]
        u = np.column_stack((gx, gy, gz, ax, ay, az)).astype(np.float64)

        # Store as PyTorch Tensors
        self.u = torch.from_numpy(u).double()
        self.gt_p = torch.from_numpy(gt_p).double()
        self.gt_v = torch.from_numpy(gt_v).double()
        self.ang_gt = torch.from_numpy(ang_gt).double()
        self.timestamps = torch.from_numpy(timestamps).double()
        self.N = len(df)

    def __len__(self):
        return self.N

    def __getitem__(self, idx):
        return {
            "u": self.u[idx],
            "gt_p": self.gt_p[idx],
            "gt_v": self.gt_v[idx],
            "ang_gt": self.ang_gt[idx],
            "timestamp": self.timestamps[idx],
        }

    def get_data(self, to_numpy=True):
        if to_numpy:
            return (
                self.timestamps.numpy(),
                self.ang_gt.numpy(),
                self.gt_p.numpy(),
                self.gt_v.numpy(),
                self.u.numpy(),
            )
        return self.timestamps, self.ang_gt, self.gt_p, self.gt_v, self.u


if __name__ == "__main__":
    print("Testing IOVNBDataset loading first 500 rows...")
    dataset = IOVNBDataset(max_rows=500)
    
    print(f"Loaded {len(dataset)} rows successfully.")
    assert dataset.u.shape == (500, 6), f"Expected u shape (500, 6), got {dataset.u.shape}"
    assert dataset.gt_p.shape == (500, 3), f"Expected gt_p shape (500, 3), got {dataset.gt_p.shape}"
    assert dataset.gt_v.shape == (500, 3), f"Expected gt_v shape (500, 3), got {dataset.gt_v.shape}"
    assert dataset.ang_gt.shape == (500, 3), f"Expected ang_gt shape (500, 3), got {dataset.ang_gt.shape}"
    assert dataset.timestamps.shape == (500,), f"Expected timestamps shape (500,), got {dataset.timestamps.shape}"
    
    print("All tensor dimension assertions passed successfully!")
