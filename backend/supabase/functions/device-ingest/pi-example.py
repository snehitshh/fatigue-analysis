#!/usr/bin/env python3
"""
Raspberry Pi -> FatigueIDPro ECG uploader (example).

Reads an ECG result (replace read_ecg() with your real sensor code) and POSTs it
to the device-ingest edge function, which stores it against the candidate.

Usage:
    DEVICE_INGEST_URL="https://<project-ref>.functions.supabase.co/device-ingest" \
    DEVICE_INGEST_KEY="<the-secret-you-set>" \
    python3 pi-example.py P017
"""
import os
import sys
import json
import urllib.request


def read_ecg():
    """Replace this with your real sensor read. Return derived ECG metrics."""
    return {
        "heart_rate_bpm": 72.0,
        "hrv_ms": 45.5,
        # raw / extra fields are stored in the `data` jsonb column:
        "data": {"rmssd": 38.2, "sdnn": 51.0, "sample_count": 4096},
    }


def main():
    if len(sys.argv) < 2:
        print("usage: pi-example.py <participant_code>")
        sys.exit(1)

    url = os.environ["DEVICE_INGEST_URL"]
    key = os.environ["DEVICE_INGEST_KEY"]
    participant_code = sys.argv[1]

    ecg = read_ecg()
    payload = {
        "participant_code": participant_code,
        "measurement_type": "ecg",
        "heart_rate_bpm": ecg.get("heart_rate_bpm"),
        "hrv_ms": ecg.get("hrv_ms"),
        "data": ecg.get("data", {}),
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json", "x-device-key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(resp.status, resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print("error", e.code, e.read().decode("utf-8"))
        sys.exit(1)


if __name__ == "__main__":
    main()
