"use strict";
const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Worker } = require("worker_threads");
const { parseDiagnostics } = require("./diagnostics");

const WORKER = path.join(__dirname, "wasm-worker.js");

/** Places where clingo commonly lives. Each candidate is { cmd, prefix[] }; the first working one wins. */
function candidates(configured, managed) {
  const home = os.homedir();
  const list = [];
  if (configured && configured.trim()) list.push({ cmd: configured.trim(), prefix: [] });
  if (managed) list.push({ cmd: managed.cmd, prefix: managed.args || [] });
  list.push({ cmd: "clingo", prefix: [] });
  for (const base of ["anaconda3", "miniconda3", "miniforge3", "mambaforge", "opt/anaconda3"]) {
    list.push({ cmd: path.join(home, base, "envs", "asp-course", "bin", "clingo"), prefix: [] });
    list.push({ cmd: path.join(home, base, "bin", "clingo"), prefix: [] });
  }
  for (const p of ["/opt/homebrew/bin/clingo", "/usr/local/bin/clingo", "/usr/bin/clingo"]) list.push({ cmd: p, prefix: [] });
  return list;
}

const versionCache = new Map();
/** Resolve a working native clingo. Returns { path, cmd, prefix, version } or null. `managed` = { cmd, args } of the private environment. */
async function findClingo(configured, managed) {
  const id = (configured || "") + "|" + (managed ? managed.cmd : "");
  if (versionCache.has(id)) return versionCache.get(id);
  let found = null;
  for (const c of candidates(configured, managed)) {
    if (c.cmd.includes(path.sep) && !fs.existsSync(c.cmd)) continue;
    const version = await new Promise(resolve => {
      let out = "";
      let child;
      try { child = cp.spawn(c.cmd, [...c.prefix, "--version"]); } catch { return resolve(null); }
      child.stdout.on("data", d => out += d);
      child.on("error", () => resolve(null));
      child.on("close", code => resolve(code === 0 ? (out.match(/clingo version ([\d.]+)/) || [])[1] || "unknown" : null));
    });
    if (version) { found = { path: c.prefix.length ? c.cmd + " " + c.prefix.join(" ") : c.cmd, cmd: c.cmd, prefix: c.prefix, version }; break; }
  }
  versionCache.set(id, found);
  return found;
}
const resetClingoCache = () => versionCache.clear();

/** Join sources into one program; line numbers in clingo messages map back through `mapLine`. */
const joinSources = sources => sources.map(s => s.text).join("\n") + "\n";

function parseResult(out) {
  let json = null;
  try { json = JSON.parse(out); } catch { /* not JSON: clingo failed before solving */ }
  if (!json) return null;
  const call = json.Call || [];
  const witnesses = (call[call.length - 1] || {}).Witnesses || [];
  return {
    result: json.Result,
    models: witnesses.map(w => ({ atoms: w.Value || [], costs: w.Costs || null })),
    more: !!(json.Models && json.Models.More === "yes"),
    time: json.Time && json.Time.Total,
  };
}

function runNative(found, program, args, timeoutMs, signal) {
  return new Promise(resolve => {
    const child = cp.spawn(found.cmd, [...found.prefix, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "", timedOut = false, cancelled = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    const onAbort = () => { cancelled = true; child.kill("SIGKILL"); };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", d => out += d);
    child.stderr.on("data", d => err += d);
    child.on("error", e => { clearTimeout(timer); resolve({ fatal: String(e.message || e), out, err }); });
    child.on("close", code => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve({ status: code, out, err, timedOut, cancelled });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(program);
  });
}

function runWasm(program, args, timeoutMs, signal) {
  return new Promise(resolve => {
    const worker = new Worker(WORKER, { workerData: { program, args } });
    let done = false;
    const finish = r => { if (done) return; done = true; clearTimeout(timer); if (signal) signal.removeEventListener("abort", onAbort); worker.terminate(); resolve(r); };
    const timer = setTimeout(() => finish({ timedOut: true, out: "", err: "" }), timeoutMs);
    const onAbort = () => finish({ cancelled: true, out: "", err: "" });
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    worker.on("message", m => finish(m));
    worker.on("error", e => finish({ fatal: String(e.message || e), out: "", err: "" }));
  });
}

/**
 * Solve the program made of `sources` ([{ text, ... }]).
 * options: { models, extraArgs[], timeoutSeconds, clingoPath, managed:{cmd,args}, preferWasm, signal }
 * Returns { engine, version, command, result, models, more, time, ms, stderr, diagnostics, error, timedOut, cancelled }.
 */
async function solve(sources, options = {}) {
  const models = Math.max(0, Math.floor(options.models || 0));
  const extra = options.extraArgs || [];
  const timeoutMs = Math.max(1000, (options.timeoutSeconds || 10) * 1000);
  const program = joinSources(sources);
  const t0 = Date.now();

  let engine = "wasm", version = "5.8.1", native = null;
  if (!options.preferWasm) {
    native = await findClingo(options.clingoPath, options.managed);
    if (native) { engine = "native"; version = native.version; }
  }

  const args = ["--outf=2", String(models), ...extra];
  const command = (engine === "native" ? (native.prefix.length ? path.basename(native.cmd) + " " + native.prefix.join(" ") : path.basename(native.cmd)) : "clingo (wasm)") + " " + args.join(" ");
  const raw = engine === "native"
    ? await runNative(native, program, [...args, "-"], timeoutMs, options.signal)
    : await runWasm(program, args.join(" "), timeoutMs, options.signal);

  const r = { engine, version, command, ms: Date.now() - t0, stderr: raw.err || "", diagnostics: [], models: [] };
  if (raw.cancelled) { r.cancelled = true; return r; }
  if (raw.timedOut) { r.timedOut = true; r.error = `Timeout after ${Math.round(timeoutMs / 1000)} s.`; return r; }
  if (raw.fatal) { r.error = raw.fatal; return r; }
  r.diagnostics = parseDiagnostics(raw.err, sources);
  const parsed = parseResult(raw.out);
  // 65 = syntax/parse error, 33 = clingo error, 128 = fatal; no JSON means nothing was solved
  if (!parsed || [33, 65, 128].includes(raw.status)) {
    r.error = r.diagnostics.some(d => d.severity === "error")
      ? "The program has a syntax or semantic error."
      : (raw.err.trim() || `clingo finished with an error (status ${raw.status}).`);
    return r;
  }
  Object.assign(r, parsed);
  return r;
}

module.exports = { solve, findClingo, resetClingoCache, parseResult, joinSources };
