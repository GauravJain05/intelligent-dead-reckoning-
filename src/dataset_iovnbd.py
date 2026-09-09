"""
IO-VNBD Dataloader Module matching the exact CSV columns and IEKF filter format.
"""

import os
import sys
import pickle
import numpy as np
import pandas as pd
import scipy.signal
import torch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from geo_transform import gps_to_enu


class IOVNBDDataset:
    def __init__(self, data_dir=None, low_pass_cutoff=5.0):
        if data_dir is None:
            # Default to ../data or ./data
            cand1 = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
            cand2 = os.path.join(os.getcwd(), "data")
            self.data_dir = cand1 if os.path.isdir(cand1) else (cand2 if os.path.isdir(cand2) else ".")
        else:
            self.data_dir = data_dir

        self.low_pass_cutoff = low_pass_cutoff
        self.data = {}
        self.datasets_train_filter = {}
        self.datasets_validatation_filter = {}

        self._load_all()

    @staticmethod
    def _match_col(cols, patterns):
        for c in cols:
            c_norm = c.upper().strip()
            if all(p.upper() in c_norm for p in patterns):
                return c
        return None

    def _load_csv(self, file_path):
        df = pd.read_csv(file_path, encoding="latin-1")
        df.columns = df.columns.str.strip()
        cols = list(df.columns)

        # 1. Match columns directly from IO-VNBD schema
        c_time = self._match_col(cols, ["TIME", "START"]) or self._match_col(cols, ["TIME"])
        c_lat  = self._match_col(cols, ["GPS", "LAT"]) or self._match_col(cols, ["LAT"])
        c_lon  = self._match_col(cols, ["GPS", "LONG"]) or self._match_col(cols, ["LON"])
        c_alt  = self._match_col(cols, ["GPS", "ALT"]) or self._match_col(cols, ["ALT"])

        c_ax = self._match_col(cols, ["ACCEL", "X"])
        c_ay = self._match_col(cols, ["ACCEL", "Y"])
        c_az = self._match_col(cols, ["ACCEL", "Z"])

        c_gx = self._match_col(cols, ["GYRO", "X"])
        c_gy = self._match_col(cols, ["GYRO", "Y"])
        c_gz = self._match_col(cols, ["GYRO", "Z"])

        c_yaw   = self._match_col(cols, ["ORIENT", "YAW"])
        c_pitch = self._match_col(cols, ["ORIENT", "PITCH"])
        c_roll  = self._match_col(cols, ["ORIENT", "ROLL"])

        # 2. Extract and fix Timestamps
        t_raw = df[c_time].values.astype(np.float64)
        # Unwrap any negative resets
        diffs = np.diff(t_raw, prepend=t_raw[0])
        resets = np.where(diffs < 0)[0]
        for r in resets:
            t_raw[r:] += (t_raw[r-1] - t_raw[r] + 0.1)
        
        # If timestamp is in ms (> 10000), convert to seconds
        if np.nanmean(t_raw) > 5000:
            timestamps = (t_raw - t_raw[0]) / 1000.0
        else:
            timestamps = t_raw - t_raw[0]

        # 3. GPS to Cartesian ENU positions
        lat = df[c_lat].interpolate().bfill().ffill().values.astype(np.float64)
        lon = df[c_lon].interpolate().bfill().ffill().values.astype(np.float64)
        alt = df[c_alt].interpolate().bfill().ffill().values.astype(np.float64) if c_alt else np.zeros(len(df))
        
        gt_p = gps_to_enu(lat, lon, alt)

        # 4. Ground Truth Velocity
        if len(timestamps) > 1:
            gt_v = np.gradient(gt_p, timestamps, axis=0)
        else:
            gt_v = np.zeros_like(gt_p)

        # 5. Filter Accelerometer readings
        ax = df[c_ax].interpolate().bfill().ffill().values.astype(np.float64)
        ay = df[c_ay].interpolate().bfill().ffill().values.astype(np.float64)
        az = df[c_az].interpolate().bfill().ffill().values.astype(np.float64)

        dt_med = float(np.median(np.diff(timestamps))) if len(timestamps) > 1 else 0.1
        fs = 1.0 / (dt_med if dt_med > 0 else 0.1)
        cutoff = min(self.low_pass_cutoff, 0.45 * fs)
        if len(ax) > 15:
            b, a = scipy.signal.butter(2, cutoff, fs=fs, btype="low")
            ax = scipy.signal.filtfilt(b, a, ax, axis=0)
            ay = scipy.signal.filtfilt(b, a, ay, axis=0)
            az = scipy.signal.filtfilt(b, a, az, axis=0)

        # 6. Gyroscope readings (convert deg/s to rad/s if necessary)
        gx = df[c_gx].interpolate().bfill().ffill().values.astype(np.float64)
        gy = df[c_gy].interpolate().bfill().ffill().values.astype(np.float64)
        gz = df[c_gz].interpolate().bfill().ffill().values.astype(np.float64)
        if np.nanmax(np.abs(gx)) > 15.0:
            gx, gy, gz = np.deg2rad(gx), np.deg2rad(gy), np.deg2rad(gz)

        # 7. Ground Truth Attitude [roll, pitch, yaw] in radians
        if c_roll and c_pitch and c_yaw:
            r = np.deg2rad(df[c_roll].interpolate().bfill().ffill().values.astype(np.float64))
            p = np.deg2rad(df[c_pitch].interpolate().bfill().ffill().values.astype(np.float64))
            y = np.unwrap(np.deg2rad(df[c_yaw].interpolate().bfill().ffill().values.astype(np.float64)))
            ang_gt = np.column_stack((r, p, y))
        else:
            r = np.arctan2(-ay, az)
            p = np.arctan2(ax, np.sqrt(ay**2 + az**2))
            y = np.unwrap(np.arctan2(gt_v[:, 1], gt_v[:, 0]))
            ang_gt = np.column_stack((r, p, y))

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
            t, ang, p, v, u = self._load_csv(train_file)
            self.data["S-M"] = (t, ang, p, v, u)
            self.datasets_train_filter["S-M"] = [0, len(t)]

        if os.path.isfile(val_file):
            t, ang, p, v, u = self._load_csv(val_file)
            self.data["S-S1"] = (t, ang, p, v, u)
            self.datasets_validatation_filter["S-S1"] = [0, len(t)]
        elif "S-M" in self.data:
            # Fallback if S-S1 is not yet present
            self.datasets_validatation_filter["S-M"] = [0, len(self.data["S-M"][0])]

    def get_data(self, name):
        return self.data[name]

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
