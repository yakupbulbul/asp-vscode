"""Build the visualizer page (HTML) for a :class:`~asp_studio.solver.Result`."""
from __future__ import annotations

import html as _html
import json
from importlib import resources
from typing import Any, Optional

_STATIC = ("themes.css", "webview.css")
_cache: dict = {}


def _asset(name: str) -> str:
    if name not in _cache:
        _cache[name] = resources.files("asp_studio").joinpath("static", name).read_text(encoding="utf-8")
    return _cache[name]


def _js_json(value: Any) -> str:
    """JSON that is safe to place inside a <script> element."""
    return json.dumps(value).replace("</", "<\\/").replace("<!--", "<\\!--")


def page(result, *, tab: str = "animator", theme: str = "auto", max_height: int = 760, title: str = "program") -> str:
    """A complete, self-contained HTML document showing the visualizer."""
    init = {"state": result.to_state(), "program": result.program, "tab": tab, "theme": theme,
            "maxHeight": max_height, "title": title}
    css = "\n".join(_asset(n) for n in _STATIC)
    return (
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>ASP Studio: {_html.escape(title)}</title><style>{css}</style></head>"
        '<body><div id="app"></div>'
        f"<script>window.__ASP_INIT__ = {_js_json(init)};</script>"
        f"<script>{_asset('engine.js')}</script>"
        f"<script>{_asset('bootstrap.js')}</script>"
        f"<script>{_asset('webview.js')}</script>"
        "</body></html>"
    )


def iframe(result, *, tab: str = "animator", theme: str = "auto", height: Optional[int] = None, max_height: int = 760) -> str:
    """The page wrapped in an isolated <iframe>, ready to display in a notebook output."""
    doc = page(result, tab=tab, theme=theme, max_height=max_height)
    start = height if height else 420
    return (
        '<iframe class="asp-studio" sandbox="allow-scripts allow-same-origin" '
        f'style="width:100%;height:{start}px;border:0;display:block" srcdoc="{_html.escape(doc, quote=True)}"></iframe>'
    )


def show(program_or_result, *, tab: str = "animator", theme: str = "auto", height: Optional[int] = None,
         max_height: int = 760, **solve_kwargs: Any) -> None:
    """Display the visualizer in the current notebook cell. ``program_or_result`` may be ASP text or a Result."""
    try:
        from IPython.display import display
    except ImportError as e:  # pragma: no cover
        raise ImportError("asp_studio.show needs IPython: pip install 'asp-studio[notebook]'") from e
    from .solver import Result, solve
    result = program_or_result if isinstance(program_or_result, Result) else solve(program_or_result, **solve_kwargs)
    display({"text/html": iframe(result, tab=tab, theme=theme, height=height, max_height=max_height)}, raw=True)
