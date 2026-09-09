#!/usr/bin/env python3

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Final
from urllib.parse import urlencode

from PIL import Image


ROOT: Final = Path(__file__).resolve().parents[1]
DOCS: Final = ROOT / "docs"
ASSETS: Final = DOCS / "assets"
SCREENSHOT_SIZE: Final = (1280, 800)
SCREENSHOT_SCALE: Final = 2
MAX_WEBP_BYTES: Final = 100 * 1024
FEATURES: Final = (
    "dashboard",
    "sidebar",
    "repository-navigation",
    "pull-request-shortcuts",
    "hidden-files",
    "quote-navigation",
    "mermaid",
)
STATES: Final = ("before", "after")


def executable(*names: str) -> Path:
    for name in names:
        if path := shutil.which(name):
            return Path(path)
    raise FileNotFoundError(f"Could not find any of: {', '.join(names)}")


def run(command: tuple[str, ...], *, timeout: int = 120) -> None:
    result = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        check=False,
        text=True,
        timeout=timeout,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())


def capture(chrome: Path, feature: str, state: str, output: Path) -> None:
    width, height = SCREENSHOT_SIZE
    profile = output.parent / f"{output.stem}-profile"
    query = urlencode({
        "feature": feature,
        "state": state,
        "theme": "dark",
        "still": "1",
    })
    url = f"{(DOCS / 'demo.html').as_uri()}?{query}"
    run((
        str(chrome),
        "--headless=new",
        "--no-sandbox",
        "--disable-background-networking",
        "--disable-features=PaintHolding",
        "--force-device-scale-factor=2",
        "--hide-scrollbars",
        "--no-first-run",
        "--run-all-compositor-stages-before-draw",
        f"--user-data-dir={profile}",
        "--virtual-time-budget=500",
        f"--window-size={width},{height}",
        f"--screenshot={output}",
        url,
    ), timeout=30)


def encode_webp(source: Path, output: Path) -> None:
    image = Image.open(source).convert("RGB")
    for quality in range(88, 39, -2):
        image.save(output, "WEBP", quality=quality, method=6)
        if output.stat().st_size < MAX_WEBP_BYTES:
            return
    raise RuntimeError(f"Could not encode {output.name} below 100 KiB")


def render_assets() -> None:
    chrome = executable("google-chrome", "google-chrome-stable", "chromium", "chromium-browser")
    ASSETS.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="gibbous-assets-") as temporary_name:
        temporary = Path(temporary_name)
        for feature in FEATURES:
            for state in STATES:
                png = temporary / f"{feature}-{state}.png"
                output = ASSETS / f"{feature}-{state}.webp"
                capture(chrome, feature, state, png)
                encode_webp(png, output)


def validate_assets() -> None:
    expected = {f"{feature}-{state}.webp" for feature in FEATURES for state in STATES}
    actual = {path.name for path in ASSETS.glob("*.webp")}
    if actual != expected:
        raise RuntimeError(f"Unexpected WebP assets: {sorted(actual ^ expected)}")
    oversized = [path.name for path in ASSETS.glob("*.webp") if path.stat().st_size >= MAX_WEBP_BYTES]
    if oversized:
        raise RuntimeError(f"WebP assets at or above 100 KiB: {oversized}")


def main() -> None:
    render_assets()
    validate_assets()
    print("Rendered 12 theme-consistent WebP fallbacks below 100 KiB.")


if __name__ == "__main__":
    main()
