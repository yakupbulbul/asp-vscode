"use strict";
const vscode = require("vscode");
const { Controller, isAspDoc } = require("./controller");

function activate(context) {
  const c = new Controller(context);
  const reg = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg("asp.openVisualizer", () => c.openPanel());
  reg("asp.solve", async () => {
    const ed = vscode.window.activeTextEditor;
    if (ed && isAspDoc(ed.document)) c.setTarget(ed.document);
    if (!c.target) { vscode.window.showInformationMessage("ASP Studio: open a .lp file first."); return; }
    await c.run({});
    if (!c.panel) c.log.show(true);
  });
  reg("asp.stepForward", () => c.command("next"));
  reg("asp.stepBack", () => c.command("back"));
  reg("asp.togglePlay", () => c.command("play"));
  reg("asp.resetAnimation", () => c.command("reset"));
  reg("asp.showOutput", () => c.log.show(true));
  reg("asp.selectClingo", () => c.selectClingo());
  reg("asp.setupEnvironment", () => c.env.showSetup());
  reg("asp.removeEnvironment", () => c.env.remove());
  reg("asp.runViasp", () => c.env.runViasp());
  reg("asp.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", "@ext:yakupbulbul.asp-studio"));

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(ed => { c.syncStatusVisibility(); if (ed) c.setTarget(ed.document); }),
    vscode.workspace.onDidChangeTextDocument(e => c.onDocChanged(e)),
    vscode.workspace.onDidSaveTextDocument(d => c.onSaved(d)),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration("asp")) return;
      if (e.affectsConfiguration("asp.clingoPath")) require("./solver").resetClingoCache();
      if (c.panel && c.target) c.schedule(0, false);
      c.post();
    }),
    { dispose: () => c.dispose() },
  );

  if (vscode.window.activeTextEditor) c.setTarget(vscode.window.activeTextEditor.document);
  // offer the native toolchain once, but only when the user is actually working with ASP files
  const offer = setTimeout(() => { if (c.target) c.env.suggestOnce(); }, 4000);
  context.subscriptions.push({ dispose: () => clearTimeout(offer) });
  return { controller: c };                     // exposed for the integration tests
}

function deactivate() {}

module.exports = { activate, deactivate };
