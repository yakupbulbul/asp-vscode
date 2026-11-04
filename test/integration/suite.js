"use strict";
/* Runs inside the VS Code extension host. Exports run() as @vscode/test-electron expects. */
const assert = require("assert");
const path = require("path");
const vscode = require("vscode");

const wait = (cond, ms = 15000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const tick = () => { let v; try { v = cond(); } catch (e) { return reject(e); } if (v) return resolve(v); if (Date.now() - t0 > ms) return reject(new Error("timeout waiting for condition")); setTimeout(tick, 50); };
  tick();
});

async function run() {
  const ext = vscode.extensions.getExtension("yakupbulbul.asp-studio");
  assert.ok(ext, "extension is installed in the dev host");
  const api = await ext.activate();
  const c = api.controller;
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;

  const cmds = await vscode.commands.getCommands(true);
  for (const id of ["asp.openVisualizer", "asp.solve", "asp.stepForward", "asp.stepBack", "asp.togglePlay", "asp.resetAnimation", "asp.selectClingo"])
    assert.ok(cmds.includes(id), "command registered: " + id);

  // --- solve a good file
  const good = await vscode.workspace.openTextDocument(path.join(ws, "ancestor.lp"));
  await vscode.window.showTextDocument(good);
  await vscode.commands.executeCommand("asp.solve");
  await wait(() => c.state.status === "done");
  assert.strictEqual(c.state.solve.result, "SATISFIABLE");
  assert.strictEqual(c.state.solve.totalModels, 1);
  assert.strictEqual(vscode.languages.getDiagnostics(good.uri).length, 0);

  // --- visualizer panel: webview boots, receives state and reports animator steps
  await vscode.commands.executeCommand("asp.openVisualizer");
  await wait(() => c.panel && c.ready && c.state.anim && c.state.status === "done");
  assert.strictEqual(c.state.anim.rounds.length, 4, "ancestor needs rounds 0..3");

  // rule highlighting follows animator steps (decorations cannot be read back, so we only require that it runs cleanly)
  c.highlight({ round: 2, rules: { 5: 3 } });
  c.highlight({ round: 0, rules: { 0: 1, 1: 1 } });
  c.clearHighlights();
  await vscode.commands.executeCommand("asp.stepForward");
  await vscode.commands.executeCommand("asp.togglePlay");
  await vscode.commands.executeCommand("asp.togglePlay");

  // --- reveal a rule in the editor
  await c.reveal(5);
  assert.strictEqual(vscode.window.activeTextEditor.selection.active.line, 6, "rule 6 sits on line 7 of the file");

  // --- syntax errors become Problems entries
  const bad = await vscode.workspace.openTextDocument(path.join(ws, "broken.lp"));
  await vscode.window.showTextDocument(bad);
  await wait(() => c.target && c.target.uri.toString() === bad.uri.toString());
  await vscode.commands.executeCommand("asp.solve");
  await wait(() => c.state.status === "error");
  const diags = await wait(() => { const d = vscode.languages.getDiagnostics(bad.uri); return d.length ? d : null; });
  assert.strictEqual(diags[0].severity, vscode.DiagnosticSeverity.Error);
  assert.strictEqual(diags[0].range.start.line, 1);
  assert.strictEqual(diags[0].source, "clingo");

  // --- WebAssembly fallback gives the same answer
  await vscode.workspace.getConfiguration("asp").update("preferWasm", true, vscode.ConfigurationTarget.Global);
  await vscode.window.showTextDocument(good);
  await wait(() => c.target.uri.toString() === good.uri.toString());
  await vscode.commands.executeCommand("asp.solve");
  await wait(() => c.state.status === "done" && c.state.solve.engine === "wasm");
  assert.strictEqual(c.state.solve.result, "SATISFIABLE");
  await vscode.workspace.getConfiguration("asp").update("preferWasm", undefined, vscode.ConfigurationTarget.Global);
}

module.exports = { run };
