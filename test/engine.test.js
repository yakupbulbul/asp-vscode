"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { parseProgram, evaluate, key, AspError } = require("../media/engine");
const { findClingo, solve } = require("../src/solver");

const ancestor = fs.readFileSync(path.join(__dirname, "fixtures", "ancestor.lp"), "utf8");

test("rules carry 0-based source lines, also across comments and multi-line rules", () => {
  const rules = parseProgram("% header\nparent(a,b).\n\nanc(X,Y) :- parent(X,Y).\nanc(X,Z) :-\n  parent(X,Y), anc(Y,Z). %* trailing *%\n");
  assert.deepEqual(rules.map(r => [r.line, r.endLine]), [[1, 1], [3, 3], [4, 5]]);
  assert.equal(rules[2].text, "anc(X,Z) :- parent(X,Y), anc(Y,Z).");
});

test("text after the last dot is reported as incomplete", () => {
  assert.equal(parseProgram("a.\nb :- a").incomplete, "b :- a");
  assert.equal(parseProgram("a.\n").incomplete, "");
});

test("fixpoint rounds of transitive closure", () => {
  const rounds = evaluate(parseProgram(ancestor));
  assert.deepEqual(rounds.map(r => r.length), [4, 4, 3, 1]);
  assert.ok(rounds[3].some(f => key(f.atom) === "ancestor(anna,eve)"));
});

test("comparisons filter substitutions", () => {
  const rounds = evaluate(parseProgram("p(1). p(2). p(3).\nlt(X,Y) :- p(X), p(Y), X < Y."));
  assert.equal(rounds[1].length, 3);
});

for (const [src, re, line] of [
  ["a.\nb :- not a.", /no `not`/, 1],
  ["{a}.", /Choice rules/, 0],
  ["a.\n\np(X) :- q.", /Unsafe variable X/, 2],
  ["a.\n:- a.", /Constraints/, 1],
]) {
  test(`unsupported input is rejected with a line: ${src.split("\n").pop()}`, () => {
    assert.throws(() => parseProgram(src), e => e instanceof AspError && re.test(e.message) && e.line === line);
  });
}

test("matches clingo on every fixture (skipped without a native clingo)", async t => {
  const found = await findClingo();
  if (!found) return t.skip("no native clingo");
  const programs = {
    ancestor,
    reachability: "start(a).\nroad(a,b). road(b,c). road(c,d). road(d,a).\nvisit(Y) :- road(X,Y), start(X).\nvisit(Y) :- road(X,Y), visit(X).\n",
    parity: "succ(0,1). succ(1,2). succ(2,3).\neven(0).\nodd(Y) :- even(X), succ(X,Y).\neven(Y) :- odd(X), succ(X,Y).\n",
    siblings: "parent(p,a). parent(p,b). parent(p,c).\nsib(X,Y) :- parent(P,X), parent(P,Y), X != Y.\n",
  };
  for (const [name, text] of Object.entries(programs)) {
    const mine = evaluate(parseProgram(text)).flat().map(f => key(f.atom)).sort();
    const r = await solve([{ text }], { models: 1 });
    assert.equal(r.models.length, 1, name);
    assert.deepEqual(r.models[0].atoms.slice().sort(), mine, name);
  }
});
