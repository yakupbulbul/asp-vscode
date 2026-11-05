# Contributing

Thanks for taking a look. This repository holds three things that share one visualizer: the VS Code extension (`src/`), the Python package (`python/`) and the website with its playground (`docs/`). The panel UI lives in `media/`.

## Setup

```bash
git clone https://github.com/yakupbulbul/asp-vscode.git
cd asp-vscode
npm install
pip install -e "python[test]"
```

## Checks

```bash
npm run lint
npm test                  # extension and site tests
pytest python             # Python package tests
npm run test:integration  # a real VS Code window; set VSCODE_EXECUTABLE to use an installed one
```

A native `clingo` is optional. Tests that need it skip themselves when it is missing.

## When you change `media/`

`media/` is the source of truth for the panel. Two scripts copy it where it is used, and tests fail if a copy is stale:

```bash
python3 python/sync_static.py   # into the Python package
python3 scripts/sync_docs.py    # into the website
python3 scripts/build_demos.py  # regenerate the demo pages (needs the Python package installed)
```

`node scripts/preview.js` renders the panel with real data into `.preview/index.html`, which you can open in a browser.

## Pull requests

Keep a change focused and say what you checked. If it changes what users see, add a line to `CHANGELOG.md`. For a bug, a failing test that the fix turns green is the best evidence.
