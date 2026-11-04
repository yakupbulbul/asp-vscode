"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const setup = require("../src/setup");
const { solve, findClingo, resetClingoCache } = require("../src/solver");

test("run captures output and exit codes and never throws", async () => {
  const ok = await setup.run(process.execPath, ["-e", "console.log('hi')"]);
  assert.equal(ok.code, 0);
  assert.match(ok.out, /hi/);
  const missing = await setup.run("definitely-not-a-command-xyz", []);
  assert.equal(missing.code, -1);
});

test("findPython finds a modern Python or reports none", async t => {
  const py = await setup.findPython();
  if (!py) return t.skip("no python on this machine");
  assert.match(py.version, /^3\.\d+\.\d+$/);
});

test("managedClingo is null when the environment does not exist", () => {
  assert.equal(setup.managedClingo(path.join(os.tmpdir(), "asp-no-such-env")), null);
  assert.equal(setup.listPackages(path.join(os.tmpdir(), "asp-no-such-env")) instanceof Promise, true);
});

test("a missing Python gives a helpful error", async () => {
  const saved = process.env.PATH;
  process.env.PATH = "";
  try {
    const r = await setup.install(path.join(os.tmpdir(), "asp-env-" + Date.now()), ["clingo"]);
    assert.equal(r.ok, false);
    assert.match(r.error, /Python/);
  } finally { process.env.PATH = saved; }
});

// Downloads from PyPI (about 5 MB). Run with: ASP_NET_TESTS=1 npm test
test("installs clingo into a private environment and solves with it", { skip: !process.env.ASP_NET_TESTS && "set ASP_NET_TESTS=1 to run network tests", timeout: 240000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asp-env-"));
  const env = path.join(dir, "env");
  try {
    const r = await setup.install(env, ["clingo"]);
    assert.deepEqual(r, { ok: true });
    const pkgs = await setup.listPackages(env);
    assert.match(pkgs.clingo, /^5\./);
    const managed = setup.managedClingo(env);
    resetClingoCache();
    const found = await findClingo("", managed);
    assert.equal(found.cmd, managed.cmd);
    const res = await solve([{ text: "{a;b}.\n:- a, b.\n" }], { managed, clingoPath: "/definitely/not/here" });
    assert.equal(res.engine, "native");
    assert.equal(res.models.length, 3);
    setup.remove(env);
    assert.equal(fs.existsSync(env), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
