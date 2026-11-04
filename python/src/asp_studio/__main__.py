"""``python -m asp_studio program.lp`` (or ``asp-studio program.lp``): solve files and write a standalone HTML report."""
from __future__ import annotations

import argparse
import pathlib
import sys
import webbrowser
from typing import List, Optional

from .render import page
from .solver import solve


def _fail(message: str, code: int = 2) -> int:
    print(f"error: {message}", file=sys.stderr)
    return code


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="asp-studio", description="Solve ASP files and write an interactive HTML report.")
    ap.add_argument("files", nargs="+", type=pathlib.Path, help=".lp files (joined in order)")
    ap.add_argument("-n", "--models", type=int, default=0, help="max answer sets (0 = all)")
    ap.add_argument("-o", "--options", default="", help='extra clingo options, e.g. "--opt-mode=optN"')
    ap.add_argument("-t", "--timeout", type=float, default=10.0, help="seconds (default 10)")
    ap.add_argument("--out", type=pathlib.Path, help="output file (default: <first file>.html)")
    ap.add_argument("--tab", default="animator", choices=["animator", "answers", "graph", "console"])
    ap.add_argument("--theme", default="auto", choices=["auto", "light", "dark"])
    ap.add_argument("--open", action="store_true", help="open the report in the browser")
    a = ap.parse_args(argv)

    if a.models < 0:
        return _fail("--models must be 0 or greater")
    if a.timeout <= 0:
        return _fail("--timeout must be greater than 0")
    for f in a.files:
        if f.is_dir():
            return _fail(f"{f} is a directory, not a file")
        if not f.is_file():
            return _fail(f"{f} does not exist")
        try:
            f.read_text(encoding="utf-8")
        except UnicodeDecodeError as e:
            return _fail(f"{f} is not UTF-8 text ({e.reason} at byte {e.start}); is it an ASP file?")
        except OSError as e:
            return _fail(f"cannot read {f}: {e.strerror or e}")
    res = solve(list(a.files), models=a.models, options=a.options, timeout=a.timeout)

    out = a.out or a.files[0].with_suffix(".html")
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page(res, tab=a.tab, theme=a.theme, max_height=100000, title=a.files[0].name), encoding="utf-8")
    except OSError as e:
        return _fail(f"cannot write {out}: {e.strerror or e}", 1)

    for d in res.diagnostics:
        print(f"{d.file}:{d.line}:{d.col}: {d.severity}: {d.message.splitlines()[0]}", file=sys.stderr)
    status = res.error or f"{res.result}, {len(res)} model(s), {res.ms} ms"
    print(f"{status} -> {out}")
    if a.open:
        webbrowser.open(out.resolve().as_uri())
    return 1 if res.error else 0


if __name__ == "__main__":
    raise SystemExit(main())
