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

These are design facts a reviewer can check in the source:

- **Local by default.** The extension runs clingo on your machine. The playground runs clingo in your browser as WebAssembly. There is no server and no telemetry, and the website sets no cookies. The browser keeps your last program and theme in local storage.
- **Network use is opt-in.** The only downloads are the packages and extension that **ASP: Set Up Environment…** installs, and only after you confirm. They come from PyPI and the VS Code Marketplace into a private Python environment inside the extension's storage folder.
- **The program to run is not controlled by a workspace.** `asp.clingoPath` is read only from user and machine settings. In an untrusted workspace, workspace-level `asp.options` are ignored. Programs are started with an argument list, never through a shell. This applies from the release after 0.2.3.
- **The panel is locked down.** The VS Code webview has a content security policy with script nonces and can only load files from the extension's `media` folder. Messages it sends back are limited to a short list of actions.
- **Untrusted text is escaped.** Atom names and messages are escaped before they reach the page. The program text embedded in a generated report is encoded so it cannot end the script block. A test covers a `</script>` in a program.
- **Notebook output is isolated.** The Python package renders the visualizer in an `<iframe>` whose content comes from the package, not from the program. Jupyter shows it only in trusted notebooks.
- **Releases.** The Python package is published from GitHub Actions with PyPI trusted publishing, so no upload token exists in the repository. Extension builds are attached to GitHub releases. Third-party code is vendored unmodified and listed in `THIRD-PARTY-NOTICES.md`.

If you find that one of these statements is not true, that is a vulnerability and I want to know.
