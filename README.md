# ASP Studio

Run [clingo](https://potassco.org/clingo/), explore answer sets and watch how a logic program grows round by round, without leaving VS Code.

ASP Studio is built for people learning and writing **Answer Set Programming** (`.lp` files). It pairs well with a syntax highlighter such as *Clingo for VSCode*.

## Features

- **Solve on demand or while you type.** Answer sets, optimisation costs, timing and clingo's own messages appear next to your code.
- **Problems panel integration.** Syntax errors and warnings from clingo are underlined in the editor.
- **Animator.** Step through the fixpoint iteration of a positive program: which rule fired, with which variable bindings, and which atoms appeared in each round. The rules that fire in the current round are **highlighted in your editor**, with a note such as `← round 2: +3 atoms`. Click a rule in the visualizer to jump to its line.
- **Graph view.** Binary atoms (`edge(a,b)`, `ancestor(X,Y)`) are drawn as a graph; unary atoms become labels. Switch between answer sets, hide predicates, drag nodes.
- **Works out of the box.** A native `clingo` is used when found (PATH, conda, Homebrew). Otherwise a bundled WebAssembly build of clingo 5.8 runs inside the extension, so nothing has to be installed.
- **Multi-file programs.** Optionally solve every `.lp` file in a folder together, for example `instance.lp` + `encoding.lp`.
- **Theme-aware.** The visualizer uses your VS Code colours, in light, dark and high-contrast themes.

## Quick start

1. Open a `.lp` file.
2. Click the **graph** icon in the editor title bar, or run **ASP: Open Visualizer** from the Command Palette.
3. Edit the program. The visualizer updates automatically. Press **Solve** (or `⌘⌥Enter` / `Ctrl+Alt+Enter`) to compute every answer set.

```prolog
parent(anna,bob). parent(bob,carl). parent(carl,eve).
ancestor(X,Y) :- parent(X,Y).
ancestor(X,Z) :- parent(X,Y), ancestor(Y,Z).
```

Open the **Animator** tab and press **Step**: round 0 holds the facts, round 1 adds the direct ancestors, rounds 2 and 3 add the longer chains, and the iteration stops when nothing new can be derived (the *fixpoint*).

## Set up the tools

Run **ASP: Set Up Environment…** (or click *get native clingo* in the visualizer). You choose what to install:

| Component | What happens |
|---|---|
| Native clingo solver | `pip install clingo` into a private Python environment in the extension's storage, used automatically (`python -m clingo`). Needs Python 3.8+. |
| Syntax highlighting | Installs the Marketplace extension `abelcour.asp-syntax-highlight`. |
| viASP (optional) | `pip install viasp` into the same environment. Then **ASP: Open viASP for Current File** starts it. |

Nothing is downloaded without your confirmation, and nothing outside the extension's storage is changed. **ASP: Remove Private Environment** deletes it again. Without any setup, the bundled WebAssembly clingo keeps working.

## Animator limits

The Animator follows a *positive* program (facts and rules without `not`). It does not handle negation, choice rules `{ ... }`, constraints `:- ...` or ranges `1..n`. For those programs the Answer Sets and Graph tabs still work, and the Animator tells you which line is not supported.

## Commands and keys

| Command | Default key |
|---|---|
| ASP: Open Visualizer | editor title icon |
| ASP: Solve Current File | `⌘⌥Enter` · `Ctrl+Alt+Enter` |
| ASP: Animator: Step Forward / Back | `Ctrl+Alt+→` / `Ctrl+Alt+←` |
| ASP: Animator: Play / Pause | `Ctrl+Alt+Space` |
| ASP: Set Up Environment… | |
| ASP: Open viASP for Current File | |
| ASP: Remove Private Environment | |
| ASP: Select clingo Executable… | |
| ASP: Show Output Log | |

Inside the visualizer: `←` `→` step, `Space` play or pause, `R` reset.

## Settings

| Setting | Default | Description |
|---|---|---|
| `asp.clingoPath` | `""` | Path to a native clingo. Empty = auto-detect, then WebAssembly. |
| `asp.preferWasm` | `false` | Always use the bundled WebAssembly clingo. |
| `asp.models` | `0` | Maximum answer sets (`0` = all). |
| `asp.options` | `[]` | Extra clingo options, e.g. `["--opt-mode=optN", "-c", "n=6"]`. |
| `asp.timeoutSeconds` | `10` | Stop long computations. |
| `asp.scope` | `activeFile` | `folder` solves all `.lp` files of the folder together. |
| `asp.autoRun` / `asp.autoRunDelay` | `true` / `500` | Re-solve while the visualizer is open. |
| `asp.autoRunMaxModels` | `50` | Model cap for auto-run when `asp.models` is `0`. |
| `asp.runOnSave` | `true` | Check files on save and fill the Problems panel. |
| `asp.maxModelsShown` | `100` | Answer sets rendered in the visualizer. |
| `asp.animator.speed` | `1400` | Milliseconds per round while playing. |
| `asp.animator.highlightRules` | `true` | Highlight firing rules in the editor. |

Theme colours `asp.activeRuleBackground` and `asp.activeRuleBorder` can be overridden in `workbench.colorCustomizations`.

## Install from source

```bash
git clone https://github.com/yakupbulbul/asp-vscode.git
cd asp-vscode
npm install
npm run package          # creates asp-studio-<version>.vsix
code --install-extension asp-studio-*.vsix
```

## Development

```bash
npm test                 # unit tests (node:test); native-clingo tests are skipped if clingo is missing
node scripts/preview.js  # renders the visualizer with real data in .preview/index.html (serve it and open in a browser)
```

Press `F5` in VS Code to start an Extension Development Host.

Layout: `src/` extension host (solver wrapper, controller, helpers) · `media/` webview UI and the fixpoint engine · `vendor/` unmodified clingo-wasm 0.6.0 · `test/` unit tests.

## Credits and licence

MIT, see [LICENSE](LICENSE). Bundled third-party software (clingo, clingo-wasm) is listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). This project is not affiliated with the Potassco team.
