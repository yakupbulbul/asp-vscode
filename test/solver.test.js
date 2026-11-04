"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { solve, findClingo } = require("../src/solver");

const PROG = [{ text: "{a;b}.\n:- a, b.\n" }];

for (const wasm of [true, false]) {
  test(`solves with ${wasm ? "WebAssembly" : "native"} clingo`, async t => {
    if (!wasm && !(await findClingo())) return t.skip("no native clingo");
    const r = await solve(PROG, { preferWasm: wasm });
    assert.equal(r.engine, wasm ? "wasm" : "native");
    assert.equal(r.result, "SATISFIABLE");
    assert.equal(r.models.length, 3);
    assert.equal(r.error, undefined);
  });

  test(`reports syntax errors with file mapping (${wasm ? "wasm" : "native"})`, async t => {
    if (!wasm && !(await findClingo())) return t.skip("no native clingo");
    const r = await solve([{ text: "ok.\n" }, { text: "p :- q(.\n" }], { preferWasm: wasm });
    assert.ok(r.error);
    assert.equal(r.diagnostics[0].sourceIndex, 1);
    assert.equal(r.diagnostics[0].line, 1);
    assert.equal(r.diagnostics[0].severity, "error");
  });
}

test("model limit and 'more' flag", async () => {
  const r = await solve([{ text: "{a;b;c}.\n" }], { models: 2, preferWasm: true });
  assert.equal(r.models.length, 2);
  assert.equal(r.more, true);
});

test("unsatisfiable programs", async () => {
  const r = await solve([{ text: "a.\n:- a.\n" }], { preferWasm: true });
  assert.equal(r.result, "UNSATISFIABLE");
  assert.equal(r.models.length, 0);
});

test("timeouts are reported", async () => {
  const r = await solve([{ text: "{ a(1..200) }.\n" }], { preferWasm: true, models: 0, timeoutSeconds: 1 });
  assert.equal(r.timedOut, true);
  assert.match(r.error, /Timeout/);
});

test("a solve can be cancelled", async () => {
  const ac = new AbortController();
  const p = solve([{ text: "{ a(1..200) }.\n" }], { preferWasm: true, models: 0, timeoutSeconds: 30, signal: ac.signal });
  setTimeout(() => ac.abort(), 200);
  assert.equal((await p).cancelled, true);
});

test("optimisation costs are returned", async () => {
  const r = await solve([{ text: "{a;b}.\n#minimize { 1,a : a; 2,b : b }.\n:- not a, not b.\n" }], { preferWasm: true, extraArgs: ["--opt-mode=optN"] });
  assert.ok(r.models.some(m => m.costs));
});
