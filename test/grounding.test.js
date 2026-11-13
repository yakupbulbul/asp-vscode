"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { groundTrace, groundingFor } = require("../media/engine");
const { buildGrounding } = require("../src/model");
const { findClingo, solve } = require("../src/solver");

const fixture = name => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const texts = g => g.ground.map(x => x.text);

test("a choice rule with a conditional literal is a loop inside a loop", () => {
  const g = groundTrace(fixture("colors.lp"));
  assert.deepEqual(g.rules.map(r => r.kind), ["fact", "fact", "choice"]);
  assert.deepEqual(texts(g), ["node(1).", "node(2).", "color(r).", "color(g).", "color(b).",
    "{ c(1,r); c(1,g); c(1,b) } = 1.", "{ c(2,r); c(2,g); c(2,b) } = 1."]);
  const rule3 = g.steps.filter(s => s.rule === 2).map(s => s.kind + ":" + (s.atom || ""));
  assert.deepEqual(rule3, ["body:", "elem:c(1,r)", "elem:c(1,g)", "elem:c(1,b)", "close:", "body:", "elem:c(2,r)", "elem:c(2,g)", "elem:c(2,b)", "close:"]);
  const elem = g.steps.find(s => s.kind === "elem");
  assert.deepEqual(elem.sub, [["N", "1"], ["C", "r"]]);
  assert.deepEqual(elem.levels.map(l => [l.k, l.text, l.i, l.n]), [["b0", "node(N)", 1, 2], ["c0", "color(C)", 1, 3]]);
  assert.deepEqual(g.steps[g.steps.length - 1].kind, "end");
});

test("steps know how many ground rules exist after them", () => {
  const g = groundTrace(fixture("colors.lp"));
  const ns = g.steps.map(s => s.n);
  assert.deepEqual(ns, [2, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 7, 7]);
  assert.ok(ns.every((n, i) => i === 0 || n >= ns[i - 1]));
});

test("the parts of a rule name the pieces a step lights up", () => {
  const g = groundTrace(fixture("colors.lp"));
  const parts = g.rules[2].parts;
  assert.equal(parts.map(p => p.t).join("").replace(/\s+/g, " "), "{ c(N,C) : color(C) } = 1 :- node(N).");
  assert.ok(parts.some(p => p.k === "b0" && p.t === "node(N)"));
  assert.ok(parts.some(p => p.k === "c0" && p.t === "color(C)"));
  assert.ok(parts.some(p => p.k === "h0" && p.t === "c(N,C)"));
});

test("bounds are written back as in the source", () => {
  const g = groundTrace("p(1..3).\n1 { a(X) : p(X) } 2.\n{ b(X) : p(X) } <= 1.\n2 <= { c(X) : p(X) }.");
  assert.deepEqual(texts(g).slice(3), ["1 { a(1); a(2); a(3) } 2.", "{ b(1); b(2); b(3) } <= 1.", "2 <= { c(1); c(2); c(3) }."]);
});

test("rules with several body literals, comparisons and arithmetic", () => {
  const g = groundTrace("n(1..3).\nnext(X,X+1) :- n(X), X < 3.\nbig(X) :- n(X), X >= 2.\nsum(X+Y) :- n(X), n(Y), X < Y.");
  assert.deepEqual(texts(g).filter(t => /^(next|big|sum)/.test(t)).sort(), ["big(2).", "big(3).", "next(1,2).", "next(2,3).", "sum(3).", "sum(4).", "sum(5)."]);
  const inst = g.steps.filter(s => s.kind === "inst" && s.rule === 3);
  assert.equal(inst.length, 3);
  assert.deepEqual(inst[0].sub, [["X", "1"], ["Y", "2"]]);
});

test("body atoms that are certainly true are dropped, negation follows what can be true", () => {
  const g = groundTrace("p(1..3). q(2).\nr(X) :- p(X), not q(X).\ns(X) :- r(X).\nt(1) :- not u(1).\n{ u(1) }.\nw(X) :- p(X), u(X).");
  assert.ok(texts(g).includes("r(1)."), "r(1) has an empty body once p(1) and `not q(1)` are known");
  assert.ok(!texts(g).some(t => t.startsWith("r(2)")), "q(2) is a fact, so r(2) has no instance");
  assert.ok(texts(g).includes("s(3)."));
  assert.ok(texts(g).includes("t(1) :- not u(1)."), "u(1) is only a choice, so `not u(1)` stays");
  assert.ok(texts(g).includes("w(1) :- u(1)."));
  assert.ok(!texts(g).some(t => t.startsWith("w(2)")), "u(2) can never be true");
});

test("constraints, disjunctions and #const", () => {
  const g = groundTrace("#const k = 2.\nn(1..k).\na(X) | b(X) :- n(X).\n:- a(X), b(X).");
  assert.deepEqual(texts(g).slice(2), ["a(1) | b(1).", "a(2) | b(2).", ":- a(1), b(1).", ":- a(2), b(2)."]);
  assert.deepEqual(g.rules.map(r => r.kind), ["fact", "disj", "constraint"]);
});

test("a rule whose body never matches gets a `none` step", () => {
  const g = groundTrace("p(1).\n:- p(X), q(X).");
  assert.equal(g.steps.find(s => s.rule === 1).kind, "none");
});

test("many instances are collapsed into one `bulk` step, the ground rules are all there", () => {
  const g = groundTrace("n(1..30).\nc(X,Y) :- n(X), n(Y).");
  const bulk = g.steps.find(s => s.kind === "bulk");
  assert.ok(bulk && bulk.hidden === 900 - 60 && bulk.total === 900);
  assert.equal(g.ground.length, 30 + 900);
  assert.equal(g.steps.filter(s => s.kind === "inst").length, 60);
});

test("unsupported statements are listed, not fatal; a program with nothing supported is an error", () => {
  const g = groundTrace("p(1..3).\n:- 2 { p(X) } .\nq(X) :- p(X).\n#show q/1.\n");
  assert.equal(g.skipped.length, 1);
  assert.equal(g.skipped[0].line, 1);
  assert.match(g.skipped[0].msg, /Aggregates/);
  assert.equal(g.notes[0].note, "#show");
  assert.ok(texts(g).includes("q(2)."));
  const e = groundTrace(":- 2 { p(X) }.");
  assert.ok(e.error && e.line === 0);
  assert.match(groundTrace("p(X) :- q(Y).").error, /Unsafe variable X/);
  assert.equal(groundTrace("q(1).\np(X) :- q(1).\nr(X) :- q(X).").skipped[0].line, 1);
});

test("an unterminated rule is reported", () => {
  assert.equal(groundTrace("p(1).\nq(X) :- p(X)").incomplete, "q(X) :- p(X)");
});

test("groundingFor numbers lines from 1 and names the file", () => {
  const v = groundingFor("% c\np(1).\nq(X) :- p(X).\n", "a.lp");
  assert.deepEqual(v.rules.map(r => [r.file, r.line, r.endLine]), [["a.lp", 2, 2], ["a.lp", 3, 3]]);
  assert.equal(groundingFor("q(X) :- .", "a.lp").error !== undefined, true);
});

test("buildGrounding maps rules to their source file for editor highlighting", () => {
  const b = buildGrounding([{ name: "a.lp", text: "p(1).\nq(X) :- p(X)." }, { name: "b.lp", text: "r(1..2).\ns(X) :- r(X)." }]);
  assert.deepEqual(b.locations.map(l => [l.sourceIndex, l.line]), [[0, 0], [0, 1], [1, 0], [1, 1]]);
  assert.deepEqual(b.view.rules.map(r => [r.file, r.line]), [["a.lp", 1], ["a.lp", 2], ["b.lp", 1], ["b.lp", 2]]);
});

test("3x3 Latin square: as many ground rules as clingo, constraints identical", async () => {
  const text = fixture("latin3.lp");
  const g = groundTrace(text);
  assert.equal(g.ground.length, 3 + 9 + 27 + 27);
  assert.equal(g.skipped.length, 0);
  assert.ok(g.steps.length > 90);
  const found = await findClingo("", null);
  if (!found) return;                                       // no native clingo: nothing to compare with
  const cp = require("child_process");
  const out = cp.spawnSync(found.cmd, [...found.prefix, "--text", "-"], { input: text, encoding: "utf8" }).stdout;
  const norm = s => s.replace(/^:-\s*/, "").replace(/\.$/, "").split(/\s*,\s*/).sort().join(",");
  const theirs = out.split("\n").filter(l => l.startsWith(":-")).map(norm).sort();
  const mine = texts(g).filter(t => t.startsWith(":-")).map(norm).sort();
  assert.deepEqual(mine, theirs);
  const res = await solve([{ name: "latin3.lp", text }], { models: 0 });
  assert.equal(res.models.length, 12);
});
