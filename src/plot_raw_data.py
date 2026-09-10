"""
plot_raw_data.py
-----------------
Sanity-check script: loads the IO-VNBD smartphone CSV (S-S1.csv) and plots:
1. GPS ground-truth path (latitude vs longitude)
2. Raw accelerometer signals (X, Y, Z) over time
3. Raw gyroscope signals (Yaw, Pitch, Roll) over time

Run this from the project root:
    python src/plot_raw_data.py
"""

import os
import pandas as pd
import matplotlib.pyplot as plt

# ---- 1. Load the data ----
DATA_PATH = "data/S-S1.csv"
OUTPUT_DIR = "results"

# encoding="latin1" is required -- this CSV contains a degree symbol (°)
# in some column headers, which is not valid UTF-8 and will crash a
# plain pd.read_csv(DATA_PATH) call.
df = pd.read_csv(DATA_PATH, encoding="latin1")

# Clean up column names (remove extra spaces, standardize)
df.columns = [c.strip() for c in df.columns]

# Make sure the output folder exists before we try to save anything into it
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("Columns found in CSV:")
print(df.columns.tolist())
print(f"\nTotal rows: {len(df)}")
print(df.head())

# ---- 2. Plot GPS ground-truth path ----
plt.figure(figsize=(8, 6))
plt.plot(df["GPS LONGITUDE (degrees)"], df["GPS LATITUDE (degrees)"], linewidth=1)
plt.xlabel("Longitude")
plt.ylabel("Latitude")
plt.title("GPS Ground Truth Path (Session S1)")
plt.grid(True)
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "gps_path.png"), dpi=150)
plt.show()

# ---- 3. Plot raw accelerometer signals ----
time_axis = df["TIME SINCE START (ms)"] / 1000.0  # convert ms -> seconds

fig, axs = plt.subplots(3, 1, figsize=(10, 8), sharex=True)
axs[0].plot(time_axis, df["ACCELEROMETER X (m/s\u00b2)"], color="r")
axs[0].set_ylabel("Accel X (m/s\u00b2)")
axs[1].plot(time_axis, df["ACCELEROMETER Y (m/s\u00b2)"], color="g")
axs[1].set_ylabel("Accel Y (m/s\u00b2)")
axs[2].plot(time_axis, df["ACCELEROMETER Z (m/s\u00b2)"], color="b")
axs[2].set_ylabel("Accel Z (m/s\u00b2)")
axs[2].set_xlabel("Time (s)")
fig.suptitle("Raw Accelerometer Signals (Session S1)")
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "accelerometer_raw.png"), dpi=150)
plt.show()

# ---- 4. Plot raw gyroscope signals ----
fig, axs = plt.subplots(3, 1, figsize=(10, 8), sharex=True)
axs[0].plot(time_axis, df["GYROSCOPE Yaw (rad/s)"], color="r")
axs[0].set_ylabel("Gyro Yaw (rad/s)")
axs[1].plot(time_axis, df["GYROSCOPE Pitch (rad/s)"], color="g")
axs[1].set_ylabel("Gyro Pitch (rad/s)")
axs[2].plot(time_axis, df["GYROSCOPE Roll (rad/s)"], color="b")
axs[2].set_ylabel("Gyro Roll (rad/s)")
axs[2].set_xlabel("Time (s)")
fig.suptitle("Raw Gyroscope Signals (Session S1)")
plt.tight_layout()
plt.savefig(os.path.join(OUTPUT_DIR, "gyroscope_raw.png"), dpi=150)
plt.show()

print("\nDone. Plots saved in results/ folder.")