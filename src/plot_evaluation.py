"""
Plotting and Visualization Module for AI-IMU Dead Reckoning Benchmark.
Generates a single-panel figure: Zoomed Blackout Zone.
"""

import os
import numpy as np
import matplotlib.pyplot as plt


def plot_trajectory(results_file="output/results.npz", save_path="output/trajectory_drift_plot.png"):
    if not os.path.exists(results_file):
        raise FileNotFoundError(f"Cannot find results file at {results_file}. Run main_iovnbd.py first.")

    # 1. Load exported evaluation data
    data = np.load(results_file)
    p_pred = data["p_pred"]
    p_gt = data["p_gt"]
    t_start = int(data["t_start"])
    t_end = int(data["t_end"])
    D = float(data["distance_D"])
    E_2d = float(data["error_E"])
    drift_pct = float(data["drift_percentage"])
    blackout_dur = float(data["blackout_duration"])

    # Extract coordinates
    gt_x, gt_y = p_gt[:, 0], p_gt[:, 1]
    pred_x, pred_y = p_pred[:, 0], p_pred[:, 1]

    # Lead-in window used for the "approach" line in the zoom panel.
    lead_start = max(0, t_start - 60)

    # Create figure with high DPI and dark-themed/clean styling
    plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")
    # Single axis instead of two
    fig, ax = plt.subplots(figsize=(10, 8), dpi=300)

    # Calculate bounding box for zoom area
    pad = 120
    x_all = np.concatenate([gt_x[lead_start:t_end], pred_x[t_start:t_end]])
    y_all = np.concatenate([gt_y[lead_start:t_end], pred_y[t_start:t_end]])
    b_x_min, b_x_max = x_all.min() - pad, x_all.max() + pad
    b_y_min, b_y_max = y_all.min() - pad, y_all.max() + pad

    # -------------------------------------------------------------
    # Micro View (Zoomed-In Blackout Comparison)
    # -------------------------------------------------------------
    ax.plot(gt_x[lead_start:t_start + 1], gt_y[lead_start:t_start + 1],
             color="#4A90E2", linewidth=2.5, linestyle=":", label="Pre-blackout Approach")
    
    # Anchor dot to close gap
    ax.scatter(gt_x[t_start], gt_y[t_start], color="#4A90E2", s=25, zorder=5)

    # Ground Truth vs Prediction during outage
    ax.plot(gt_x[t_start:t_end], gt_y[t_start:t_end],
             color="#1B365D", linewidth=3.5, label="Ground Truth Path (True Tunnel Trajectory)")
    ax.plot(pred_x[t_start:t_end], pred_y[t_start:t_end],
             color="#F5A623", linewidth=3.0, linestyle="--", label="AI-IEKF Dead Reckoning")

    # Critical markers
    ax.scatter(gt_x[t_start], gt_y[t_start], color="#F5A623", s=130, marker="P",
                edgecolors="black", zorder=6, label="Blackout Start (GNSS Masked)")
    ax.scatter(gt_x[t_end - 1], gt_y[t_end - 1], color="#1B365D", s=130, marker="o",
                edgecolors="black", zorder=6, label="True Final Position")
    ax.scatter(pred_x[t_end - 1], pred_y[t_end - 1], color="#D0021B", s=140, marker="*",
                edgecolors="black", zorder=6, label="Predicted Final Position")

    # Error vector connecting predicted end to true end
    ax.annotate(
        "", xy=(gt_x[t_end - 1], gt_y[t_end - 1]), xytext=(pred_x[t_end - 1], pred_y[t_end - 1]),
        arrowprops=dict(arrowstyle="<->", color="#D0021B", lw=2.0, ls="--")
    )
    # Label the error vector midway
    mid_x = (gt_x[t_end - 1] + pred_x[t_end - 1]) / 2.0
    mid_y = (gt_y[t_end - 1] + pred_y[t_end - 1]) / 2.0
    ax.text(mid_x + 3, mid_y + 3, f"Final Drift: {E_2d:.2f} m", color="#D0021B",
             fontweight="bold", fontsize=10, bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8, edgecolor="#D0021B"))

    ax.set_xlim(b_x_min, b_x_max)
    ax.set_ylim(b_y_min, b_y_max)
    ax.set_title("Zoomed View: GNSS Outage Analysis", fontsize=13, fontweight="bold", pad=12)
    ax.set_xlabel("Local East [X] (meters)", fontsize=11)
    ax.set_ylabel("Local North [Y] (meters)", fontsize=11)
    ax.legend(loc="lower left", frameon=True, fontsize=9)
    ax.axis("equal")

    # -------------------------------------------------------------
    # Performance Metric Card (Overlay Bottom Right)
    # -------------------------------------------------------------
    status_text = "PASSED (< 10%)" if drift_pct < 10.0 else "EXCEEDED TARGET"
    status_color = "#2E7D32" if drift_pct < 10.0 else "#C62828"

    metrics_str = (
        f"ISRO / SIH Performance Audit\n"
        f"-----------------------------------------\n"
        f"Outage Duration  : {blackout_dur:.1f} s\n"
        f"Distance Traveled: {D:.2f} m\n"
        f"Final 2D Drift   : {E_2d:.2f} m\n"
        f"Drift Percentage : {drift_pct:.2f}%\n"
        f"Status           : {status_text}"
    )
    ax.text(
        0.97, 0.05, metrics_str,
        transform=ax.transAxes,
        fontsize=10,
        fontfamily="monospace",
        verticalalignment="bottom",
        horizontalalignment="right",
        bbox=dict(boxstyle="square,pad=0.6", facecolor="#F9F9FB", edgecolor=status_color, linewidth=2.0)
    )

    plt.suptitle("AI-IMU Intelligent Dead Reckoning Performance (IO-VNBD Dataset)", fontsize=15, fontweight="bold", y=0.98)
    plt.tight_layout()

    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    plt.savefig(save_path, bbox_inches="tight")
    plt.close()
    print(f"High-clarity benchmark plot successfully exported to: {save_path}")


if __name__ == "__main__":
    plot_trajectory()