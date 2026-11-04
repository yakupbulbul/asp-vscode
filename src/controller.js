"use strict";
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { solve, findClingo, resetClingoCache } = require("./solver");
const { buildAnimation, trimResult } = require("./model");
const { getHtml } = require("./panel");

const ASP_EXT = /\.(lp|asp|lpx)$/i;
const isAspDoc = doc => !!doc && doc.uri.scheme !== "output" && (ASP_EXT.test(doc.fileName) || ["clingo", "asp", "lp"].includes(doc.languageId));
const cfg = () => vscode.workspace.getConfiguration("asp");

class Controller {
  constructor(context) {
    this.context = context;
    this.log = vscode.window.createOutputChannel("ASP Studio");
    this.diagnostics = vscode.languages.createDiagnosticCollection("asp");
    this.status = vscode.window.createStatusBarItem("asp.status", vscode.StatusBarAlignment.Left, 50);
    this.status.name = "ASP Studio";
    this.status.command = "asp.openVisualizer";
    this.panel = null;
    this.ready = false;
    this.target = null;              // TextDocument the visualizer follows
    this.state = { status: "idle", solve: null, anim: null };
    this.seq = 0;
    this.abort = null;
    this.timer = null;
    this.sources = [];
    this.rules = [];                 // animator rules with source mapping (for editor highlighting)
    this.ruleDeco = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor("asp.activeRuleBackground"),
      borderColor: new vscode.ThemeColor("asp.activeRuleBorder"),
      borderStyle: "solid", borderWidth: "0 0 0 3px",
      overviewRulerColor: new vscode.ThemeColor("asp.activeRuleBorder"),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    this.noteDeco = vscode.window.createTextEditorDecorationType({});
    context.subscriptions.push(this.log, this.diagnostics, this.status, this.ruleDeco, this.noteDeco);
    this.syncStatusVisibility();
  }

  /* ------------------------------------------------------------------ targeting */
  setTarget(doc) {
    if (!isAspDoc(doc)) return false;
    const changed = !this.target || this.target.uri.toString() !== doc.uri.toString();
    this.target = doc;
    if (changed && this.panel) this.schedule(0, true);
    return true;
  }

  syncStatusVisibility() {
    const ed = vscode.window.activeTextEditor;
    if (ed && isAspDoc(ed.document)) this.status.show(); else this.status.hide();
  }

  /* ------------------------------------------------------------------ program assembly */
  async collectSources(doc) {
    const scope = cfg().get("scope");
    if (scope !== "folder" || doc.uri.scheme !== "file") return [{ uri: doc.uri, name: path.basename(doc.fileName), text: doc.getText() }];
    const dir = path.dirname(doc.fileName);
    let names = [];
    try { names = fs.readdirSync(dir).filter(f => ASP_EXT.test(f)).sort(); } catch { /* unreadable dir */ }
    const out = [];
    for (const f of names) {
      const full = path.join(dir, f);
      const open = vscode.workspace.textDocuments.find(d => d.uri.fsPath === full);
      let text;
      try { text = open ? open.getText() : fs.readFileSync(full, "utf8"); } catch { continue; }
      out.push({ uri: vscode.Uri.file(full), name: f, text });
    }
    return out.length ? out : [{ uri: doc.uri, name: path.basename(doc.fileName), text: doc.getText() }];
  }

  /* ------------------------------------------------------------------ solving */
  schedule(delay, auto) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run({ auto }), delay);
  }

  async run({ auto = false, quiet = false } = {}) {
    const doc = this.target;
    if (!doc) return;
    if (this.abort) this.abort.abort();
    const abort = this.abort = new AbortController();
    const my = ++this.seq;
    const c = cfg();
    const sources = await this.collectSources(doc);
    if (my !== this.seq) return;
    this.sources = sources;

    let models = c.get("models");
    let capped = 0;
    if (auto && models === 0) { models = c.get("autoRunMaxModels"); capped = models; }
    if (quiet && !this.panel) models = 1;                // save-time check only needs diagnostics

    if (!sources.some(s => s.text.trim())) {
      this.diagnostics.clear();
      this.setState({ status: "idle", solve: null, anim: null, empty: true });
      this.updateStatusBar();
      return;
    }
    this.setState({ ...this.state, status: "solving", empty: false });
    this.updateStatusBar();

    const result = await solve(sources, {
      models, extraArgs: c.get("options"), timeoutSeconds: c.get("timeoutSeconds"),
      clingoPath: c.get("clingoPath"), preferWasm: c.get("preferWasm"), signal: abort.signal,
    });
    if (my !== this.seq || result.cancelled) return;
    result.capped = capped;
    this.log.appendLine(`[${new Date().toLocaleTimeString()}] ${result.command}  (${result.engine} ${result.version}, ${result.ms} ms)` +
      ` -> ${result.error ? "ERROR: " + result.error : result.result + ", " + result.models.length + " model(s)"}`);
    if (result.stderr.trim()) this.log.appendLine(result.stderr.trimEnd());

    this.publishDiagnostics(sources, result);
    let anim = null;
    if (this.panel) { const built = buildAnimation(sources); this.rules = built.locations; anim = built.view; }
    this.setState({ status: result.error ? "error" : "done", solve: trimResult(result, sources, c.get("maxModelsShown")), anim, empty: false });
    this.updateStatusBar();
  }

  publishDiagnostics(sources, result) {
    this.diagnostics.clear();
    const bySource = sources.map(() => []);
    for (const d of result.diagnostics) {
      const doc = vscode.workspace.textDocuments.find(x => x.uri.toString() === sources[d.sourceIndex].uri.toString());
      const lineIdx = Math.max(0, d.line - 1);
      const lineLen = doc && lineIdx < doc.lineCount ? doc.lineAt(lineIdx).text.length : 200;
      const start = Math.max(0, d.col - 1), end = d.endCol > d.col ? d.endCol - 1 : Math.min(lineLen, start + 1);
      const sev = d.severity === "error" ? vscode.DiagnosticSeverity.Error : d.severity === "info" ? vscode.DiagnosticSeverity.Information : vscode.DiagnosticSeverity.Warning;
      const diag = new vscode.Diagnostic(new vscode.Range(lineIdx, start, lineIdx, Math.max(end, start + 1)), d.message, sev);
      diag.source = "clingo";
      bySource[d.sourceIndex].push(diag);
    }
    sources.forEach((s, i) => this.diagnostics.set(s.uri, bySource[i]));
  }

  updateStatusBar() {
    const s = this.state, r = s.solve;
    let text, tip = "ASP Studio: open the visualizer";
    if (s.status === "solving") text = "$(sync~spin) ASP";
    else if (!r) text = "$(symbol-event) ASP";
    else if (r.error) { text = r.timedOut ? "$(watch) ASP timeout" : "$(error) ASP error"; tip = r.error; }
    else if (r.result === "UNSATISFIABLE") text = "$(circle-slash) UNSAT";
    else {
      const n = r.totalModels;
      text = `$(check) ${n}${r.more ? "+" : ""} model${n === 1 ? "" : "s"}`;
      tip = `${r.result} · ${r.ms} ms · clingo ${r.version} (${r.engine})`;
    }
    this.status.text = text;
    this.status.tooltip = tip + "\nClick to open the visualizer";
    this.status.backgroundColor = s.solve && s.solve.error ? new vscode.ThemeColor("statusBarItem.errorBackground") : undefined;
  }

  /* ------------------------------------------------------------------ webview */
  setState(next) {
    this.state = next;
    this.post();
  }

  post() {
    if (!this.panel || !this.ready) return;
    const c = cfg();
    this.panel.webview.postMessage({
      type: "state",
      file: this.target ? { name: path.basename(this.target.fileName), scope: c.get("scope") } : null,
      ...this.state,
      settings: { speed: c.get("animator.speed"), maxModels: c.get("maxModelsShown"), autoRun: c.get("autoRun") },
    });
  }

  async openPanel() {
    const ed = vscode.window.activeTextEditor;
    if (ed) this.setTarget(ed.document);
    if (this.panel) { this.panel.reveal(vscode.ViewColumn.Beside, true); return; }
    this.panel = vscode.window.createWebviewPanel("asp.visualizer", "ASP Visualizer", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")] });
    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "icon.svg");
    this.panel.webview.html = getHtml(this.panel.webview, this.context.extensionUri);
    vscode.commands.executeCommand("setContext", "asp.panelOpen", true);
    this.panel.onDidDispose(() => {
      this.panel = null; this.ready = false; this.clearHighlights();
      vscode.commands.executeCommand("setContext", "asp.panelOpen", false);
    }, null, this.context.subscriptions);
    this.panel.webview.onDidReceiveMessage(m => this.onMessage(m), null, this.context.subscriptions);
  }

  async onMessage(m) {
    switch (m.type) {
      case "ready": this.ready = true; this.post(); if (this.target) this.run({}); break;
      case "solve": this.run({}); break;
      case "reveal": await this.reveal(m.rule); break;
      case "revealLine": await this.revealLine(m.file, m.line); break;
      case "step": this.highlight(m); break;
      case "openSettings": vscode.commands.executeCommand("workbench.action.openSettings", "@ext:yakupbulbul.asp-studio"); break;
      case "copy": await vscode.env.clipboard.writeText(String(m.text || "")); vscode.window.setStatusBarMessage("ASP: copied", 1500); break;
      case "pickClingo": vscode.commands.executeCommand("asp.selectClingo"); break;
    }
  }

  command(name) { if (this.panel && this.ready) this.panel.webview.postMessage({ type: "command", name }); }

  /* ------------------------------------------------------------------ editor integration */
  editorsFor(uri) { return vscode.window.visibleTextEditors.filter(e => e.document.uri.toString() === uri.toString()); }

  async reveal(ruleIdx) {
    const r = this.rules[ruleIdx];
    if (!r) return;
    await this.revealLine(this.sources[r.sourceIndex].name, r.line + 1);
  }

  async revealLine(fileName, line) {
    const src = this.sources.find(s => s.name === fileName) || this.sources[0];
    if (!src) return;
    const doc = await vscode.workspace.openTextDocument(src.uri);
    const ed = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: true, preview: false });
    const pos = new vscode.Position(Math.max(0, line - 1), 0);
    ed.selection = new vscode.Selection(pos, pos);
    ed.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  /** Highlight the rules that fire in the current round. `m.rules` maps rule index -> number of new atoms. */
  highlight(m) {
    this.clearHighlights();
    if (!cfg().get("animator.highlightRules")) return;
    const per = new Map();                                    // uri -> { ranges, notes }
    for (const [idx, count] of Object.entries(m.rules || {})) {
      const r = this.rules[+idx];
      if (!r) continue;
      const src = this.sources[r.sourceIndex], k = src.uri.toString();
      const e = per.get(k) || { uri: src.uri, ranges: [], notes: [] };
      e.ranges.push(new vscode.Range(r.line, 0, r.endLine, 0));
      const label = m.round === 0 ? "fact" : `round ${m.round}: +${count} atom${count === 1 ? "" : "s"}`;
      e.notes.push({
        range: new vscode.Range(r.endLine, 0, r.endLine, 0),
        renderOptions: { after: { contentText: "  ← " + label, color: new vscode.ThemeColor("editorCodeLens.foreground"), fontStyle: "italic" } },
      });
      per.set(k, e);
    }
    for (const e of per.values()) for (const ed of this.editorsFor(e.uri)) {
      ed.setDecorations(this.ruleDeco, e.ranges);
      ed.setDecorations(this.noteDeco, e.notes);
    }
  }

  clearHighlights() {
    for (const ed of vscode.window.visibleTextEditors) { ed.setDecorations(this.ruleDeco, []); ed.setDecorations(this.noteDeco, []); }
  }

  /* ------------------------------------------------------------------ commands & events */
  async selectClingo() {
    const picked = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: "Use this clingo", title: "Select the clingo executable" });
    if (!picked || !picked[0]) return;
    await cfg().update("clingoPath", picked[0].fsPath, vscode.ConfigurationTarget.Global);
    resetClingoCache();
    const found = await findClingo(picked[0].fsPath);
    vscode.window.showInformationMessage(found ? `ASP Studio: using clingo ${found.version} at ${found.path}` : "ASP Studio: that file did not run as clingo; falling back to auto-detection.");
    if (this.target) this.run({});
  }

  onDocChanged(e) {
    if (!this.panel || !this.target || e.document.uri.toString() !== this.target.uri.toString()) {
      if (this.panel && cfg().get("scope") === "folder" && isAspDoc(e.document) && this.target && path.dirname(e.document.fileName) === path.dirname(this.target.fileName)) this.schedule(cfg().get("autoRunDelay"), true);
      return;
    }
    this.clearHighlights();
    if (cfg().get("autoRun")) this.schedule(cfg().get("autoRunDelay"), true);
  }

  onSaved(doc) {
    if (!isAspDoc(doc)) return;
    if (this.panel && this.target && doc.uri.toString() === this.target.uri.toString() && cfg().get("autoRun")) return;   // auto-run already covers it
    if (!this.panel && !cfg().get("runOnSave")) return;
    this.target = doc;
    this.run({ quiet: !this.panel });
  }

  dispose() { if (this.abort) this.abort.abort(); clearTimeout(this.timer); }
}

module.exports = { Controller, isAspDoc };
