"""Machine QA for a Reel file (docs/PLAN.md §3 station 3).

Checks the file against the Reels container spec (Meta docs, verified 2026-10-24) and
against our own rules: metadata stripped, no provenance / AI markers, provenance entry
present for the source asset.

    python -m spine.publisher.spec_check <client> <slot_id>          # check posts/<slot>/video.mp4, write qa.md
    python -m spine.publisher.spec_check --fix <in.mp4> <out.mp4>    # transcode to spec, strip metadata
    python -m spine.publisher.spec_check --probe <file.mp4>          # print what ffprobe sees

Reels spec (container): MP4/MOV, moov first, H.264 or HEVC, 4:2:0, 23–60 fps, width
≤1920, VBR ≤25 Mbps, AAC ≤48 kHz ≤128 kbps, 3 s–15 min, ≤300 MB. We are stricter:
1080×1920, 30 fps, yuv420p (limited range), closed GOP 2 s, AAC 128k 48 kHz, 15–90 s.
"""

from __future__ import annotations

import json
import re
import struct
import subprocess
import sys
from pathlib import Path

import yaml

from spine.clients import client_dir

SPEC = {
    "width": 1080, "height": 1920,
    "fps_min": 23, "fps_max": 60, "fps_target": 30,
    "pix_fmt": "yuv420p",
    "vcodecs": {"h264", "hevc"},
    "acodec": "aac", "a_rate": 48000, "a_bitrate_max": 160_000,   # 128k nominal, ffmpeg reports ~133k
    "v_bitrate_max": 25_000_000,
    "dur_min": 15.0, "dur_max": 90.0,
    "size_max": 300 * 1024 * 1024,
}

# byte markers that mean "provenance or generative metadata present"
MARKERS = (b"c2pa", b"jumb", b"jumd", b"SynthID", b"<x:xmpmeta", b"http://ns.adobe.com/xap",
           b"DigitalSourceType", b"trainedAlgorithmicMedia", b"com.apple.quicktime.software")
ALLOWED_TAGS = {"major_brand", "minor_version", "compatible_brands", "encoder"}


def probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def top_level_boxes(path: Path) -> list[str]:
    boxes, i = [], 0
    with open(path, "rb") as f:
        size_total = path.stat().st_size
        while i + 8 <= size_total:
            f.seek(i)
            head = f.read(16)
            size, = struct.unpack(">I", head[:4])
            typ = head[4:8].decode("latin1")
            if size == 1:
                size, = struct.unpack(">Q", head[8:16])
            if size == 0:
                size = size_total - i
            boxes.append(typ)
            i += size
    return boxes


def scan_markers(path: Path) -> list[str]:
    data = path.read_bytes()
    return [m.decode("latin1") for m in MARKERS if m in data]


def _fps(stream: dict) -> float:
    n, d = stream.get("r_frame_rate", "0/1").split("/")
    return float(n) / float(d) if float(d) else 0.0


def check_file(path: Path) -> list[str]:
    """Return a list of problems; empty means the file passes."""
    issues: list[str] = []
    if not path.exists():
        return [f"missing file {path}"]
    p = probe(path)
    v = next((s for s in p["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in p["streams"] if s["codec_type"] == "audio"), None)
    fmt = p["format"]
    if v is None:
        return ["no video stream"]
    if v["codec_name"] not in SPEC["vcodecs"]:
        issues.append(f"video codec {v['codec_name']}, want h264")
    if (v["width"], v["height"]) != (SPEC["width"], SPEC["height"]):
        issues.append(f"size {v['width']}x{v['height']}, want 1080x1920")
    fps = _fps(v)
    if not SPEC["fps_min"] <= fps <= SPEC["fps_max"]:
        issues.append(f"fps {fps:g}, want 23–60")
    if v.get("pix_fmt") != SPEC["pix_fmt"]:
        issues.append(f"pix_fmt {v.get('pix_fmt')}, want yuv420p")
    if int(v.get("bit_rate", 0) or 0) > SPEC["v_bitrate_max"]:
        issues.append("video bitrate above 25 Mbps")
    if a is None:
        issues.append("no audio stream (Reels without audio get no reach; add a bed)")
    else:
        if a["codec_name"] != SPEC["acodec"]:
            issues.append(f"audio codec {a['codec_name']}, want aac")
        if int(a.get("sample_rate", 0)) != SPEC["a_rate"]:
            issues.append(f"audio rate {a.get('sample_rate')}, want 48000")
        if int(a.get("bit_rate", 0) or 0) > SPEC["a_bitrate_max"]:
            issues.append(f"audio bitrate {a.get('bit_rate')}, want ≤128k")
    dur = float(fmt.get("duration", 0))
    if not SPEC["dur_min"] <= dur <= SPEC["dur_max"]:
        issues.append(f"duration {dur:.1f}s, want 15–90s")
    if int(fmt.get("size", 0)) > SPEC["size_max"]:
        issues.append("file above 300 MB")
    boxes = top_level_boxes(path)
    if "moov" not in boxes or "mdat" not in boxes or boxes.index("moov") > boxes.index("mdat"):
        issues.append(f"moov atom not before mdat (boxes {boxes}); re-mux with +faststart")
    extra = set(fmt.get("tags", {})) - ALLOWED_TAGS
    if extra:
        issues.append(f"metadata tags present {sorted(extra)}; strip with -map_metadata -1")
    for s in p["streams"]:
        if s.get("tags"):
            bad = set(s["tags"]) - {"language", "handler_name", "vendor_id", "encoder"}  # encoder = "Lavc…", harmless
            if bad:
                issues.append(f"stream tags present {sorted(bad)}")
    markers = scan_markers(path)
    if markers:
        issues.append(f"provenance/AI markers found {markers}")
    return issues


def check_provenance(client: str, source_file: str | None) -> list[str]:
    """Every post names its source asset; that asset needs a provenance entry with generative: false."""
    if not source_file:
        return ["meta.json has no source_asset"]
    prov = yaml.safe_load((client_dir(client) / "assets" / "provenance.yaml").read_text()) or {}
    entries = {e["file"]: e for e in (prov.get("assets") or [])}
    e = entries.get(source_file)
    if e is None:
        return [f"no provenance entry for {source_file}"]
    issues = []
    if e.get("generative") is not False:
        issues.append(f"{source_file}: provenance.generative must be false (decision 7)")
    for k in ("source", "licence", "allowed_use"):
        if not e.get(k):
            issues.append(f"{source_file}: provenance.{k} missing")
    return issues


def fix(src: Path, dst: Path) -> None:
    """Transcode to our strict profile and strip every tag. Deterministic, 2-s closed GOP."""
    cmd = [
        "ffmpeg", "-v", "error", "-y", "-i", str(src),
        "-map_metadata", "-1", "-map_chapters", "-1",
        "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
        "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
        "-r", str(SPEC["fps_target"]), "-g", str(SPEC["fps_target"] * 2), "-keyint_min", str(SPEC["fps_target"] * 2),
        "-sc_threshold", "0", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high",
        "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart", str(dst),
    ]
    subprocess.run(cmd, check=True)


def safezone_check(video: Path, variant: str) -> tuple[str, str]:
    """Run tools/safezone.py check; returns (PASS|WARN|FAIL, output)."""
    tool = Path(__file__).resolve().parent.parent.parent / "tools" / "safezone.py"
    p = subprocess.run([sys.executable, str(tool), "check", str(video), "--variant", variant, "--every", "2"],
                       capture_output=True, text=True)
    m = re.search(r"VERDICT: (PASS|WARN|FAIL)", p.stdout)
    return (m.group(1) if m else "FAIL"), p.stdout


def safezone_overlay(video: Path, out: Path, variant: str) -> None:
    tool = Path(__file__).resolve().parent.parent.parent / "tools" / "safezone.py"
    subprocess.run([sys.executable, str(tool), "overlay", str(video), str(out), "--variant", variant],
                   capture_output=True, text=True)


def report(client: str, slot_id: str) -> tuple[bool, str]:
    slot = client_dir(client) / "posts" / slot_id
    video = slot / "video.mp4"
    meta = json.loads((slot / "meta.json").read_text()) if (slot / "meta.json").exists() else {}
    issues = check_file(video) + check_provenance(client, meta.get("source_asset"))
    story = slot / "video-story.mp4"
    if meta.get("story", True):
        issues += check_file(story) if story.exists() else ["video-story.mp4 missing (decision 14: every slot ships reel + story)"]
    sz_lines: list[str] = []
    for variant, f in (("reel", video), ("story", story)):
        if f.exists():
            verdict, out = safezone_check(f, variant)
            sz_lines.append(f"safezone {variant}: {verdict}")
            if verdict == "FAIL" and not meta.get("safe_zone", "").startswith("FAIL"):
                issues.append(f"{f.name}: text or UI inside the unsafe bands ({out.splitlines()[-1]})")
            safezone_overlay(f, slot / f"safezone-{variant}.jpg", variant)
    ok = not issues
    lines = [f"## spec_check · {slot_id}", ""]
    if ok:
        p = probe(video)
        v = next(s for s in p["streams"] if s["codec_type"] == "video")
        lines.append(f"PASS · {v['width']}x{v['height']} {_fps(v):g}fps {v['pix_fmt']} · "
                     f"{float(p['format']['duration']):.1f}s · {int(p['format']['size'])/1e6:.1f} MB · "
                     f"metadata stripped · no provenance/AI markers · provenance entry ok")
    lines += [f"- {l}" for l in sz_lines]
    if meta.get("safe_zone", "").startswith("FAIL"):
        lines.append(f"- safe zone override recorded in meta.json: {meta['safe_zone']}")
    else:
        lines.append("FAIL")
        lines += [f"- {i}" for i in issues]
    text = "\n".join(lines) + "\n"
    # qa.md holds one "## spec_check" section (ours) and any number of other sections
    # (Claude's vision pass). Replace ours, keep the rest.
    qa = slot / "qa.md"
    existing = qa.read_text() if qa.exists() else ""
    parts = [p for p in ("\n" + existing).split("\n## ") if p.strip()]
    kept = ["## " + p.strip() + "\n" for p in parts if not p.startswith("spec_check")]
    qa.write_text("\n".join([text, *kept]))
    return ok, text


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[0] == "--fix":
        fix(Path(argv[1]), Path(argv[2]))
        issues = check_file(Path(argv[2]))
        print("PASS" if not issues else "FAIL\n" + "\n".join(f"- {i}" for i in issues))
        return 0 if not issues else 1
    if len(argv) == 2 and argv[0] == "--probe":
        print(json.dumps(probe(Path(argv[1])), indent=1))
        print("boxes:", top_level_boxes(Path(argv[1])), "markers:", scan_markers(Path(argv[1])))
        return 0
    if len(argv) == 2:
        ok, text = report(argv[0], argv[1])
        print(text)
        return 0 if ok else 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
