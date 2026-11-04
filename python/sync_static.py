#!/usr/bin/env python3
"""Copy the shared visualizer files from ../media into the package (single source of truth: media/).
Run after changing anything in media/; tests/test_static_sync.py fails if the copies drift."""
import pathlib
import shutil

here = pathlib.Path(__file__).resolve().parent
SHARED = ["engine.js", "webview.js", "webview.css", "themes.css"]
for name in SHARED:
    shutil.copyfile(here.parent / "media" / name, here / "src" / "asp_studio" / "static" / name)
    print("copied", name)
