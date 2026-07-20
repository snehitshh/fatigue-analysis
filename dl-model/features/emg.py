"""
EMG feature extraction - time-domain (Hudgins) fatigue indicators.

The Mendeley EMG dataset's metadata does not reliably state the sampling rate
(the field is ambiguous/likely a translation artefact). Rather than compute
frequency-domain features (MDF/MNF) on a guessed fs - which would silently
produce wrong numbers - this module uses the classical TIME-DOMAIN EMG feature
set (Hudgins et al., 1993), which needs no known sampling rate:
    RMS, MAV, waveform length, zero-crossing rate, slope-sign changes.
These are standard, fs-independent muscle-fatigue indicators. Pure functions,
no file I/O, unit-testable.
"""
import numpy as np


def compute_features(emg: np.ndarray, zc_threshold: float = 0.0) -> dict:
    """Compute time-domain EMG features over one segment (e.g. one repetition).

    Args:
        emg: 1D array of raw EMG samples for the segment.
        zc_threshold: noise threshold for zero-crossing / slope-sign-change
            counting (a sign flip smaller than this is treated as noise).

    Returns dict with keys: rms, mav, wl, zc, ssc, n_samples, data_quality.
    """
    x = np.asarray(emg, dtype=float)
    x = x[~np.isnan(x)]
    n = len(x)
    if n < 2:
        return {"rms": np.nan, "mav": np.nan, "wl": np.nan, "zc": np.nan,
                "ssc": np.nan, "n_samples": n, "data_quality": "unknown"}

    rms = float(np.sqrt(np.mean(x ** 2)))
    mav = float(np.mean(np.abs(x)))
    wl = float(np.sum(np.abs(np.diff(x))))

    # Zero crossings: sign changes exceeding the noise threshold.
    signs = x[:-1] * x[1:]
    mag_ok = np.abs(x[:-1] - x[1:]) >= zc_threshold
    zc = int(np.sum((signs < 0) & mag_ok))

    # Slope sign changes: direction reversals in the derivative.
    d = np.diff(x)
    if len(d) > 1:
        ssc = int(np.sum(((d[:-1] * d[1:]) < 0) & (np.abs(d[:-1]) >= zc_threshold)))
    else:
        ssc = 0

    # A near-flat segment (no muscle activity captured) is a plausible artefact.
    quality = "artefact" if rms < 1e-6 or n < 20 else "valid"

    return {"rms": rms, "mav": mav, "wl": wl, "zc": zc, "ssc": ssc,
            "n_samples": n, "data_quality": quality}
