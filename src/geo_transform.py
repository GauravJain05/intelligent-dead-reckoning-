"""
Geodetic Conversion Module (Module A)
Converts spherical GPS coordinates (Latitude, Longitude, Altitude) to local Cartesian
East-North-Up (ENU) coordinates in meters.
"""

import numpy as np
import pymap3d


def gps_to_enu(lat_array, lon_array, alt_array=None):
    """
    Converts GPS geodetic coordinates to local East, North, Up (ENU) metric positions.
    
    Args:
        lat_array: 1D array-like of latitudes in degrees.
        lon_array: 1D array-like of longitudes in degrees.
        alt_array: 1D array-like of altitudes in meters (optional, defaults to 0).
        
    Returns:
        np.ndarray: Array of shape (N, 3) representing [East, North, Up] in meters,
                    with the first coordinate as the origin (0, 0, 0).
    """
    lat = np.asarray(lat_array, dtype=np.float64)
    lon = np.asarray(lon_array, dtype=np.float64)
    
    if alt_array is None:
        alt = np.zeros_like(lat)
    else:
        alt = np.asarray(alt_array, dtype=np.float64)
        # Fill any NaNs in altitude with 0 or the first valid altitude
        if np.isnan(alt).any():
            nan_mask = np.isnan(alt)
            if not nan_mask.all():
                first_valid = alt[~nan_mask][0]
                alt[nan_mask] = first_valid
            else:
                alt = np.zeros_like(lat)
                
    # Find first valid coordinate pair as origin
    valid_idx = np.where(~np.isnan(lat) & ~np.isnan(lon))[0]
    if len(valid_idx) == 0:
        raise ValueError("lat_array and lon_array contain no valid numerical values.")
    
    origin_idx = valid_idx[0]
    lat0 = float(lat[origin_idx])
    lon0 = float(lon[origin_idx])
    alt0 = float(alt[origin_idx])
    
    e, n, u = pymap3d.geodetic2enu(lat, lon, alt, lat0, lon0, alt0)
    
    enu = np.column_stack((e, n, u)).astype(np.float64)
    return enu


if __name__ == "__main__":
    # Unit tests confirming (Lat_0, Lon_0) -> (0, 0)
    print("Running unit tests for geo_transform.py...")
    test_lat = np.array([52.402565, 52.402570, 52.402600])
    test_lon = np.array([-1.503471, -1.503480, -1.503500])
    test_alt = np.array([144.59, 144.60, 144.65])
    
    enu_res = gps_to_enu(test_lat, test_lon, test_alt)
    
    assert enu_res.shape == (3, 3), f"Expected shape (3, 3), got {enu_res.shape}"
    assert np.isclose(enu_res[0, 0], 0.0, atol=1e-6), f"Expected E0=0, got {enu_res[0, 0]}"
    assert np.isclose(enu_res[0, 1], 0.0, atol=1e-6), f"Expected N0=0, got {enu_res[0, 1]}"
    assert np.isclose(enu_res[0, 2], 0.0, atol=1e-6), f"Expected U0=0, got {enu_res[0, 2]}"
    
    # Test with alt_array=None
    enu_no_alt = gps_to_enu(test_lat, test_lon)
    assert enu_no_alt.shape == (3, 3)
    assert np.isclose(enu_no_alt[0, 0], 0.0, atol=1e-6)
    assert np.isclose(enu_no_alt[0, 1], 0.0, atol=1e-6)
    
    print("All unit tests passed successfully!")
