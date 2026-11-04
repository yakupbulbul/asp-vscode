"use strict";
/* Runs clingo (WebAssembly) off the extension host thread so a long solve can be terminated. */
const { workerData, parentPort } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

(async () => {
  const out = [], err = [];
  try {
    const { default: Module } = await import(pathToFileURL(path.join(__dirname, "..", "vendor", "clingo.mjs")).href);
    const clingo = await Module({
      wasmBinary: fs.readFileSync(path.join(__dirname, "..", "vendor", "clingo.wasm")),
      print: l => out.push(l), printErr: l => err.push(l),
    });
    const status = clingo.ccall("run", "number", ["string", "string"], [workerData.program, workerData.args]);
    parentPort.postMessage({ status, out: out.join(""), err: err.join("\n") });
  } catch (e) {
    parentPort.postMessage({ fatal: String(e && e.message || e), out: out.join(""), err: err.join("\n") });
  }
})();
