"use strict";

/** Map a 1-based line of the concatenated program to its source file and 1-based local line. */
function mapLine(sources, globalLine) {
  let start = 0;
  for (const s of sources) {
    const count = s.text.split("\n").length;
    if (globalLine - 1 < start + count) return { source: s, line: globalLine - start };
    start += count;
  }
  const last = sources[sources.length - 1];
  return { source: last, line: 1 };
}

/**
 * Parse clingo's stderr into diagnostics.
 * Messages look like `-:3:5-6: error: syntax error, unexpected .` (the program is read from stdin / a string).
 * Returns `{ sourceIndex, line, col, endCol, severity, message }` with 1-based line and column.
 */
function parseDiagnostics(stderr, sources) {
  const re = /^(?:<string>|-):(\d+):(\d+)(?:-(\d+))?(?::(\d+)(?:-(\d+))?)?: (error|warning|info): (.*)$/;
  const out = [];
  let cur = null;
  for (const l of String(stderr || "").split("\n")) {
    const m = l.match(re);
    if (m) {
      const mapped = mapLine(sources, +m[1]);
      const sameLine = m[4] === undefined;                         // `L:C1-C2` form
      cur = {
        sourceIndex: sources.indexOf(mapped.source),
        line: mapped.line,
        col: +m[2],
        endCol: sameLine && m[3] !== undefined ? +m[3] : +m[2] + 1,
        severity: m[6] === "error" ? "error" : m[6] === "info" ? "info" : "warning",
        message: m[7],
      };
      out.push(cur);
    } else if (cur && l.trim() && !l.startsWith("***")) {
      cur.message += "\n" + l.trim();
    }
  }
  return out;
}

module.exports = { mapLine, parseDiagnostics };
