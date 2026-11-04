#!/usr/bin/env node
"use strict";
/* Dev harness: renders media/webview.js in a plain browser with real solver + engine output and fake VS Code theme variables.
 * Usage: node scripts/preview.js [file.lp] [--dark|--light]   -> writes .preview/index.html */
const fs = require("fs");
const path = require("path");
const { solve } = require("../src/solver");
const { buildAnimation, trimResult } = require("../src/model");

const DARK = "--vscode-foreground:#cccccc;--vscode-descriptionForeground:#9d9d9d;--vscode-editor-background:#1f1f1f;--vscode-editorWidget-background:#202020;--vscode-widget-border:#2b2b2b;--vscode-focusBorder:#0078d4;--vscode-button-background:#0078d4;--vscode-button-foreground:#fff;--vscode-button-hoverBackground:#026ec1;--vscode-button-secondaryBackground:#313131;--vscode-button-secondaryForeground:#cccccc;--vscode-badge-background:#616161;--vscode-badge-foreground:#f8f8f8;--vscode-charts-blue:#3794ff;--vscode-charts-orange:#d18616;--vscode-charts-green:#89d185;--vscode-charts-purple:#b180d7;--vscode-charts-red:#f14c4c;--vscode-charts-yellow:#cca700;--vscode-testing-iconPassed:#73c991;--vscode-testing-iconFailed:#f14c4c;--vscode-editorWarning-foreground:#cca700;--vscode-dropdown-background:#313131;--vscode-dropdown-foreground:#ccc;--vscode-dropdown-border:#3c3c3c;--vscode-font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--vscode-font-size:13px;--vscode-editor-font-family:Menlo,Monaco,monospace;--vscode-editor-font-size:12px;";
const LIGHT = "--vscode-foreground:#3b3b3b;--vscode-descriptionForeground:#717171;--vscode-editor-background:#ffffff;--vscode-editorWidget-background:#f8f8f8;--vscode-widget-border:#c8c8c8;--vscode-focusBorder:#005fb8;--vscode-button-background:#005fb8;--vscode-button-foreground:#fff;--vscode-button-hoverBackground:#0258a8;--vscode-button-secondaryBackground:#e5e5e5;--vscode-button-secondaryForeground:#3b3b3b;--vscode-badge-background:#cccccc;--vscode-badge-foreground:#3b3b3b;--vscode-charts-blue:#1a85ff;--vscode-charts-orange:#d18616;--vscode-charts-green:#388a34;--vscode-charts-purple:#652d90;--vscode-charts-red:#e51400;--vscode-charts-yellow:#bf8803;--vscode-testing-iconPassed:#388a34;--vscode-testing-iconFailed:#f14c4c;--vscode-editorWarning-foreground:#bf8803;--vscode-dropdown-background:#fff;--vscode-dropdown-foreground:#3b3b3b;--vscode-dropdown-border:#cecece;--vscode-font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--vscode-font-size:13px;--vscode-editor-font-family:Menlo,Monaco,monospace;--vscode-editor-font-size:12px;";

(async () => {
  const file = process.argv.find(a => a.endsWith(".lp")) || path.join(__dirname, "..", "test", "fixtures", "ancestor.lp");
  const light = process.argv.includes("--light");
  const sources = [{ name: path.basename(file), text: fs.readFileSync(file, "utf8") }];
  const result = await solve(sources, { models: 0 });
  const anim = buildAnimation(sources).view;
  const state = { type: "state", file: { name: sources[0].name, scope: "activeFile" }, status: result.error ? "error" : "done", solve: trimResult(result, sources, 100), anim, empty: false, settings: { speed: 1400 } };
  const media = f => fs.readFileSync(path.join(__dirname, "..", "media", f), "utf8");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>:root{${light ? LIGHT : DARK}}</style><style>${media("webview.css")}</style></head>
<body><div id="app"></div><script>
window.__sent=[]; window.acquireVsCodeApi=()=>({postMessage:m=>{window.__sent.push(m); if(m.type==='ready') setTimeout(()=>window.postMessage(${JSON.stringify(state)},'*'),0);},getState:()=>null,setState:()=>{}});
</script><script>${media("webview.js")}</script></body></html>`;
  const out = path.join(__dirname, "..", ".preview");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "index.html"), html);
  console.log("wrote .preview/index.html");
})();
