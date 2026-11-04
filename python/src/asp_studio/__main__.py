"""``python -m asp_studio program.lp``: solve a file and write a standalone HTML report."""
from __future__ import annotations

import argparse
import pathlib
import sys
import webbrowser

from .render import page
from .solver import solve


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m asp_studio", description="Solve ASP files and write an interactive HTML report.")
    ap.add_argument("files", nargs="+", type=pathlib.Path, help=".lp files (joined in order)")
    ap.add_argument("-n", "--models", type=int, default=0, help="max answer sets (0 = all)")
    ap.add_argument("-o", "--options", default="", help='extra clingo options, e.g. "--opt-mode=optN"')
    ap.add_argument("-t", "--timeout", type=float, default=10.0)
    ap.add_argument("--out", type=pathlib.Path, help="output file (default: <first file>.html)")
    ap.add_argument("--tab", default="animator", choices=["animator", "answers", "graph", "console"])
    ap.add_argument("--theme", default="auto", choices=["auto", "light", "dark"])
    ap.add_argument("--open", action="store_true", help="open the report in the browser")
    a = ap.parse_args(argv)
    for f in a.files:
        if not f.is_file():
            print(f"error: {f} does not exist", file=sys.stderr)
            return 2
    res = solve(list(a.files), models=a.models, options=a.options, timeout=a.timeout)
    out = a.out or a.files[0].with_suffix(".html")
    out.write_text(page(res, tab=a.tab, theme=a.theme, max_height=100000, title=a.files[0].name), encoding="utf-8")
    status = res.error or f"{res.result}, {len(res)} model(s), {res.ms} ms"
    print(f"{status} -> {out}")
    if a.open:
        webbrowser.open(out.resolve().as_uri())
    return 1 if res.error else 0


if __name__ == "__main__":
    raise SystemExit(main())
