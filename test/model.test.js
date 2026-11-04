"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAnimation, trimResult } = require("../src/model");

const sources = [{ name: "instance.lp", text: "edge(a,b).\nedge(b,c).\n" }, { name: "encoding.lp", text: "% reach\nr(X,Y) :- edge(X,Y).\nr(X,Z) :- r(X,Y), edge(Y,Z).\n" }];

test("animation maps rules back to the file they came from", () => {
  const { locations, view } = buildAnimation(sources);
  assert.deepEqual(locations.map(l => [l.sourceIndex, l.line, l.endLine]), [[0, 0, 0], [0, 1, 1], [1, 1, 1], [1, 2, 2]]);
  assert.deepEqual(view.rules.map(r => [r.file, r.line]), [["instance.lp", 1], ["instance.lp", 2], ["encoding.lp", 2], ["encoding.lp", 3]]);
  assert.deepEqual(view.rounds.map(r => r.length), [2, 2, 1]);
  assert.equal(view.rounds[2][0].atom, "r(a,c)");
});

test("unsupported programs yield an error with file and line", () => {
  const { view } = buildAnimation([{ name: "x.lp", text: "a.\nb :- not a.\n" }]);
  assert.match(view.error, /no `not`/);
  assert.deepEqual([view.file, view.line], ["x.lp", 2]);
});

test("trimResult limits models and names diagnostics", () => {
  const r = trimResult({ models: [1, 2, 3].map(i => ({ atoms: [String(i)] })), diagnostics: [{ sourceIndex: 1, line: 3 }] }, sources, 2);
  assert.equal(r.totalModels, 3);
  assert.equal(r.models.length, 2);
  assert.equal(r.diagnostics[0].file, "encoding.lp");
});
