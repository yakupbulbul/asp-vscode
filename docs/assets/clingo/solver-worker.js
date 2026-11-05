/* Module worker: clingo 5.8 (WebAssembly) runs here so a long solve never blocks the page and can be terminated. */
import Module from "./clingo.mjs";

let out = [], err = [];
let clingo = null;

async function boot() {
  const bytes = await (await fetch(new URL("./clingo.wasm", import.meta.url))).arrayBuffer();
  clingo = await Module({ wasmBinary: new Uint8Array(bytes), print: l => out.push(l), printErr: l => err.push(l) });
}
const ready = boot().then(() => postMessage({ ready: true }), e => postMessage({ fatal: String(e && e.message || e) }));

onmessage = async e => {
  const { id, program, args } = e.data;
  try {
    await ready;
    out = []; err = [];
    const status = clingo.ccall("run", "number", ["string", "string"], [program, args]);
    postMessage({ id, status, out: out.join(""), err: err.join("\n") });
  } catch (ex) {
    postMessage({ id, fatal: String(ex && ex.message || ex) });
  }
};
