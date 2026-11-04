/* Fixpoint engine for positive ASP programs: parser (with source positions) and
 * naive bottom-up evaluation, round by round. Runs in Node and in the webview. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AspEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  class AspError extends Error {
    constructor(message, line) { super(message); this.name = "AspError"; this.line = line; }
  }

  /** Split on `sep`, ignoring separators nested in parentheses. */
  function splitTop(s, sep) {
    const out = []; let depth = 0, cur = "";
    for (const ch of s) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === sep && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
    }
    if (cur.trim() !== "") out.push(cur);
    return out.map(x => x.trim()).filter(Boolean);
  }

  const isVar = t => /^[A-Z_]/.test(t);

  function parseTerm(t, line) {
    t = t.trim();
    if (!/^[A-Za-z0-9_]+$/.test(t)) throw new AspError("Unsupported term: " + t, line);
    return t;
  }

  function parseAtom(s, line) {
    s = s.trim();
    const m = s.match(/^([a-z][A-Za-z0-9_]*)\s*(?:\((.*)\))?$/s);
    if (!m) throw new AspError("Cannot read atom: " + s, line);
    const args = m[2] === undefined ? [] : splitTop(m[2], ",").map(t => parseTerm(t, line));
    return { pred: m[1], args };
  }

  /** Replace `% ...` and `%* ... *%` comments by spaces so offsets and line numbers stay valid. */
  function blankComments(text) {
    let out = "", i = 0;
    const blank = s => s.replace(/[^\n]/g, " ");
    while (i < text.length) {
      if (text.startsWith("%*", i)) {
        const j = text.indexOf("*%", i + 2), end = j < 0 ? text.length : j + 2;
        out += blank(text.slice(i, end)); i = end;
      } else if (text[i] === "%") {
        let j = text.indexOf("\n", i); if (j < 0) j = text.length;
        out += " ".repeat(j - i); i = j;
      } else out += text[i++];
    }
    return out;
  }

  const lineAt = (starts, offset) => {            // 0-based line of a character offset
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; }
    return lo;
  };

  /**
   * Parse a positive program.
   * Returns rules `{ head, body, cmp, text, line, endLine }` (lines are 0-based) and
   * `rules.incomplete`: trailing text that is not yet terminated by a dot.
   */
  function parseProgram(text) {
    const clean = blankComments(text);
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);

    const rules = [];
    rules.incomplete = "";
    const re = /\.(?=\s|$)/g;
    let from = 0, m;
    const statements = [];
    while ((m = re.exec(clean))) {
      if (clean[m.index - 1] === ".") continue;                  // range operator 1..n
      statements.push([from, m.index]);
      from = m.index + 1;
    }
    rules.incomplete = clean.slice(from).trim();

    for (const [a, b] of statements) {
      const raw = clean.slice(a, b);
      const st = raw.trim();
      if (!st) continue;
      const lead = raw.length - raw.trimStart().length;
      const line = lineAt(starts, a + lead), endLine = lineAt(starts, b);
      if (st.startsWith("#")) continue;                            // #show, #const, ... are ignored
      if (/\bnot\b/.test(st)) throw new AspError("Only positive programs can be animated (no `not`):\n" + st + ".", line);
      if (/[{}]|\.\./.test(st)) throw new AspError("Choice rules and ranges (1..n) are not supported:\n" + st + ".", line);
      const idx = st.indexOf(":-");
      const head = idx < 0 ? st : st.slice(0, idx);
      const bodyText = idx < 0 ? "" : st.slice(idx + 2);
      if (idx >= 0 && head.trim() === "") throw new AspError("Constraints are not supported: " + st + ".", line);
      const rule = { head: parseAtom(head, line), body: [], cmp: [], text: st.replace(/\s+/g, " ") + ".", line, endLine };
      splitTop(bodyText, ",").forEach(l => {
        const c = l.match(/^(\S+)\s*(!=|<=|>=|<|>|=)\s*(\S+)$/);
        if (c) rule.cmp.push({ l: parseTerm(c[1], line), op: c[2], r: parseTerm(c[3], line) });
        else rule.body.push(parseAtom(l, line));
      });
      const bound = new Set();
      rule.body.forEach(at => at.args.forEach(t => { if (isVar(t)) bound.add(t); }));
      [...rule.head.args, ...rule.cmp.flatMap(c => [c.l, c.r])].forEach(t => {
        if (isVar(t) && !bound.has(t)) throw new AspError("Unsafe variable " + t + " in rule: " + rule.text, line);
      });
      rules.push(rule);
    }
    return rules;
  }

  const key = a => a.pred + "(" + a.args.join(",") + ")";

  function holds(op, l, r) {
    const num = /^-?\d+$/.test(l) && /^-?\d+$/.test(r);
    const a = num ? +l : l, b = num ? +r : r;
    return op === "!=" ? a !== b : op === "=" ? a === b : op === "<" ? a < b :
           op === ">" ? a > b : op === "<=" ? a <= b : a >= b;
  }

  /**
   * Naive bottom-up evaluation. `rounds[0]` holds the facts; `rounds[k]` the atoms first derived in round k.
   * Each entry is `{ atom, rule, subst }` where `rule` indexes into `rules`.
   */
  function evaluate(rules, maxAtoms = 3000) {
    const have = new Set(), byPred = {};
    const rounds = [[]];
    const add = a => { have.add(key(a)); (byPred[a.pred] ||= []).push(a); };
    rules.forEach((r, i) => {
      if (r.body.length) return;
      const a = { pred: r.head.pred, args: r.head.args };
      if (!have.has(key(a))) { add(a); rounds[0].push({ atom: a, rule: i, subst: {} }); }
    });
    for (;;) {
      const fresh = [], seen = new Set();
      rules.forEach((r, i) => {
        if (!r.body.length) return;
        const walk = (k, sub) => {
          if (k === r.body.length) {
            const val = t => isVar(t) ? sub[t] : t;
            if (!r.cmp.every(c => holds(c.op, val(c.l), val(c.r)))) return;
            const atom = { pred: r.head.pred, args: r.head.args.map(val) };
            const kk = key(atom);
            if (!have.has(kk) && !seen.has(kk)) { seen.add(kk); fresh.push({ atom, rule: i, subst: { ...sub } }); }
            return;
          }
          const lit = r.body[k];
          for (const fact of byPred[lit.pred] || []) {
            if (fact.args.length !== lit.args.length) continue;
            const s2 = { ...sub }; let ok = true;
            for (let j = 0; j < lit.args.length && ok; j++) {
              const t = lit.args[j];
              if (isVar(t)) { if (t === "_") continue; if (t in s2) ok = s2[t] === fact.args[j]; else s2[t] = fact.args[j]; }
              else ok = t === fact.args[j];
            }
            if (ok) walk(k + 1, s2);
          }
        };
        walk(0, {});
      });
      if (!fresh.length) break;
      fresh.forEach(f => add(f.atom));
      rounds.push(fresh);
      if (have.size > maxAtoms) throw new AspError("Too many atoms (>" + maxAtoms + "), the program may be infinite.");
    }
    return rounds;
  }

  return { AspError, parseProgram, evaluate, key, splitTop, isVar };
});
