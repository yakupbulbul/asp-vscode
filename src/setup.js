"use strict";
/* Environment management without vscode: finds Python, builds a private virtual environment
 * (in the extension's global storage) and installs ASP tools from PyPI into it. */
const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const WIN = process.platform === "win32";
const binDir = dir => path.join(dir, WIN ? "Scripts" : "bin");
const venvPython = dir => path.join(binDir(dir), WIN ? "python.exe" : "python");
const venvTool = (dir, name) => path.join(binDir(dir), WIN ? name + ".exe" : name);

/** Run a process, streaming output lines to onData. Resolves { code, out }. Never rejects. */
function run(cmd, args, { onData, signal, env } = {}) {
  return new Promise(resolve => {
    let child;
    try { child = cp.spawn(cmd, args, { env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: "1", ...env }, windowsHide: true }); }
    catch (e) { return resolve({ code: -1, out: String(e.message) }); }
    let out = "";
    const feed = d => { out += d; if (onData) onData(String(d)); };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    const abort = () => child.kill();
    if (signal) signal.addEventListener("abort", abort, { once: true });
    child.on("error", e => resolve({ code: -1, out: out + String(e.message) }));
    child.on("close", code => { if (signal) signal.removeEventListener("abort", abort); resolve({ code, out }); });
  });
}

/** First Python >= 3.8 on this machine: { cmd, args, version } or null. */
async function findPython() {
  const tries = WIN ? [["py", "-3"], ["python"], ["python3"]] : [["python3"], ["python"]];
  for (const [cmd, ...args] of tries) {
    const r = await run(cmd, [...args, "--version"]);
    const m = r.code === 0 && r.out.match(/Python (\d+)\.(\d+)\.(\d+)/);
    if (m && (+m[1] > 3 || (+m[1] === 3 && +m[2] >= 8))) return { cmd, args, version: `${m[1]}.${m[2]}.${m[3]}` };
  }
  return null;
}

/** Installed packages of the managed environment as { name: version } (lower-case names), or null if it does not exist. */
async function listPackages(dir) {
  if (!fs.existsSync(venvPython(dir))) return null;
  const r = await run(venvPython(dir), ["-m", "pip", "list", "--format=json"]);
  if (r.code !== 0) return null;
  try { return Object.fromEntries(JSON.parse(r.out.slice(r.out.indexOf("["))).map(p => [p.name.toLowerCase(), p.version])); }
  catch { return null; }
}

/** Create the environment if missing, then `pip install` the packages. Returns { ok, error }. */
async function install(dir, packages, { onData, signal } = {}) {
  if (!fs.existsSync(venvPython(dir))) {
    const py = await findPython();
    if (!py) return { ok: false, error: "No Python 3.8 or newer was found. Install Python from https://www.python.org/downloads/ and try again." };
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    onData && onData(`Creating a private Python environment in ${dir}\n`);
    const v = await run(py.cmd, [...py.args, "-m", "venv", dir], { onData, signal });
    if (v.code !== 0) return { ok: false, error: "Could not create the virtual environment:\n" + v.out.trim().split("\n").slice(-3).join("\n") };
  }
  onData && onData(`pip install ${packages.join(" ")}\n`);
  const p = await run(venvPython(dir), ["-m", "pip", "install", "--upgrade", ...packages], { onData, signal });
  if (signal && signal.aborted) return { ok: false, error: "Cancelled." };
  return p.code === 0 ? { ok: true } : { ok: false, error: "pip failed:\n" + p.out.trim().split("\n").slice(-4).join("\n") };
}

function remove(dir) { fs.rmSync(dir, { recursive: true, force: true }); }

/** The command that runs clingo from the managed environment (`python -m clingo`), or null if the env does not exist. */
function managedClingo(dir) {
  const py = venvPython(dir);
  return fs.existsSync(py) ? { cmd: py, args: ["-m", "clingo"] } : null;
}

module.exports = { run, findPython, listPackages, install, remove, managedClingo, venvPython, venvTool };
