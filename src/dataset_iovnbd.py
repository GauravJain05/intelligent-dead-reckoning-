"""
IO-VNBD Dataloader Module matching the exact CSV columns and IEKF filter format.
Supports single-trajectory evaluation (main_iovnbd.py) and
multi-sequence training (run_train.py / train_torch_filter.py).
"""

import os
import sys
import pickle
import numpy as np
import pandas as pd
import scipy.signal
import torch
from torch.utils.data import Dataset

# Ensure src directory is on sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from geo_transform import gps_to_enu


class IOVNBDDataset(Dataset):
    """
    PyTorch Dataset for IO-VNBD smartphone vehicle trip data.
    """
    def __init__(self, data_dir=None, csv_path=None, max_rows=None, low_pass_cutoff=5.0):
        super(IOVNBDDataset, self).__init__()

        # Resolve data_dir
        if data_dir is None:
            cand1 = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
            cand2 = os.path.join(os.getcwd(), "data")
            self.data_dir = cand1 if os.path.isdir(cand1) else (cand2 if os.path.isdir(cand2) else ".")
        else:
            self.data_dir = data_dir

        self.csv_path = csv_path
        self.max_rows = max_rows
        self.low_pass_cutoff = low_pass_cutoff

        self.data = {}
        self.datasets_train_filter = {}
        self.datasets_validatation_filter = {}
        self.normalize_factors = None

        if self.csv_path is not None:
            actual_csv = self.csv_path
            if not os.path.exists(actual_csv):
                alt1 = os.path.join(self.data_dir, os.path.basename(self.csv_path))
                alt2 = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), os.path.basename(self.csv_path))
                if os.path.exists(alt1):
                    actual_csv = alt1
                elif os.path.exists(alt2):
                    actual_csv = alt2
                else:
                    raise FileNotFoundError(f"Cannot find dataset file at {self.csv_path}")

            t, ang, p, v, u = self._load_csv(actual_csv, max_rows=self.max_rows)
            seq_name = os.path.splitext(os.path.basename(actual_csv))[0]
            self.data[seq_name] = (t, ang, p, v, u)
            self.datasets_train_filter[seq_name] = [0, len(t)]
            self.datasets_validatation_filter[seq_name] = [0, len(t)]

            self.timestamps = t
            self.ang_gt = ang
            self.gt_p = p
            self.gt_v = v
            self.u = u
            self.N = len(t)

            u_loc = self.u.mean(dim=0)
            u_std = self.u.std(dim=0) + 1e-6
            self.normalize_factors = {'u_loc': u_loc, 'u_std': u_std}
        else:
            self._load_all()

    @staticmethod
    def _match_col(cols, patterns):
        for c in cols:
            c_norm = c.upper().strip()
            if all(p.upper() in c_norm for p in patterns):
                return c
        return None

    def _load_csv(self, file_path, max_rows=None):
        df = pd.read_csv(file_path, nrows=max_rows, encoding="latin-1")
        df.columns = df.columns.str.strip()
        cols = list(df.columns)

        # 1. Match columns directly from IO-VNBD schema
        c_time = self._match_col(cols, ["TIME", "START"]) or self._match_col(cols, ["TIME"])
        c_lat  = self._match_col(cols, ["GPS", "LAT"]) or self._match_col(cols, ["LAT"])
        c_lon  = self._match_col(cols, ["GPS", "LONG"]) or self._match_col(cols, ["GPS", "LON"]) or self._match_col(cols, ["LON"])
        c_alt  = self._match_col(cols, ["GPS", "ALT"]) or self._match_col(cols, ["ALT"])

        c_ax = self._match_col(cols, ["ACCEL", "X"])
        c_ay = self._match_col(cols, ["ACCEL", "Y"])
        c_az = self._match_col(cols, ["ACCEL", "Z"])

        c_gx = self._match_col(cols, ["GYRO", "ROLL"]) or self._match_col(cols, ["GYRO", "X"])
        c_gy = self._match_col(cols, ["GYRO", "PITCH"]) or self._match_col(cols, ["GYRO", "Y"])
        c_gz = self._match_col(cols, ["GYRO", "YAW"]) or self._match_col(cols, ["GYRO", "Z"])

        required_cols = [c_ax, c_ay, c_az, c_gx, c_gy, c_gz, c_lat, c_lon]
        if any(c is None for c in required_cols):
            raise KeyError(
                f"Could not resolve all required columns in {file_path}. "
                f"Detected: ax={c_ax}, ay={c_ay}, az={c_az}, gx={c_gx}, gy={c_gy}, gz={c_gz}, lat={c_lat}, lon={c_lon}"
            )

        # 2. Extract and fix Timestamps
        if c_time is not None:
            t_raw = df[c_time].values.astype(np.float64)
            # Unwrap any negative resets (sensor app resets)
            diffs = np.diff(t_raw, prepend=t_raw[0])
            resets = np.where(diffs < 0)[0]
            for r in resets:
                offset = t_raw[r - 1] - t_raw[r] + 100.0  # 100ms standard step
                t_raw[r:] += offset
            # Convert milliseconds to seconds relative to start
            if np.nanmean(t_raw) > 5000:
                timestamps = (t_raw - t_raw[0]) / 1000.0
            else:
                timestamps = t_raw - t_raw[0]
        else:
            timestamps = np.arange(len(df), dtype=np.float64) * 0.1

        # 3. GPS to Cartesian ENU positions
        # Raw phone GPS logs repeat positions until a new fix arrives; linear interpolation reconstructs the true path.
        lat_s = df[c_lat].copy()
        lon_s = df[c_lon].copy()
        alt_s = df[c_alt].copy() if c_alt is not None else pd.Series(np.zeros(len(df)))

        fix_changed = (lat_s.diff() != 0) | (lon_s.diff() != 0)
        fix_changed.iloc[0] = True

        lat_interp = lat_s.where(fix_changed).interpolate(method="linear").bfill().ffill().values.astype(np.float64)
        lon_interp = lon_s.where(fix_changed).interpolate(method="linear").bfill().ffill().values.astype(np.float64)
        alt_interp = alt_s.where(fix_changed).interpolate(method="linear").bfill().ffill().values.astype(np.float64)

        gt_p = gps_to_enu(lat_interp, lon_interp, alt_interp)

        # 4. Ground Truth Velocity via finite differences of gt_p
        if len(timestamps) > 1:
            gt_v = np.gradient(gt_p, timestamps, axis=0)
        else:
            gt_v = np.zeros_like(gt_p)

        # 5. Extract Accelerometer and apply Butterworth Low-Pass Filter
        ax = df[c_ax].interpolate().bfill().ffill().values.astype(np.float64)
        ay = df[c_ay].interpolate().bfill().ffill().values.astype(np.float64)
        az = df[c_az].interpolate().bfill().ffill().values.astype(np.float64)

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

        # 6. Extract Gyroscope readings (normalize to rad/s if needed)
        gx = df[c_gx].interpolate().bfill().ffill().values.astype(np.float64)
        gy = df[c_gy].interpolate().bfill().ffill().values.astype(np.float64)
        gz = df[c_gz].interpolate().bfill().ffill().values.astype(np.float64)

        if "DEG" in c_gx.upper() or np.nanmax(np.abs(gx)) > 15.0:
            gx = np.deg2rad(gx)
            gy = np.deg2rad(gy)
            gz = np.deg2rad(gz)

        # 7. Ground Truth Attitude [roll, pitch, yaw] in radians
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

        # 8. Construct IMU input tensor u: [gx, gy, gz, ax, ay, az]
        u = np.column_stack((gx, gy, gz, ax, ay, az)).astype(np.float64)

        return (
            torch.from_numpy(timestamps).double(),
            torch.from_numpy(ang_gt).double(),
            torch.from_numpy(gt_p).double(),
            torch.from_numpy(gt_v).double(),
            torch.from_numpy(u).double()
        )

    def _load_all(self):
        train_file = os.path.join(self.data_dir, "S-M.csv")
        val_file = os.path.join(self.data_dir, "S-S1.csv")

        if os.path.isfile(train_file):
            t, ang, p, v, u = self._load_csv(train_file, max_rows=self.max_rows)
            self.data["S-M"] = (t, ang, p, v, u)
            self.datasets_train_filter["S-M"] = [0, len(t)]
            self.timestamps = t
            self.ang_gt = ang
            self.gt_p = p
            self.gt_v = v
            self.u = u
            self.N = len(t)

        if os.path.isfile(val_file):
            t, ang, p, v, u = self._load_csv(val_file, max_rows=self.max_rows)
            self.data["S-S1"] = (t, ang, p, v, u)
            self.datasets_validatation_filter["S-S1"] = [0, len(t)]
        elif "S-M" in self.data:
            # Fallback if S-S1 is not yet present
            self.datasets_validatation_filter["S-M"] = [0, len(self.data["S-M"][0])]

        all_u = [self.data[k][4] for k in self.datasets_train_filter.keys()]
        if all_u:
            concat_u = torch.cat(all_u, dim=0)
            u_loc = concat_u.mean(dim=0)
            u_std = concat_u.std(dim=0) + 1e-6
            self.normalize_factors = {'u_loc': u_loc, 'u_std': u_std}

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

    def get_data(self, name=None, to_numpy=None):
        if isinstance(name, bool):
            to_numpy = name
            name = None

        if name is not None:
            if name in self.data:
                t, ang, p, v, u = self.data[name]
            elif isinstance(name, int) and 0 <= name < len(self.data):
                k = list(self.data.keys())[name]
                t, ang, p, v, u = self.data[k]
            else:
                raise KeyError(f"Dataset sequence '{name}' not found.")

            if to_numpy is True:
                return (
                    t.detach().cpu().numpy(),
                    ang.detach().cpu().numpy(),
                    p.detach().cpu().numpy(),
                    v.detach().cpu().numpy(),
                    u.detach().cpu().numpy(),
                )
            return t, ang, p, v, u

        # Default sequence (e.g. main_iovnbd.py evaluation)
        if to_numpy is False:
            return self.timestamps, self.ang_gt, self.gt_p, self.gt_v, self.u
        return (
            self.timestamps.detach().cpu().numpy(),
            self.ang_gt.detach().cpu().numpy(),
            self.gt_p.detach().cpu().numpy(),
            self.gt_v.detach().cpu().numpy(),
            self.u.detach().cpu().numpy(),
        )

    def add_noise(self, u):
        return u + torch.randn_like(u) * 1e-3

    @staticmethod
    def dump(obj, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(obj, f)

    @staticmethod
    def load(path):
        with open(path, "rb") as f:
            return pickle.load(f)


# Backward compatibility alias
IOVNBDataset = IOVNBDDataset


if __name__ == "__main__":
    print("Testing IOVNBDDataset loading first 500 rows...")
    dataset = IOVNBDDataset(max_rows=500)

    print(f"Loaded {len(dataset)} rows successfully.")
    assert dataset.u.shape == (500, 6), f"Expected u shape (500, 6), got {dataset.u.shape}"
    assert dataset.gt_p.shape == (500, 3), f"Expected gt_p shape (500, 3), got {dataset.gt_p.shape}"
    assert dataset.gt_v.shape == (500, 3), f"Expected gt_v shape (500, 3), got {dataset.gt_v.shape}"
    assert dataset.ang_gt.shape == (500, 3), f"Expected ang_gt shape (500, 3), got {dataset.ang_gt.shape}"
    assert dataset.timestamps.shape == (500,), f"Expected timestamps shape (500,), got {dataset.timestamps.shape}"

    print("All tensor dimension assertions passed successfully!")
