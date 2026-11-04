"use strict";
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const setup = require("./setup");
const { findClingo, resetClingoCache } = require("./solver");

const HIGHLIGHT_EXTENSION = "abelcour.asp-syntax-highlight";
const HAS_HIGHLIGHTER = /clingo|asp-syntax-highlight|answer-set/i;
const cfg = () => vscode.workspace.getConfiguration("asp");

/** Detects, installs and removes the tools ASP Studio can use. Python tools live in a private venv in global storage. */
class Environment {
  constructor(context, controller) {
    this.context = context;
    this.controller = controller;
    this.dir = path.join(context.globalStorageUri.fsPath, "env");
  }

  /** `{ cmd, args }` running clingo from the private environment, or null. */
  managed() { return setup.managedClingo(this.dir); }

  hasHighlighter() { return vscode.extensions.all.some(e => e.id !== this.context.extension.id && HAS_HIGHLIGHTER.test(e.id)); }

  async status() {
    const [native, packages] = await Promise.all([findClingo(cfg().get("clingoPath"), this.managed()), setup.listPackages(this.dir)]);
    return { native, packages, highlighter: this.hasHighlighter(), viasp: !!(packages && packages.viasp) };
  }

  /* ------------------------------------------------------------------ wizard */
  async showSetup() {
    const st = await this.status();
    const fromEnv = st.packages && st.packages.clingo;
    const items = [
      {
        id: "clingo", picked: !st.native,
        label: "$(zap) Native clingo solver",
        description: st.native ? `installed · clingo ${st.native.version}${fromEnv ? " (private environment)" : ""}` : "not found, using the built-in WebAssembly build",
        detail: "Faster than WebAssembly. Installs the PyPI package `clingo` (about 5 MB) into a private Python environment; nothing outside the extension's storage changes.",
      },
      {
        id: "highlight", picked: !st.highlighter,
        label: "$(symbol-color) Syntax highlighting for .lp files",
        description: st.highlighter ? "installed" : "not installed",
        detail: `Installs the “ASP syntax highlight” extension (${HIGHLIGHT_EXTENSION}) from the Marketplace.`,
      },
      {
        id: "viasp", picked: false,
        label: "$(graph-line) viASP",
        description: st.viasp ? `installed · ${st.packages.viasp}` : "optional",
        detail: "Browser-based explorer for answer sets from the Potassco team. Installs the PyPI package `viasp` (about 60 MB with its dependencies) and adds the command “ASP: Open viASP for Current File”.",
      },
    ];
    const picks = await vscode.window.showQuickPick(items, {
      canPickMany: true, title: "ASP Studio: Set Up Environment",
      placeHolder: "Tick what to install or update. Downloads come from PyPI and the VS Code Marketplace.", ignoreFocusOut: true,
    });
    if (!picks || !picks.length) return;
    await this.install(picks.map(p => p.id));
  }

  async install(ids) {
    const log = this.controller.log;
    const pip = [];
    if (ids.includes("clingo")) pip.push("clingo");
    if (ids.includes("viasp")) pip.push("viasp");
    const outcome = [];
    let failed = null;

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "ASP Studio: setting up", cancellable: true }, async (progress, token) => {
      const ac = new AbortController();
      token.onCancellationRequested(() => ac.abort());
      if (pip.length) {
        progress.report({ message: `installing ${pip.join(", ")} (pip)…` });
        log.appendLine(`[setup] pip install ${pip.join(" ")}`);
        const r = await setup.install(this.dir, pip, { onData: d => log.append(d), signal: ac.signal });
        if (r.ok) outcome.push(...pip); else failed = r.error;
      }
      if (!failed && ids.includes("highlight")) {
        progress.report({ message: "installing syntax highlighting…" });
        try { await vscode.commands.executeCommand("workbench.extensions.installExtension", HIGHLIGHT_EXTENSION); outcome.push("syntax highlighting"); }
        catch (e) { failed = `Could not install ${HIGHLIGHT_EXTENSION}: ${e.message || e}`; }
      }
    });

    resetClingoCache();
    if (failed) {
      log.appendLine("[setup] " + failed);
      const pick = await vscode.window.showErrorMessage(`ASP Studio setup: ${failed.split("\n")[0]}`, "Show Log");
      if (pick) log.show(true);
    } else if (outcome.length) {
      vscode.window.showInformationMessage(`ASP Studio: installed ${outcome.join(", ")}.`);
    }
    if (this.controller.target) this.controller.run({});
  }

  async remove() {
    if (!fs.existsSync(this.dir)) { vscode.window.showInformationMessage("ASP Studio: there is no private environment to remove."); return; }
    const ok = await vscode.window.showWarningMessage("Remove the private Python environment (clingo, viASP) that ASP Studio created?", { modal: true, detail: this.dir }, "Remove");
    if (ok !== "Remove") return;
    setup.remove(this.dir);
    resetClingoCache();
    vscode.window.showInformationMessage("ASP Studio: private environment removed.");
    if (this.controller.target) this.controller.run({});
  }

  /* ------------------------------------------------------------------ viASP */
  async runViasp() {
    const doc = this.controller.target || (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document);
    if (!doc || doc.uri.scheme !== "file") { vscode.window.showInformationMessage("ASP Studio: open a saved .lp file first."); return; }
    const bin = setup.venvTool(this.dir, "viasp");
    if (!fs.existsSync(bin)) {
      const pick = await vscode.window.showInformationMessage("viASP is not installed yet.", "Install viASP");
      if (pick) await this.install(["viasp"]);
      if (!fs.existsSync(bin)) return;
    }
    if (doc.isDirty) await doc.save();
    const term = vscode.window.createTerminal({ name: "viASP" });
    term.show(true);
    term.sendText(`"${bin}" "${doc.fileName}"`);
  }

  /* ------------------------------------------------------------------ first-run hint */
  async suggestOnce() {
    const state = this.context.globalState;
    if (state.get("asp.setupDismissed") || cfg().get("preferWasm")) return;
    if (await findClingo(cfg().get("clingoPath"), this.managed())) return;
    const pick = await vscode.window.showInformationMessage(
      "ASP Studio is using its built-in WebAssembly clingo. Set up a native clingo and syntax highlighting for faster solving?",
      "Set Up…", "Not now", "Don't ask again");
    if (pick === "Set Up…") await this.showSetup();
    else if (pick === "Don't ask again") await state.update("asp.setupDismissed", true);
  }
}

module.exports = { Environment };
