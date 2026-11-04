"""The package ships copies of the shared visualizer files; they must match media/ (run sync_static.py)."""
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
STATIC = Path(__file__).resolve().parents[1] / "src" / "asp_studio" / "static"


@pytest.mark.skipif(not (ROOT / "media").is_dir(), reason="not running from the repository")
@pytest.mark.parametrize("name", ["engine.js", "webview.js", "webview.css", "themes.css"])
def test_static_copy_is_current(name):
    assert (STATIC / name).read_bytes() == (ROOT / "media" / name).read_bytes(), f"run python/sync_static.py ({name} differs)"
