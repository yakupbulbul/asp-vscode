# Changelog

## 0.2.2

- New Python package `asp-studio` (folder `python/`): `%%asp` cell magic, `asp_studio.solve()/show()` and a command-line HTML report, using the same visualizer. The extension itself is unchanged apart from sharing code with it.

## 0.2.1

- Answer Sets and Animator: atoms are grouped under a predicate header (colour, name/arity, count) and shown as compact chips with the predicate name in colour.

## 0.2.0

- **ASP: Set Up Environment…** installs what ASP Studio can use: a native clingo (PyPI package in a private Python environment inside the extension's storage), a syntax highlighter extension, and optionally viASP.
- **ASP: Open viASP for Current File** and **ASP: Remove Private Environment**.
- One-time hint when only the built-in WebAssembly clingo is available.
- The private environment is found automatically; no settings needed.

## 0.1.0

- First release.
- Solve with native clingo or the bundled WebAssembly build; answer sets, costs, timing and diagnostics.
- Visualizer panel with Animator, Answer Sets, Graph and Console views.
- Editor highlighting of the rules that fire in the current animator round.
- Problems panel integration, status bar item, multi-file (folder) scope.
