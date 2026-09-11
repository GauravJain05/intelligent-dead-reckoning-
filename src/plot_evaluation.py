"""
Plotting and Visualization Module for AI-IMU Dead Reckoning Benchmark.
Generates a dual-panel figure: Full Journey Overview + Zoomed Blackout Zone.
"""

import os
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle


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
    # Computed up front so the zoom box (below) can account for it too.
    lead_start = max(0, t_start - 60)

    # Create figure with high DPI and dark-themed/clean styling
    plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(18, 8), gridspec_kw={'width_ratios': [1, 1.3]}, dpi=300)

    # -------------------------------------------------------------
    # PANEL 1: Macro View (Entire Vehicle Journey)
    # -------------------------------------------------------------
    ax1.plot(gt_x[:t_start], gt_y[:t_start], color="#4A90E2", linewidth=2, label="Mode 1: GNSS Active")
    ax1.plot(gt_x[t_start:t_end], gt_y[t_start:t_end], color="#D0021B", linewidth=3.5, label="Mode 2: Blackout Segment")
    ax1.plot(gt_x[t_end:], gt_y[t_end:], color="#7ED321", linewidth=2, linestyle="--", label="Mode 3: GNSS Restored")

    # Start & End markers
    ax1.scatter(gt_x[0], gt_y[0], color="green", s=90, marker="o", edgecolors="black", zorder=5, label="Trip Origin")
    ax1.scatter(gt_x[-1], gt_y[-1], color="black", s=90, marker="X", zorder=5, label="Trip Destination")

    # Add a bounding rectangle around the blackout region (+ lead-in approach)
    # to highlight where we are zooming. IMPORTANT: this must include the
    # lead-in coordinates too, otherwise panel 2 will clip that line off.
    pad = 120
    x_all = np.concatenate([gt_x[lead_start:t_end], pred_x[t_start:t_end]])
    y_all = np.concatenate([gt_y[lead_start:t_end], pred_y[t_start:t_end]])
    b_x_min, b_x_max = x_all.min() - pad, x_all.max() + pad
    b_y_min, b_y_max = y_all.min() - pad, y_all.max() + pad

    rect = Rectangle((b_x_min, b_y_min), b_x_max - b_x_min, b_y_max - b_y_min,
                     linewidth=1.8, edgecolor="#D0021B", facecolor="none", linestyle="--", zorder=6)
    ax1.add_patch(rect)
    ax1.text(b_x_min, b_y_max + 30, "Zoom Area (Blackout)", color="#D0021B", fontweight="bold", fontsize=10)

    ax1.set_title("Full Vehicle Journey (Overview)", fontsize=13, fontweight="bold", pad=12)
    ax1.set_xlabel("Local East [X] (meters)", fontsize=11)
    ax1.set_ylabel("Local North [Y] (meters)", fontsize=11)
    ax1.legend(loc="upper right", frameon=True, fontsize=9)
    ax1.axis("equal")

    # -------------------------------------------------------------
    # PANEL 2: Micro View (Zoomed-In Blackout Comparison)
    # -------------------------------------------------------------
    ax2.plot(gt_x[lead_start:t_start + 1], gt_y[lead_start:t_start + 1],
             color="#4A90E2", linewidth=2.5, linestyle=":", label="Pre-blackout Approach")
    # Matplotlib's dotted linestyle spaces dots by pixel length, so on a short
    # segment the last dot can land short of the true endpoint, leaving a
    # visible gap before the blackout-start marker. Anchor it explicitly.
    ax2.scatter(gt_x[t_start], gt_y[t_start], color="#4A90E2", s=25, zorder=5)

    # Ground Truth vs Prediction during outage
    ax2.plot(gt_x[t_start:t_end], gt_y[t_start:t_end],
             color="#1B365D", linewidth=3.5, label="Ground Truth Path (True Tunnel Trajectory)")
    ax2.plot(pred_x[t_start:t_end], pred_y[t_start:t_end],
             color="#F5A623", linewidth=3.0, linestyle="--", label="AI-IEKF Dead Reckoning")

    # Critical markers
    ax2.scatter(gt_x[t_start], gt_y[t_start], color="#F5A623", s=130, marker="P",
                edgecolors="black", zorder=6, label="Blackout Start (GNSS Masked)")
    ax2.scatter(gt_x[t_end - 1], gt_y[t_end - 1], color="#1B365D", s=130, marker="o",
                edgecolors="black", zorder=6, label="True Final Position")
    ax2.scatter(pred_x[t_end - 1], pred_y[t_end - 1], color="#D0021B", s=140, marker="*",
                edgecolors="black", zorder=6, label="Predicted Final Position")

    # Error vector connecting predicted end to true end
    ax2.annotate(
        "", xy=(gt_x[t_end - 1], gt_y[t_end - 1]), xytext=(pred_x[t_end - 1], pred_y[t_end - 1]),
        arrowprops=dict(arrowstyle="<->", color="#D0021B", lw=2.0, ls="--")
    )
    # Label the error vector midway
    mid_x = (gt_x[t_end - 1] + pred_x[t_end - 1]) / 2.0
    mid_y = (gt_y[t_end - 1] + pred_y[t_end - 1]) / 2.0
    ax2.text(mid_x + 3, mid_y + 3, f"Final Drift: {E_2d:.2f} m", color="#D0021B",
             fontweight="bold", fontsize=10, bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8, edgecolor="#D0021B"))

    ax2.set_xlim(b_x_min, b_x_max)
    ax2.set_ylim(b_y_min, b_y_max)
    ax2.set_title("Zoomed View: GNSS Outage Analysis", fontsize=13, fontweight="bold", pad=12)
    ax2.set_xlabel("Local East [X] (meters)", fontsize=11)
    ax2.set_ylabel("Local North [Y] (meters)", fontsize=11)
    ax2.legend(loc="lower left", frameon=True, fontsize=9)
    ax2.axis("equal")

    # -------------------------------------------------------------
    # Performance Metric Card (Overlay Bottom Right of Zoom Panel)
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
    ax2.text(
        0.97, 0.05, metrics_str,
        transform=ax2.transAxes,
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