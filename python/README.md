# ASP Studio for Python

Answer sets, a graph and a **step-by-step fixpoint animator** for Answer Set Programming, in Jupyter, VS Code notebooks and on the command line. It uses the [clingo](https://potassco.org/clingo/) Python API and shares its visualizer with the *ASP Studio* VS Code extension.

```bash
pip install "asp-studio[notebook]"
```

## In a notebook

```python
%load_ext asp_studio
```

```text
%%asp
parent(anna,bob). parent(bob,carl). parent(carl,eve).
ancestor(X,Y) :- parent(X,Y).
ancestor(X,Z) :- parent(X,Y), ancestor(Y,Z).
```

The cell output has four tabs: **Animator** (press ▶ or step through the rounds; every round shows which rule fired with which variable bindings), **Answer Sets**, **Graph** and **Console** (clingo messages and error positions).

Cell options:

| Option | Meaning |
|---|---|
| `-n 5` / `--models 5` | at most 5 answer sets (0 = all) |
| `-o "--opt-mode=optN -c n=6"` | extra clingo options |
| `-t 20` | timeout in seconds (default 10) |
| `--tab answers` | first tab: `animator`, `answers`, `graph`, `console` |
| `--theme dark` | `auto` (default), `light`, `dark`; inside VS Code the editor theme is used |
| `--height 500` | start height in pixels (grows with the content) |
| `--out res` | keep the `Result` in the variable `res` |

## From Python

```python
import asp_studio as asp

res = asp.solve("a :- not b. b :- not a.", models=0, timeout=10)
res.result            # 'SATISFIABLE'
list(res)             # [['b'], ['a']]
res.diagnostics       # positions of errors and warnings from clingo
res                   # last expression of a cell: shows the visualizer
asp.show(res, tab="graph")
```

`solve` accepts ASP text, a `pathlib.Path`, or a list of those (joined in order). Errors do not raise: check `res.ok` and `res.error`. With `#minimize`/`#maximize` and a finished search only the optimal models are kept, with their costs in `res.costs`.

## Command line

```bash
python -m asp_studio program.lp --open          # writes program.html and opens it
python -m asp_studio instance.lp encoding.lp -n 3 --tab answers
```

## Notes

- The Animator follows *positive* programs (facts and rules without `not`, no choice rules, constraints or ranges). For other programs it explains what is not supported; Answer Sets, Graph and Console always work.
- The visualizer runs in an isolated `<iframe>`. Jupyter only shows such output in **trusted** notebooks.
- Outside notebooks and VS Code the colour theme follows the operating system.

## Development

```bash
pip install -e ".[test]"
pytest
python sync_static.py     # copy ../media/{engine.js,webview.js,webview.css,themes.css} into the package
```

The visualizer files live in `../media` and are copied into `src/asp_studio/static`; a test fails when the copies drift.

MIT licence. Not affiliated with the Potassco team.
