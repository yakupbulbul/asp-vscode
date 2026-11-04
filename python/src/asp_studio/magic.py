"""IPython cell magic: ``%%asp`` solves the cell and shows the visualizer."""
from __future__ import annotations

import argparse
import shlex
from typing import Any

from IPython.core.magic import Magics, cell_magic, magics_class

from .render import show
from .solver import solve


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="%%asp", add_help=False)
    p.add_argument("-n", "--models", type=int, default=0, help="max answer sets (0 = all)")
    p.add_argument("-o", "--options", default="", help="extra clingo options, quoted")
    p.add_argument("-t", "--timeout", type=float, default=10.0)
    p.add_argument("--tab", default="animator", choices=["animator", "answers", "graph", "console"])
    p.add_argument("--theme", default="auto", choices=["auto", "light", "dark"])
    p.add_argument("--height", type=int, default=None)
    p.add_argument("--out", default=None, help="store the Result in this variable")
    return p


@magics_class
class AspMagics(Magics):
    @cell_magic
    def asp(self, line: str, cell: str) -> Any:
        """Solve the cell with clingo and show answer sets, graph and animator.

        %%asp [-n N] [-o "--opt-mode=optN"] [-t SECONDS] [--tab animator|answers|graph|console]
              [--theme auto|light|dark] [--height PX] [--out NAME]
        """
        try:
            a = _parser().parse_args(shlex.split(line))
        except SystemExit:
            print(self.asp.__doc__)
            return None
        res = solve(cell, models=a.models, options=a.options, timeout=a.timeout)
        show(res, tab=a.tab, theme=a.theme, height=a.height)
        if a.out:
            self.shell.user_ns[a.out] = res
        return None


def load_ipython_extension(ipython: Any) -> None:
    ipython.register_magics(AspMagics)
