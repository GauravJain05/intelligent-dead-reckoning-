import os
import sys

# Ensure src is on path
src_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(src_dir)

from dataset_iovnbd import IOVNBDDataset
from train_torch_filter import train_filter
from utils_torch_filter import TorchIEKFParameters

class Args:
    epochs = 40
    seq_dim = 200               # 200 IMU timesteps per mini-batch window
    continue_training = False
    parameter_class = TorchIEKFParameters
    path_temp = os.path.join(os.path.dirname(src_dir), "results")

if __name__ == "__main__":
    args = Args()
    os.makedirs(args.path_temp, exist_ok=True)

    data_folder = os.path.join(os.path.dirname(src_dir), "data")
    print(f"Loading dataset from: {data_folder}")
    dataset = IOVNBDDataset(data_dir=data_folder)

    print(f"Train sets: {list(dataset.datasets_train_filter.keys())}")
    print(f"Val sets:   {list(dataset.datasets_validatation_filter.keys())}")

    print("\nBeginning training...")
    train_filter(args, dataset)
    print("\nTraining completed! Saved weights to results/iekfnets.p")
