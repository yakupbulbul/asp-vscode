"""Solve an ASP program with the clingo Python API and keep everything the visualizer needs."""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Union

import clingo

Program = Union[str, Path]

_DIAG = re.compile(
    r"^(?:<block>|<string>|-):(\d+):(\d+)(?:-(\d+))?(?::(\d+)(?:-(\d+))?)?: (error|warning|info): (.*)$"
)


@dataclass
class Diagnostic:
    line: int
    col: int
    end_col: int
    severity: str
    message: str


@dataclass(repr=False)
class Result:
    """Outcome of :func:`solve`. Iterating yields the answer sets (lists of atom strings)."""

    program: str
    version: str = clingo.__version__
    command: str = ""
    result: str = "UNKNOWN"
    models: List[List[str]] = field(default_factory=list)
    costs: List[Optional[List[int]]] = field(default_factory=list)
    more: bool = False
    ms: int = 0
    time: Optional[float] = None
    stderr: str = ""
    diagnostics: List[Diagnostic] = field(default_factory=list)
    error: Optional[str] = None
    timed_out: bool = False

    def __repr__(self) -> str:
        if self.error:
            return f"Result(error={self.error!r})"
        return f"Result({self.result}, {len(self.models)} model{'s' if len(self.models) != 1 else ''}, {self.ms} ms)"

    @property
    def ok(self) -> bool:
        """True if the program ran without error (it may still be unsatisfiable)."""
        return self.error is None

    @property
    def satisfiable(self) -> bool:
        return self.ok and bool(self.models)

    def __iter__(self):
        return iter(self.models)

    def __len__(self) -> int:
        return len(self.models)

    def __getitem__(self, i: int) -> List[str]:
        return self.models[i]

    def to_state(self) -> Dict[str, Any]:
        """The ``solve`` object the visualizer front end renders."""
        state: Dict[str, Any] = {
            "engine": "python",
            "version": self.version,
            "command": self.command,
            "result": self.result,
            "models": [{"atoms": a, "costs": c} for a, c in zip(self.models, self.costs)],
            "totalModels": len(self.models),
            "more": self.more,
            "ms": self.ms,
            "time": self.time,
            "stderr": self.stderr,
            "capped": 0,
            "diagnostics": [
                {"sourceIndex": 0, "file": "program", "line": d.line, "col": d.col, "endCol": d.end_col,
                 "severity": d.severity, "message": d.message}
                for d in self.diagnostics
            ],
        }
        if self.error:
            state["error"] = self.error
            state["timedOut"] = self.timed_out
        return state

    def _repr_html_(self) -> str:  # picked up by Jupyter when a Result is the last expression of a cell
        from .render import iframe
        return iframe(self)

    def show(self, **kwargs: Any) -> None:
        from .render import show
        show(self, **kwargs)


def _read(programs: Union[Program, Sequence[Program]]) -> str:
    items: Iterable[Program] = [programs] if isinstance(programs, (str, Path)) else programs
    parts = [p.read_text(encoding="utf-8") if isinstance(p, Path) else p for p in items]
    return "\n".join(parts) + "\n"


def _parse_messages(messages: Sequence[str]) -> List[Diagnostic]:
    out: List[Diagnostic] = []
    for msg in messages:
        lines = msg.split("\n")
        m = _DIAG.match(lines[0])
        if not m:
            continue
        col = int(m.group(2))
        # `L:C1-C2` marks a range on one line; `L:C1-L2:C2` spans lines, then only the start is used
        end = int(m.group(3)) if m.group(3) and m.group(4) is None else col + 1
        text = m.group(7)
        extra = [l.strip() for l in lines[1:] if l.strip() and not l.startswith("***")]
        if extra:
            text += "\n" + "\n".join(extra)
        sev = {"error": "error", "info": "info"}.get(m.group(6), "warning")
        out.append(Diagnostic(int(m.group(1)), col, end, sev, text))
    return out


def solve(
    program: Union[Program, Sequence[Program]],
    *,
    models: int = 0,
    options: Union[str, Sequence[str]] = (),
    timeout: float = 10.0,
) -> Result:
    """Solve ``program`` and return a :class:`Result`.

    ``program`` is ASP text, a :class:`pathlib.Path`, or a list of those (joined in order).
    ``models`` limits the number of answer sets (0 = all). ``options`` are extra clingo options,
    either a list or one string such as ``"--opt-mode=optN -c n=6"``. ``timeout`` is in seconds.
    With optimisation statements and a finished search only the optimal models are kept.
    """
    text = _read(program)
    opts = options.split() if isinstance(options, str) else list(options)
    args = [str(max(0, int(models)))] + opts
    res = Result(program=text, command="clingo.Control(" + repr(args) + ")")
    messages: List[str] = []
    found: List[Any] = []
    exhausted = False
    t0 = time.perf_counter()

    def on_model(m: clingo.Model) -> None:
        found.append(([str(s) for s in m.symbols(shown=True)], list(m.cost) if m.cost else None, m.optimality_proven))

    try:
        ctl = clingo.Control(args, lambda code, msg: messages.append(msg), 50)
        ctl.add("base", [], text)
        ctl.ground([("base", [])])
        handle = ctl.solve(on_model=on_model, async_=True)
        if not handle.wait(timeout):
            handle.cancel()
            handle.get()
            res.timed_out = True
            res.error = f"Timeout after {timeout:g} s."
        else:
            sr = handle.get()
            res.result = "SATISFIABLE" if sr.satisfiable else "UNSATISFIABLE" if sr.unsatisfiable else "UNKNOWN"
            exhausted = bool(sr.exhausted)
            res.more = bool(models) and len(found) >= models and not exhausted
            try:
                res.time = float(ctl.statistics["summary"]["times"]["total"])
            except Exception:  # statistics are optional
                res.time = None
    except RuntimeError as e:
        res.error = str(e)
    res.diagnostics = _parse_messages(messages)
    if res.error and not res.timed_out and any(d.severity == "error" for d in res.diagnostics):
        res.error = "The program has a syntax or semantic error."
    res.stderr = "".join(m if m.endswith("\n") else m + "\n" for m in messages)
    res.ms = round((time.perf_counter() - t0) * 1000)

    if res.error is None:
        optimising = any(f[1] for f in found)
        keep = found
        if optimising and exhausted:                     # search finished: only the best cost is optimal
            best = min(tuple(f[1] or ()) for f in found)
            keep = [f for f in found if tuple(f[1] or ()) == best]
            res.result = "OPTIMUM FOUND"
        seen = set()
        for atoms, cost, _ in keep:
            key = tuple(atoms)
            if key in seen:
                continue
            seen.add(key)
            res.models.append(atoms)
            res.costs.append(cost)
    return res
