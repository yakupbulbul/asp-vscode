#!/usr/bin/env node
"use strict";
/* Dev harness: renders media/webview.js in a plain browser with real solver + engine output and fake VS Code theme variables.
 * Usage: node scripts/preview.js [file.lp] [--dark|--light] [--tab=anim|ground|models|graph|console]   -> writes .preview/index.html */
const fs = require("fs");
const path = require("path");
const { solve } = require("../src/solver");
const { buildAnimation, buildGrounding, trimResult } = require("../src/model");


(async () => {
  const file = process.argv.find(a => a.endsWith(".lp")) || path.join(__dirname, "..", "test", "fixtures", "ancestor.lp");
  const light = process.argv.includes("--light");
  const sources = [{ name: path.basename(file), text: fs.readFileSync(file, "utf8") }];
  const result = await solve(sources, { models: 0 });
  const anim = buildAnimation(sources).view, ground = buildGrounding(sources).view;
  const tab = (process.argv.find(a => a.startsWith("--tab=")) || "").slice(6);
  const state = { type: "state", file: { name: sources[0].name, scope: "activeFile" }, status: result.error ? "error" : "done", solve: trimResult(result, sources, 100), anim, ground, empty: false, settings: { speed: 1400 } };
  const media = f => fs.readFileSync(path.join(__dirname, "..", "media", f), "utf8");
  const html = `<!DOCTYPE html><html data-theme="${light ? "light" : "dark"}"><head><meta charset="utf-8"><style>${media("themes.css")}</style><style>${media("webview.css")}</style></head>
<body><div id="app"></div><script>
window.__sent=[]; window.acquireVsCodeApi=()=>({postMessage:m=>{window.__sent.push(m); if(m.type==='ready') setTimeout(()=>window.postMessage(${JSON.stringify(state)},'*'),0);},getState:()=>(${tab ? JSON.stringify({ tab }) : "null"}),setState:()=>{}});
</script><script>${media("webview.js")}</script></body></html>`;
  const out = path.join(__dirname, "..", ".preview");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "index.html"), html);
  console.log("wrote .preview/index.html");
})();
