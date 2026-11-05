"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
for (const name of ["engine.js", "webview.js", "webview.css", "themes.css"]) {
  test(`docs/assets/panel/${name} matches media/${name} (run scripts/sync_docs.py)`, () => {
    const a = fs.readFileSync(path.join(root, "media", name));
    const b = fs.readFileSync(path.join(root, "docs", "assets", "panel", name));
    assert.ok(a.equals(b), `${name} differs; run python3 scripts/sync_docs.py`);
  });
}

test("the site's clingo files match the vendored ones", () => {
  for (const name of ["clingo.mjs", "clingo.wasm"]) {
    assert.ok(fs.readFileSync(path.join(root, "vendor", name)).equals(fs.readFileSync(path.join(root, "docs", "assets", "clingo", name))), name);
  }
});

test("every page links the playground", () => {
  for (const page of ["index.html", "docs.html"]) {
    assert.match(fs.readFileSync(path.join(root, "docs", page), "utf8"), /playground\.html/, page);
  }
});
