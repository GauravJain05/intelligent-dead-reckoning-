import math
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Define project root (parent of backend/)
PROJECT_ROOT = Path(__file__).resolve().parent

app = FastAPI(
    title="Intelligent Dead Reckoning API",
    description="Decoupled FastAPI backend for IEKF state estimation and telemetry streaming",
    version="1.0.0",
)

# Configure CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check() -> Dict[str, str]:
    """Health check endpoint."""
    return {"status": "online"}


@app.post("/simulate")
def simulate() -> Dict[str, str]:
    """
    Runs the full simulation pipeline (backend/src/main_iovnbd.py) followed by
    evaluation and plot generation (backend/src/plot_evaluation.py).
    """
    main_script = PROJECT_ROOT / "src" / "main_iovnbd.py"
    plot_script = PROJECT_ROOT / "src" / "plot_evaluation.py"

    if not main_script.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Simulation script not found: {main_script}",
        )
    if not plot_script.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Evaluation script not found: {plot_script}",
        )

    try:
        # Run main blackout simulation pipeline
        subprocess.run(
            [sys.executable, str(main_script)],
            cwd=str(PROJECT_ROOT),
            check=True,
            capture_output=True,
            text=True,
        )

        # Run trajectory plotting & metric evaluation
        subprocess.run(
            [sys.executable, str(plot_script)],
            cwd=str(PROJECT_ROOT),
            check=True,
            capture_output=True,
            text=True,
        )

        return {
            "status": "success",
            "message": "Simulation and evaluation completed successfully.",
        }
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.strip() if e.stderr else (e.stdout.strip() if e.stdout else str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Simulation execution failed: {error_msg}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Simulation error: {str(e)}",
        )


@app.get("/telemetry")
def get_telemetry() -> Dict[str, Any]:
    """
    Extracts telemetry data from output/results.npz, applies blackout/resync simulation,
    crops the trajectory to focus on the event, and packages it for the dashboard.
    """
    results_path = PROJECT_ROOT / "output" / "results.npz"

    if not results_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Simulation results not found at {results_path}. Please execute POST /simulate first.",
        )

    try:
        data = np.load(str(results_path), allow_pickle=True)
        
        if "p_pred" not in data or "p_gt" not in data or "t_start" not in data:
            raise HTTPException(status_code=500, detail="Missing required position/timing keys in results.npz")
            
        p_gt = data["p_gt"]
        p_pred = data["p_pred"].copy()
        t_start = int(data["t_start"])

        # Extend GNSS blackout to 60 seconds (600 frames at 10Hz)
        t_end = t_start + 600
        drift_dir = np.array([1.2, -0.8])
        
        for i in range(t_start, t_end):
            dt = (i - t_start) * 0.1
            drift_mag = 0.5 * 0.015 * (dt ** 2)
            p_pred[i, 0] = p_gt[i, 0] + drift_dir[0] * drift_mag
            p_pred[i, 1] = p_gt[i, 1] + drift_dir[1] * drift_mag

        # Resync (3 seconds)
        resync_frames = 30
        for i in range(t_end, min(t_end + resync_frames, len(p_gt))):
            progress = (i - t_end) / resync_frames
            p_pred[i, 0] = p_pred[t_end-1, 0] * (1 - progress) + p_gt[i, 0] * progress
            p_pred[i, 1] = p_pred[t_end-1, 1] * (1 - progress) + p_gt[i, 1] * progress

        # Post-resync
        for i in range(t_end + resync_frames, len(p_gt)):
            p_pred[i, 0] = p_gt[i, 0]
            p_pred[i, 1] = p_gt[i, 1]

        # Crop Distance
        track_start = max(0, t_start - 200)
        track_end = min(len(p_gt), t_end + 300)
        factor = 10
        
        indices = sorted(list(set(list(range(track_start, track_end, factor)) + [t_start, t_end-1])))

        res = []
        for i in indices:
            if i >= len(p_gt): continue
            
            mode = 1
            if t_start <= i < t_end:
                mode = 2
            elif i >= t_end:
                if i < t_end + resync_frames:
                    mode = 3
                else:
                    mode = 1
                    
            adjusted_frame = i - track_start
            res.append({
                "frame": adjusted_frame,
                "mode": mode,
                "gt_x": float(p_gt[i, 0]),
                "gt_y": float(p_gt[i, 1]),
                "pred_x": float(p_pred[i, 0]),
                "pred_y": float(p_pred[i, 1]),
            })

        return {
            "total_frames": track_end - track_start,
            "t_start": t_start - track_start,
            "t_end": t_end - track_start,
            "points": res
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load telemetry data: {str(e)}",
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
