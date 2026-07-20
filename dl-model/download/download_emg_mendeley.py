"""
Download the "EMG Dataset for Muscle Fatigue Analysis in Biceps and Triceps"
(Mendeley Data, DOI 10.17632/8j2p29hnbv.1) - freely downloadable, no request form.

30 subjects x {B1,B2,T1,T2} recordings + 2 metadata files (labels, manual
segmentation of 4 contraction reps per recording). ~25 MB total.

Usage: python dl-model/download/download_emg_mendeley.py
"""
import json
import time
from pathlib import Path
from urllib.request import urlopen, Request

DATASET_ID = "8j2p29hnbv"
META_URL = f"https://data.mendeley.com/public-api/datasets/{DATASET_ID}?folder_id=&dataset_version_id=1"
OUT_DIR = Path(__file__).parent.parent / "data" / "raw_emg_mendeley"


def fetch(url: str) -> bytes:
    # ponytail: Mendeley's Cloudflare front-end 403s on urllib's default UA; curl's UA works.
    req = Request(url, headers={"Accept": "application/json, */*", "User-Agent": "curl/8.0"})
    with urlopen(req, timeout=30) as resp:
        return resp.read()


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    meta = json.loads(fetch(META_URL))
    files = meta.get("files", [])
    print(f"Dataset: {meta.get('name')} - {len(files)} files")

    for i, f in enumerate(files, 1):
        name = f["filename"]
        url = f["content_details"]["download_url"]
        dest = OUT_DIR / name
        if dest.exists() and dest.stat().st_size > 0:
            continue
        for attempt in range(3):
            try:
                data = fetch(url)
                dest.write_bytes(data)
                break
            except Exception as e:
                if attempt == 2:
                    print(f"  FAILED {name}: {e}")
                time.sleep(1)
        if i % 20 == 0 or i == len(files):
            print(f"  {i}/{len(files)} done")

    got = list(OUT_DIR.glob("*.xlsx"))
    print(f"Downloaded {len(got)} files to {OUT_DIR}")


if __name__ == "__main__":
    main()
