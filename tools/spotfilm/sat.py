"""Satellite picture of a surf spot for a map film: one low-cloud Sentinel-2 L2A pass, north up.

    python tools/spotfilm/sat.py <lat> <lon> <width_km> <out_prefix> [px]

Writes <prefix>.jpg (true colour, px × px, the point in the centre), <prefix>-sea.png (white where
there is water, the alpha of the swell lines) and <prefix>.json (scene id, date, metres per pixel).

Source: Copernicus Sentinel-2 L2A cloud-optimised GeoTIFFs on AWS, found through the Earth Search
STAC API (no key). Licence: free, commercial use included; the legal notice asks for the line
"Contains modified Copernicus Sentinel data <year>" wherever the picture is shown to the public.
Needs rasterio (not a spine dependency: pip install rasterio).
"""

from __future__ import annotations

import json
import math
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

STAC = "https://earth-search.aws.element84.com/v1/search"
R = 6378137.0
TRIES = 8          # passes read before we settle for the best one
GAMMA = 0.74
FILL = 14          # further passes read only to fill what the best one does not cover


def bounds(lat: float, lon: float, width_km: float) -> tuple[float, float, float, float]:
    """Web-mercator box, width_km of ground wide, centred on the point."""
    mx, my = math.radians(lon) * R, math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R
    half = width_km * 500 / math.cos(math.radians(lat))
    return mx - half, my - half, mx + half, my + half


def passes(lat: float, lon: float, width_km: float, since: str = "2025-01-01", max_cloud: float = 30) -> list[list[dict]]:
    """Satellite passes over the box (all tiles of one pass together), least cloudy first."""
    dlat = width_km / 222.0
    dlon = dlat / math.cos(math.radians(lat))
    body = {"collections": ["sentinel-2-l2a"], "limit": 200,
            "bbox": [lon - dlon, lat - dlat, lon + dlon, lat + dlat],
            "datetime": f"{since}T00:00:00Z/..", "query": {"eo:cloud_cover": {"lt": max_cloud}}}
    req = urllib.request.Request(STAC, json.dumps(body).encode(), {"Content-Type": "application/json"})
    by_pass = defaultdict(list)
    for f in json.load(urllib.request.urlopen(req, timeout=60))["features"]:
        p = f["properties"]
        by_pass[(p["datetime"][:10], p.get("platform"))].append(f)
    return sorted(by_pass.values(), key=lambda fs: sum(f["properties"]["eo:cloud_cover"] for f in fs) / len(fs))


def fetch(lat: float, lon: float, width_km: float, out: Path, px: int = 2160) -> dict:
    import numpy as np
    import rasterio
    from PIL import Image, ImageFilter
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT

    tr = rasterio.transform.from_bounds(*bounds(lat, lon, width_km), px, px)

    def read(fs: list[dict], asset: str, bands: list[int], how):
        acc = None
        for f in fs:
            with rasterio.open(f["assets"][asset]["href"]) as src, \
                    WarpedVRT(src, crs="EPSG:3857", resampling=how, transform=tr, width=px, height=px) as vrt:
                a = vrt.read(bands)
            acc = a if acc is None else np.where(acc.sum(0, keepdims=True) == 0, a, acc)
        return acc

    ps = passes(lat, lon, width_km)
    seen = []                                             # (score, pass, picture), every pass we read
    for fs in ps[:TRIES]:
        rgb = read(fs, "visual", [1, 2, 3], Resampling.cubic)
        empty = float((rgb.sum(0) == 0).mean())
        cloud = float((rgb.min(0) > 215).mean())          # white inside OUR box: cloud, glint, foam
        seen.append((empty * 10 + cloud, fs, rgb))
        if empty < 0.001 and cloud < 0.004:
            break
    if not seen:
        raise RuntimeError(f"no Sentinel-2 pass under the cloud limit at {lat},{lon}")
    seen.sort(key=lambda x: x[0])
    _, fs, rgb = seen[0]
    nir = read(fs, "nir", [1], Resampling.bilinear)[0]
    used = {id(fs)}
    for ofs in [x[1] for x in seen[1:]] + ps[TRIES:TRIES + FILL]:   # a box wider than one orbit: fill the gap from other passes
        gap = rgb.sum(0) == 0
        if gap.mean() < 0.002:
            break
        if id(ofs) in used:
            continue
        used.add(id(ofs))
        rgb = np.where(gap, read(ofs, "visual", [1, 2, 3], Resampling.cubic), rgb)
        nir = np.where(gap, read(ofs, "nir", [1], Resampling.bilinear)[0], nir)
    gap = rgb.sum(0) == 0
    water = (nir < 900) & ~gap
    if gap.any() and water.any():                         # still nothing there: open sea, painted the sea's own colour
        rgb = np.where(gap, np.median(rgb[:, water], axis=1).astype("uint8")[:, None, None], rgb)
        nir = np.where(gap, 0, nir)
    rgb = (255 * (rgb / 255.0) ** GAMMA).astype("uint8")  # the L2A picture is dark over land
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.moveaxis(rgb, 0, 2)).save(f"{out}.jpg", quality=93)
    sea = Image.fromarray(((nir < 900) * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(4))   # water is dark in near infrared
    alpha = Image.new("RGBA", sea.size, (255, 255, 255, 0))
    alpha.putalpha(sea)
    alpha.save(f"{out}-sea.png")
    p = fs[0]["properties"]
    meta = {"scene": [f["id"] for f in fs], "date": p["datetime"][:10], "lat": lat, "lon": lon,
            "width_km": width_km, "px": px, "m_per_px": width_km * 1000 / px,
            "notice": f"Contains modified Copernicus Sentinel data {p['datetime'][:4]}"}
    Path(f"{out}.json").write_text(json.dumps(meta, indent=1) + "\n")
    return meta


if __name__ == "__main__":
    a = sys.argv[1:]
    print(json.dumps(fetch(float(a[0]), float(a[1]), float(a[2]), Path(a[3]), int(a[4]) if len(a) > 4 else 2160)))
