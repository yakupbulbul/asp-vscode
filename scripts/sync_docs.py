#!/usr/bin/env python3
"""Copy the shared visualizer files from media/ into the website (docs/assets/panel/).
media/ is the single source of truth; test/docs.test.js fails when the copies drift. Run after changing media/."""
import pathlib
import shutil

root = pathlib.Path(__file__).resolve().parents[1]
for name in ["engine.js", "webview.js", "webview.css", "themes.css"]:
    shutil.copyfile(root / "media" / name, root / "docs" / "assets" / "panel" / name)
    print("copied", name)
