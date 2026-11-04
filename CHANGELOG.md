# Changelog

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
