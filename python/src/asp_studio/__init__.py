"""ASP Studio: answer sets, graph and a step-by-step fixpoint animator for Answer Set Programming in Python.

    import asp_studio as asp
    res = asp.solve("a :- not b. b :- not a.")      # clingo Python API under the hood
    asp.show(res)                                   # visualizer in a Jupyter / VS Code notebook

In a notebook: ``%load_ext asp_studio`` and start a cell with ``%%asp``.
"""
from .solver import Diagnostic, Result, solve
from .render import iframe, page, show

__version__ = "0.2.2"
__all__ = ["solve", "show", "Result", "Diagnostic", "page", "iframe", "load_ipython_extension", "__version__"]


def load_ipython_extension(ipython):  # `%load_ext asp_studio`
    from .magic import load_ipython_extension as _load
    _load(ipython)
