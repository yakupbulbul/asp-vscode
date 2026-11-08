# Changelog

## 0.2.7

- Graph: edges bend only when needed. An edge that would run through another node becomes an arc whose height grows with its length, an edge with an opposite edge bows apart from it, and an edge that repeats the same ends gets its own arc. On a chain of nodes the long edges no longer pile up on the short ones, and in a cycle the edges stay straight. Self-loops point into the emptiest direction instead of always up, so they are no longer cut off at the edge of the picture. Edge labels are larger and have an outline.

## 0.2.6

- Documentation: the commands table now lists **ASP: Open Settings**. The website background is calmer on small screens. No code changes.

## 0.2.5

- Documentation: the README, SECURITY.md and the FAQ are rewritten in plain prose. No code changes.

## 0.2.4

- Security: `asp.clingoPath` is now read only from user or machine settings, so a workspace cannot make the extension run a program of its choosing. In untrusted workspaces, workspace-level `asp.options` are ignored. **ASP: Open viASP for Current File** starts viASP directly instead of typing a command into a shell, so unusual file names cannot inject commands. See SECURITY.md.
- Command line: `-o --opt-mode=optN` now works (values that start with a dash), `--version`, reading the program from standard input with `-`, and `--out` may be a directory. `solve()` accepts `(name, text)` pairs.
- Rewritten READMEs with screenshots and badges, and a CONTRIBUTING guide.
- Online playground on the website: write ASP in the browser, run it with clingo (WebAssembly, nothing is uploaded) and use the same visualizer. Programs can be shared as a link.

## 0.2.3

- New pixel-art logo for the extension icon.
- The visualizer panel now uses black, white and shades of gray, matching the website. Text, background and borders still follow your VS Code theme. Predicates are told apart by shade instead of hue.
- The editor highlight colors `asp.activeRuleBackground` and `asp.activeRuleBorder` are gray by default.

## 0.2.2

- New Python package `asp-studio` (folder `python/`): `%%asp` cell magic, `asp_studio.solve()/show()` and a command-line HTML report, using the same visualizer. The extension itself is unchanged apart from sharing code with it. From this release the Python package uses the same version number as the extension.

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
