"""
Invariant Extended Kalman Filter (IEKF) Module
Wraps and exposes the core NUMPYIEKF and TORCHIEKF implementations from
ai-imu-dr without altering their underlying mathematical formulations.
"""

import numpy as np
import sys
import os

# Ensure src directory is on sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils_numpy_filter import NUMPYIEKF
from utils_torch_filter import TORCHIEKF, InitProcessCovNet, MesNet

# Alias for intuitive referencing
IEKF = NUMPYIEKF

class IOVNBParameters(NUMPYIEKF.Parameters):
    """
    Default filter parameters calibrated for smartphone IMU vehicle dead reckoning (IO-VNBD).
    """
    g = np.array([0, 0, -9.80665])
    
    # Process noise covariance
    cov_omega = 1e-3
    cov_acc = 1e-2
    cov_b_omega = 6e-9
    cov_b_acc = 2e-4
    cov_Rot_c_i = 1e-9
    cov_t_c_i = 1e-9
    
    # Non-holonomic measurement noise (lateral and vertical constraints)
    cov_lat = 0.2
    cov_up = 10.0
    
    # Initial state covariances
    cov_Rot0 = 1e-3
    cov_v0 = 1e-1
    cov_b_omega0 = 6e-3
    cov_b_acc0 = 4e-3
    cov_Rot_c_i0 = 1e-6
    cov_t_c_i0 = 5e-3
    
    def __init__(self, **kwargs):
        super(IOVNBParameters, self).__init__(**kwargs)
        self.set_param_attr()

    def set_param_attr(self):
        attr_list = [a for a in dir(IOVNBParameters) if
                     not a.startswith('__') and not callable(getattr(IOVNBParameters, a))]
        for attr in attr_list:
            setattr(self, attr, getattr(IOVNBParameters, attr))


__all__ = [
    "NUMPYIEKF",
    "TORCHIEKF",
    "IEKF",
    "IOVNBParameters",
    "InitProcessCovNet",
    "MesNet",
]
