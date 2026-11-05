# Security policy

## Supported versions

Security fixes go into the latest release of each part of this project:

| Part | Where | Supported |
|---|---|---|
| VS Code extension | [Releases](https://github.com/yakupbulbul/asp-vscode/releases/latest) | latest version |
| Python package `asp-studio` | [PyPI](https://pypi.org/project/asp-studio/) | latest version |
| Website and playground | [yakupbulbul.github.io/asp-vscode](https://yakupbulbul.github.io/asp-vscode/) | current deployment |

Older versions do not get patches. Update to the latest release first and check whether the problem is still there.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting instead:

1. Go to the [Security tab](https://github.com/yakupbulbul/asp-vscode/security) of this repository.
2. Choose **Report a vulnerability**.
3. Describe what you found.

A good report has the affected part and version, the steps to reproduce it (a small `.lp` file or a workspace is ideal), what you expected and what happened, and your view of the impact.

This is a one-person project. I aim to answer within 7 days, to confirm or dismiss the report within 14 days, and to publish a fix for a confirmed problem as soon as I can. I will credit you in the release notes if you want that. I do not run a bug bounty.

## What counts

Reports I want to hear about:

- Running code or commands the user did not ask for, for example through a crafted workspace, file name, program text or shared playground link.
- The extension starting a program from a place a workspace controls, such as a setting or a file in the repository you opened.
- Script injection into the visualizer, a generated HTML report or the playground, for example through atom names, error messages or the `#p=` link.
- Anything that sends a program or a path off your machine without you asking.
- A problem in how releases are built or published that would let someone else ship code under this project's name.

Out of scope:

- Bugs in clingo, clingo-wasm, VS Code, Jupyter or your browser. Please report those to their own projects. If ASP Studio makes such a bug easier to reach, that part is in scope.
- A program that is simply expensive to solve. Every solve has a timeout (10 seconds by default), and the playground runs clingo in a worker that can be stopped.
- Findings that need a machine that is already compromised.

## How it is built

Everything runs on your machine. The extension starts clingo locally, and the playground runs it in your browser as WebAssembly, in a worker that the page can stop. There is no server behind either one, no telemetry, and the website sets no cookies. The browser only remembers your last playground program and your theme choice, in local storage.

The network is used in one place. If you run **ASP: Set Up Environment…** and confirm, the extension installs packages from PyPI into a private Python environment in its own storage folder, and asks VS Code to install a syntax highlighter from the Marketplace. Nothing else is downloaded.

A workspace cannot choose which program the extension runs. `asp.clingoPath` is read from your user and machine settings only, and in an untrusted workspace any `asp.options` the workspace sets are ignored. Processes are started with an argument list, never through a shell, which includes viASP. Version 0.2.4 is the first to work this way. Earlier versions read `asp.clingoPath` from workspace settings, so please update.

The visualizer treats program text as hostile. Atom names and clingo messages are escaped before they reach the page, and the program text inside a generated report is encoded so it cannot close the script block (a test feeds it a `</script>`). The VS Code panel has a content security policy that allows only nonce-marked scripts and the extension's own `media` folder, and it can send back only a short list of messages. In notebooks the visualizer sits in an `<iframe>` whose code comes from the package, and Jupyter shows it only in trusted notebooks.

The Python package is published from GitHub Actions with PyPI trusted publishing, so there is no upload token in the repository to steal. Extension builds are attached to GitHub releases. The vendored clingo and clingo-wasm files are unmodified and listed in `THIRD-PARTY-NOTICES.md`.

If you find that any of this is not true, treat it as a vulnerability and tell me.
