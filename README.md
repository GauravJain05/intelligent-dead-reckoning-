# Intelligent Dead Reckoning (IDR) for GNSS-Denied Navigation
*AI/ML-Driven State Estimation Prototype for Smart Mobility — SIH Stage 1 Proof of Concept (PS ID: 26168)*

<sub>Live at: <a href="https://intelligent-dead-reckoning-1jkyqj0kl.vercel.app">NavNirantar</a></sub>
---

## 1. Project Overview

This repository implements a functional Stage 1 Proof of Concept (PoC) for an **AI-based Intelligent Dead Reckoning (IDR)** system engineered to maintain high-accuracy vehicular navigation across GNSS-denied or degraded environments (such as urban canyons, tunnels, and underpasses).

Built upon an **Invariant Extended Kalman Filter (IEKF)** coupled with a 1D Convolutional Neural Network (**MesNet**), the pipeline:
* Ingests consumer smartphone IMU and GNSS logs from the **IO-VNBD** (Indoor/Outdoor Vehicle Navigation Benchmark Dataset).
* Converts geodetic coordinates to local Cartesian East-North-Up (ENU) coordinates.
* Filters chassis vibration via a Butterworth low-pass filter.
* Executes a **3-mode simulation**:
  1. **Mode 1 (GNSS Available):** Uses ground truth GPS to constrain state estimates and calibrate accelerometer/gyroscope biases.
  2. **Mode 2 (GNSS Outage):** Masks GPS completely, performing inertial dead reckoning using IEKF mechanization corrected by dynamic neural network covariance predictions.
  3. **Mode 3 (GNSS Restored):** Re-enables GPS updates, verifying seamless filter convergence without numerical instability.

---

## 2. Setup Instructions

### Prerequisites
* Python 3.8+ (tested up to Python 3.13)
* Git

### Virtual Environment Setup

1. **Clone the repository and enter the directory:**
   ```bash
   git clone [https://github.com/GauravJain05/intelligent-dead-reckoning-.git](https://github.com/GauravJain05/intelligent-dead-reckoning-.git)
   cd intelligent-dead-reckoning-
   ```

2. **Create and activate a virtual environment:**
   * **Windows (PowerShell):**
     ```powershell
     python -m venv venv
     .\venv\Scripts\Activate.ps1
     ```
   * **Linux / macOS:**
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

---

## 3. Running the Pipeline (Inference & Evaluation)

### Step 1: Run the Blackout Simulation
Execute the primary 3-mode evaluation script on the default `S-M.csv` test track:
```bash
python src/main_iovnbd.py
```
> **Note:** The simulation currently runs with untrained baseline weights, establishing the uncalibrated inertial drift baseline on the test track.

### Step 2: Evaluate Drift and Plot Trajectory
Generate the quantitative benchmark metrics and the 2D spatial trajectory map:
```bash
python src/plot_evaluation.py
```

### Generated Artifacts
Check the `output/` directory for the exported outputs:
* `output/results.npz`: Compressed NumPy archive containing predicted positions (`p_pred`), ground truth (`p_gt`), timestamps, operational modes, and drift metrics.
* `output/trajectory_drift_plot.png`: High-resolution 2D trajectory visualization displaying:
  * Normal GNSS trajectory (Green)
  * Ground truth blackout path (Dashed Gray)
  * AI Dead Reckoning trajectory (Red)
  * Landmark markers and dynamic metric summary card (Blackout Duration, Cumulative Distance, Final Error E, Drift %)

## 4. Running the Interactive Dashboard (Frontend & API)

We have built a modern React dashboard to visualize the 2D vehicle trajectory, active operational modes, and real-time drift telemetry, powered by a FastAPI backend.

### Step 1: Start the Backend API
From the root directory, start the FastAPI server to serve the telemetry data:
```bash
pip install fastapi uvicorn
uvicorn api:app --reload --port 8000
```
*The API will run at `http://localhost:8000` and serve telemetry endpoints bridging `output/results.npz`.*

### Step 2: Start the React Frontend
Open a new terminal window, navigate to the `frontend` directory, and start the Vite development server:
```bash
cd frontend
npm install
npm run dev
```
*The dashboard will be available in your browser (usually at `http://localhost:5173`). It features a fully responsive design, a mobile device simulator toggle, a dark-mode Cartesian tracking map, and an interactive 3D WebGL tunnel sequence.*

---

## 5. Team Action Items & Next Steps

### 📂 Dataset Team
* **Full Ingestion:** Download the complete categorized IO-VNBD dataset into the `data/` folder (encompassing diverse driving sessions, vehicle types, and mounting positions).
* **Recursive Dataloader:** Extend `src/dataset_iovnbd.py` with a recursive directory scanner (e.g., using `glob.glob` or `os.walk`) so nested subfolders of CSVs are automatically discovered and partitioned into training and validation splits.

### 🧠 ML Team
* **Model Training:** Resolve the parameter import typo in `src/run_train.py` (import `IOVNBParameters` instead of `TorchIEKFParameters` from `iekf`) and train `MesNet` and `InitProcessCovNet` on the full multi-sequence IO-VNBD dataset.
* **Weights Export:** Save the converged model weights to `results/iekfnets.p`.
* **Drift Benchmark:** Wire the trained weights into `src/main_iovnbd.py` to replace baseline initialization, driving translational blackout drift below the < 10% benchmark target.

### 💻 Frontend Team
* **Completed:** Constructed a modern, responsive React dashboard visualizing the 2D vehicle trajectory, active operational mode, and drift telemetry.
* **Completed:** Implemented a FastAPI backend bridging `results.npz` outputs to the client.
* **Next Steps:** Integrate real-time WebSockets to stream incoming sensor data continuously during live hardware tests, and expand the 3D WebGL visualizations.
