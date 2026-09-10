import os
import sys
import torch

src_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(src_dir)

from dataset_iovnbd import IOVNBDDataset
from train_torch_filter import train_filter
from iekf import IOVNBParameters

class Args:
    epochs = 50
    seq_dim = 200
    continue_training = False
    parameter_class = IOVNBParameters
    path_temp = os.path.join(os.path.dirname(src_dir), "results")

if __name__ == "__main__":
    args = Args()
    os.makedirs(args.path_temp, exist_ok=True)

    data_folder = os.path.join(os.path.dirname(src_dir), "data")
    print(f"Loading multi-sequence IO-VNBD dataset from: {data_folder}")
    dataset = IOVNBDDataset(data_dir=data_folder)

    # Save normalization factors so evaluation uses exact training distributions
    if dataset.normalize_factors is not None:
        norm_file = os.path.join(args.path_temp, "norm_factors.p")
        torch.save(dataset.normalize_factors, norm_file)
        print(f"Exported training normalization parameters to: {norm_file}")

    print(f"Training sequences:   {len(dataset.datasets_train_filter)}")
    print(f"Validation sequences: {len(dataset.datasets_validatation_filter)}")

    print("\nTraining MesNet & InitProcessCovNet on full multi-sequence dataset...")
    train_filter(args, dataset)
    print("\nTraining complete. Model weights saved to results/iekfnets.p")