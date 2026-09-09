# PROJECT-HANDOFF.md: AI-ML Dead Reckoning Prototype (IO-VNBD + AI-IMU-DR)

## 1. Project Goal & Deliverable Scope
* **Target Objective:** Build a functional Python Proof of Concept (PoC) for SIH Stage 1 screening.
* **Core Functionality:** Ingest a real smartphone vehicle trip from the IO-VNBD dataset (`S-M.csv`), simulate a GNSS blackout window, run AI-enhanced dead reckoning (using `mbrossar/ai-imu-dr` as the algorithmic core), and output a 2D trajectory plot comparing predicted trajectory against GPS ground truth while computing translational drift percentage (<10% benchmark).
* **Execution Environment:** Python 3.8+ running locally or in Google Colab.

---

## 2. Environment & Dependency Setup
1. **Repository Structure:**
   * Target directory structure to be achieved on the local machine:
     ```text
     ai-imu-dr/
     ├── data/
     │   └── S-M.csv                  # Raw IO-VNBD trip data
     ├── src/
     │   ├── dataset_iovnbd.py        # NEW: Custom PyTorch dataset parser
     │   ├── geo_transform.py         # NEW: Geodetic (Lat/Lon) to ENU conversion
     │   ├── main_iovnbd.py           # NEW: Adapted execution & training pipeline
     │   ├── plot_evaluation.py       # NEW: Trajectory & drift metric visualizer
     │   ├── iekf.py                  # BASE: Invariant Extended Kalman Filter
     │   ├── utils_torch_filter.py    # BASE: PyTorch filter utilities
     │   └── ...                      # Other base helper files
     ├── requirements.txt
     └── README.md
     ```
2. **Dependencies (`requirements.txt`):**
   * Specify: `torch`, `numpy`, `scipy`, `pandas`, `matplotlib`, `navpy`, `pymap3d`, `termcolor`.
   * CLI Task: Generate `requirements.txt` and execute `pip install -r requirements.txt`.

---

## 3. Module Specifications

### Module A: Geodetic Conversion (`src/geo_transform.py`)
* **Purpose:** The neural network and Kalman filter operate on metric Cartesian grids (X, Y, Z in meters). Spherical GPS coordinates (`Latitude`, `Longitude`, `Altitude`) must be projected onto a local flat plane.
* **Requirements:**
  1. Define function `gps_to_enu(lat_array, lon_array, alt_array=None)`.
  2. Use the first valid GPS coordinate of the trip as the reference origin (`lat0, lon0, alt0`).
  3. Use `pymap3d.geodetic2enu` to convert the entire array into local East, North, Up (E, N, U) meters.
  4. Return a NumPy array of shape `(N, 3)` representing ground truth 3D metric positions.

### Module B: IO-VNBD Dataloader (`src/dataset_iovnbd.py`)
* **Purpose:** Parse the 10Hz smartphone CSV (`S-M.csv`) and format it into PyTorch tensors compatible with `ai-imu-dr`.
* **Input CSV Specifications:**
  * File: `data/S-M.csv`.
  * Dynamically inspect headers for:
    * Timestamp column.
    * 3-axis Accelerometer (`ax`, `ay`, `az` in m/s^2).
    * 3-axis Gyroscope (`gx`, `gy`, `gz` in rad/s or deg/s; normalize to rad/s).
    * GPS Coordinates (`latitude`, `longitude`, `speed`, `bearing`).
* **Requirements:**
  1. Create class `IOVNBDataset(torch.utils.data.Dataset)`.
  2. **Preprocessing:**
     * Handle missing/NaN values via linear interpolation.
     * Ensure sampling rate consistency (dt ≈ 0.1s for 10Hz).
     * Apply a light low-pass filter (`scipy.signal.butter` cutoff 5Hz) on raw accelerometer columns to reduce high-frequency chassis vibration.
  3. **Outputs Required by Model:**
     * `u` (IMU inputs): Tensor of shape `(N, 6)` containing `[gx, gy, gz, ax, ay, az]`.
     * `gt_p` (Ground Truth Position): Tensor of shape `(N, 3)` from `geo_transform.py`.
     * `gt_v` (Ground Truth Velocity): Derived either from GPS speed/bearing or finite differences of `gt_p` with respect to dt.
     * `timestamps`: 1D array of shape `(N,)`.

### Module C: Execution & Outage Simulation Pipeline (`src/main_iovnbd.py`)
* **Purpose:** Run the state estimation loop, simulate GNSS dropout, and trigger the dead reckoning engine.
* **Requirements:**
  1. Adapt the execution flow from `src/main_kitti.py`.
  2. Load the dataset using `IOVNBDataset`.
  3. Initialize the neural network adapter and the Invariant Extended Kalman Filter (`iekf.py`).
  4. **Implement GNSS Blackout Simulation:**
     * Define blackout parameter: e.g., rows t_start to t_end (a 60–90 second window).
     * **Mode 1 (GNSS Available):** Update state with ground-truth GPS positions to initialize and constrain filter drift.
     * **Mode 2 (GNSS Outage):** Mask GPS updates entirely. The system must update position solely through IMU double integration corrected by the neural network noise covariance predictions.
     * **Mode 3 (GNSS Restored):** Re-enable GPS updates and verify filter recovery without numeric blowup.
  5. Log the estimated positions `[X_pred, Y_pred, Z_pred]` versus ground truth `[X_gt, Y_gt, Z_gt]` at every timestep.

### Module D: Metric Calculation & Trajectory Plotting (`src/plot_evaluation.py`)
* **Purpose:** Provide the visual proof of work and quantitative benchmark required by SIH.
* **Requirements:**
  1. **Compute Benchmark Metrics:**
     * **Cumulative Distance (D):** Total arc length traveled during the blackout window.
     * **Final Position Error (E):** Euclidean distance between predicted and ground-truth positions at t_end.
     * **Drift Percentage:** `(E / D) * 100%`.
  2. **Generate Trajectory Plot (`matplotlib`):**
     * 2D spatial plot (X [meters] vs Y [meters]).
     * Green path: Normal GNSS-aided trajectory.
     * Gray/Dashed path: Actual ground truth path during the tunnel/blackout.
     * Red path: AI Dead Reckoning predicted trajectory during the blackout.
     * Dynamic text box on plot showing:
       * `Blackout Duration: X seconds`
       * `Distance Traveled: Y meters`
       * `Final Drift Error: Z meters`
       * `Drift Percentage: W% (Target: < 10%)`
  3. Save the final figure to `output/trajectory_drift_plot.png`.

---

## 4. Step-by-Step CLI Execution Instructions

1. **Inspect Data:**
   * Script: Read first 10 rows of `data/S-M.csv` and print detected column names and sampling rate.
2. **Build Utilities:**
   * Create `src/geo_transform.py` and write unit tests confirming `(Lat_0, Lon_0) -> (0, 0)`.
3. **Construct Dataset:**
   * Create `src/dataset_iovnbd.py`. Test loading the first 500 rows and assert PyTorch tensor dimensions.
4. **Adapt Core Pipeline:**
   * Create `src/main_iovnbd.py`. Import filter classes from base repo, connect IO-VNBD dataset, and run a CPU forward-pass test on 500 timesteps.
5. **Run Full Inference & Simulation:**
   * Execute full run on `S-M.csv`, apply blackout window, and export coordinate arrays to `output/results.npz`.
6. **Generate Final Artifacts:**
   * Run `src/plot_evaluation.py` on `output/results.npz`. Verify `output/trajectory_drift_plot.png` is generated with metrics clearly stamped.