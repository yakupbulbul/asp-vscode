"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseDiagnostics, mapLine } = require("../src/diagnostics");

const sources = [{ text: "a.\nb.\n" }, { text: "c :- d(.\n" }];

test("mapLine maps global lines to file and local line", () => {
  assert.equal(mapLine(sources, 1).line, 1);
  assert.equal(mapLine(sources, 1).source, sources[0]);
  assert.equal(mapLine(sources, 4).source, sources[1]);
  assert.equal(mapLine(sources, 4).line, 1);
});

test("parses errors, ranges and continuation lines", () => {
  const err = "-:4:8-9: error: syntax error, unexpected ., expecting ) or ;\n\n*** ERROR: (clingo): parsing failed\n";
  const d = parseDiagnostics(err, sources);
  assert.equal(d.length, 1);
  assert.deepEqual({ ...d[0] }, { sourceIndex: 1, line: 1, col: 8, endCol: 9, severity: "error", message: "syntax error, unexpected ., expecting ) or ;" });
});

test("warnings and infos keep their severity", () => {
  const d = parseDiagnostics("-:1:1-2: info: atom does not occur in any rule head:\n  x\n-:2:1: warning: something\n", sources);
  assert.deepEqual(d.map(x => x.severity), ["info", "warning"]);
  assert.match(d[0].message, /\n\s*x$|\nx$/);
});

test("empty stderr gives no diagnostics", () => assert.deepEqual(parseDiagnostics("", sources), []));
