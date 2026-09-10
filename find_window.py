"""Find a fair 60-second blackout window: skips erratic trip start,
requires a real stop AND reasonable overall distance traveled."""
import numpy as np
import sys
sys.path.append("src")
from dataset_iovnbd import IOVNBDDataset

dataset = IOVNBDDataset(csv_path="data/S-M.csv", max_rows=25000)
t, ang_gt, p_gt, v_gt, u = dataset.get_data()
speed = np.linalg.norm(v_gt[:, :2], axis=1)  # m/s

window = 600           # ~60 seconds
skip_start = 3000       # avoid erratic trip-start rows
min_total_distance = 200  # require meaningful travel, avoid degenerate % calc

best_idx = None
best_score = -1
for start in range(skip_start, len(speed) - window, 100):
    seg = speed[start:start+window]
    dist = np.sum(seg) * (t[1] - t[0])  # rough distance estimate
    has_stop = seg.min() < 1.0  # m/s
    if has_stop and dist > min_total_distance:
        # prefer windows with a clear stop but still decent overall distance
        score = dist - seg.min() * 50
        if score > best_score:
            best_score = score
            best_idx = start

if best_idx is None:
    print("No ideal window found with these constraints -- try loosening min_total_distance.")
else:
    seg = speed[best_idx:best_idx+window]
    print(f"Best window found: t_start={best_idx}, t_end={best_idx+window}")
    print(f"Min speed: {seg.min():.2f} m/s, Mean speed: {seg.mean():.2f} m/s")
    print(f"Approx distance: {np.sum(seg)*(t[1]-t[0]):.1f} m")