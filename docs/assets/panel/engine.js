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

  /** The animator view for one program text, as the visualizer expects it (also used by the notebook output). */
  function animationFor(text, file) {
    try {
      const rules = parseProgram(text), rounds = evaluate(rules);
      return {
        rules: rules.map(r => ({ text: r.text, file, line: r.line + 1, endLine: r.endLine + 1, fact: !r.body.length })),
        rounds: rounds.map(rd => rd.map(f => ({ pred: f.atom.pred, args: f.atom.args, atom: key(f.atom), rule: f.rule, subst: f.subst }))),
        incomplete: rules.incomplete || "",
      };
    } catch (e) {
      return { error: String(e.message), file, line: e.line !== undefined ? e.line + 1 : null };
    }
  }

  /* ------------------------------------------------------------------------------------------------
   * Grounding trace. Follows the structure of each rule (not clingo's internal grounder): the body
   * literals are nested loops over the atoms that can be true, a conditional literal in a head is an
   * inner loop, and every complete pass produces one ground rule. The result is a list of steps.
   * ---------------------------------------------------------------------------------------------- */
  const INT = /^-?\d+$/;
  const CMPOPS = new Set(["=", "==", "!=", "<", ">", "<=", ">="]);
  const MAX_ATOMS = 5000, WORK_LIMIT = 1500000, PER_RULE = 60, MAX_STEPS = 2500, SHOWN_ATOMS = 24;
  const bad = (msg, line, fatal) => { const e = new AspError(msg, line); if (fatal) e.fatal = true; return e; };

  function lex(src, lineOfOffset) {
    const re = /\s+|("(?:[^"\\\n]|\\.)*")|(\d+)|([A-Z_][A-Za-z0-9_']*)|([a-z][A-Za-z0-9_']*)|(#[a-z_]+)|(:-|:~|\.\.|<=|>=|!=|==|[(){}\[\],;:.+\-*\/\\|<>=?@&])|([\s\S])/y;
    const toks = []; let m;
    re.lastIndex = 0;
    while (re.lastIndex < src.length && (m = re.exec(src))) {
      const s = m.index, e = re.lastIndex;
      if (m[1] !== undefined) toks.push({ k: "str", v: m[1].slice(1, -1), s, e });
      else if (m[2] !== undefined) toks.push({ k: "num", v: +m[2], s, e });
      else if (m[3] !== undefined) toks.push({ k: "var", v: m[3], s, e });
      else if (m[4] !== undefined) toks.push({ k: "id", v: m[4], s, e });
      else if (m[5] !== undefined) toks.push({ k: "dir", v: m[5], s, e });
      else if (m[6] !== undefined) toks.push({ k: "op", v: m[6], s, e });
      else if (m[7] !== undefined) throw bad("Unexpected character `" + m[7] + "`", lineOfOffset(s));
    }
    return toks;
  }

  const termVars = (t, out = []) => {
    if (!t) return out;
    if (t.t === "var") { if (t.v !== "_" && !out.includes(t.v)) out.push(t.v); }
    else { (t.args || []).forEach(a => termVars(a, out)); ["l", "r", "e"].forEach(k => t[k] && termVars(t[k], out)); }
    return out;
  };
  const hasRange = t => !!t && (t.t === "range" || (t.args || []).some(hasRange) || ["l", "r", "e"].some(k => t[k] && hasRange(t[k])));

  /** Parse one statement (tokens without the final dot). Returns { kind: "rule"|"const"|"ignore", ... }. */
  function parseStatement(toks, line) {
    let i = 0;
    const isOp = (v, o = 0) => { const t = toks[i + o]; return !!t && t.k === "op" && t.v === v; };
    const isId = v => !!toks[i] && toks[i].k === "id" && toks[i].v === v;
    const expect = v => { if (!isOp(v)) throw bad("Expected `" + v + "`", line); i++; };
    const unsupported = what => bad(what + " are not supported in the grounding view", line);

    function termList() {
      const out = [];
      if (isOp(")")) return out;
      for (;;) { out.push(term()); if (isOp(",")) i++; else break; }
      return out;
    }
    function term() {
      const a = add();
      if (isOp("..")) { i++; return { t: "range", l: a, r: add() }; }
      return a;
    }
    function add() {
      let l = mul();
      while (isOp("+") || isOp("-")) { const op = toks[i++].v; l = { t: "bin", op, l, r: mul() }; }
      return l;
    }
    function mul() {
      let l = unary();
      while (isOp("*") || isOp("/") || isOp("\\")) { const op = toks[i++].v; l = { t: "bin", op, l, r: unary() }; }
      return l;
    }
    function unary() {
      if (isOp("-")) { i++; const e = unary(); return e.t === "int" ? { t: "int", v: -e.v } : { t: "neg", e }; }
      return primary();
    }
    function primary() {
      const t = toks[i];
      if (!t) throw bad("The rule ends too early", line);
      if (t.k === "num") { i++; return { t: "int", v: t.v }; }
      if (t.k === "str") { i++; return { t: "str", v: t.v }; }
      if (t.k === "var") { i++; return { t: "var", v: t.v }; }
      if (t.k === "id") {
        i++;
        if (!isOp("(")) return { t: "id", v: t.v };
        i++;
        const pools = [termList()];
        while (isOp(";")) { i++; pools.push(termList()); }
        expect(")");
        return { t: "fn", name: t.v, args: pools[0], pools: pools.length > 1 ? pools : null };
      }
      if (t.k === "op" && t.v === "(") {
        i++;
        const items = termList();
        let tuple = items.length !== 1;
        if (isOp(",")) { i++; tuple = true; }
        expect(")");
        return tuple ? { t: "tuple", args: items } : items[0];
      }
      if (t.k === "dir") throw unsupported("Aggregates and `#` terms");
      throw bad("Cannot read `" + (t.v) + "`", line);
    }
    function toAtom(t) {
      let neg = "";
      if (t.t === "neg") { neg = "-"; t = t.e; }
      if (t.t === "id") return { pred: neg + t.v, args: [], pools: null };
      if (t.t === "fn") return { pred: neg + t.name, args: t.args, pools: t.pools };
      throw bad("Cannot read an atom here", line);
    }
    function literal(inHead) {
      const s = toks[i] && toks[i].s;
      let t = "pos";
      if (isId("not")) { i++; t = "neg"; if (isId("not")) throw unsupported("Double negation"); }
      if (toks[i] && toks[i].k === "dir") throw unsupported("Aggregates");
      const first = term();
      if (isOp("{")) throw unsupported("Aggregates");
      let lit;
      if (t === "pos" && toks[i] && toks[i].k === "op" && CMPOPS.has(toks[i].v)) {
        const op = toks[i++].v === "==" ? "=" : toks[i - 1].v;
        if (toks[i] && toks[i].k === "dir") throw unsupported("Aggregates");
        const r = term();
        lit = { t: "cmp", l: first, op, r, vars: termVars(r, termVars(first)) };
      } else {
        const atom = toAtom(first);
        if (atom.pools) throw unsupported("Pools (`;`) in a body or condition");
        if (atom.args.some(hasRange)) throw unsupported("Ranges (`..`) inside a body literal");
        lit = { t, atom, vars: atom.args.reduce((o, a) => termVars(a, o), []) };
      }
      if (isOp("{") || (!inHead && isOp(":"))) throw unsupported(isOp("{") ? "Aggregates" : "Conditional literals in a rule body");
      lit.s = s; lit.e = toks[i - 1].e;
      lit.src = null;
      return lit;
    }
    function literals(stop) {
      const out = [];
      for (;;) { out.push(literal(stop)); if (isOp(",")) i++; else break; }
      return out;
    }
    function element() {
      const s = toks[i].s;
      const atom = toAtom(term());
      const el = { atom, cond: [], s, e: toks[i - 1].e, cs: 0, ce: 0 };
      if (isOp(":")) {
        i++;
        if (isOp(";") || isOp("}") || isOp("|") || !toks[i]) { /* empty condition */ }
        else { el.cs = toks[i].s; el.cond = literals(true); el.ce = toks[i - 1].e; }
      }
      return el;
    }
    function bound() {
      const s = toks[i].s; let op = null;
      if (toks[i].k === "op" && CMPOPS.has(toks[i].v)) op = toks[i++].v === "==" ? "=" : toks[i - 1].v;
      const ts = toks[i] ? toks[i].s : s, t = term();
      return { op: op || "<=", explicit: !!op, term: t, s, e: toks[i - 1].e, ts, te: toks[i - 1].e };
    }
    function head() {
      const start = toks[i].s;
      if (toks[i].k === "dir") throw unsupported("Aggregates and `#` statements in a head");
      let lb = null;
      if (!isOp("{")) {                                      // maybe `1 {` or `1 <= {`
        const save = i;
        try {
          const ts = toks[i].s, t = term(), te = toks[i - 1].e;
          let op = null;
          if (toks[i] && toks[i].k === "op" && CMPOPS.has(toks[i].v)) op = toks[i++].v === "==" ? "=" : toks[i - 1].v;
          if (isOp("{")) lb = { op: op || "<=", explicit: !!op, term: t, s: ts, e: toks[i - 1].e, ts, te }; else i = save;
        } catch (e) { i = save; }
      }
      if (lb || isOp("{")) {
        expect("{");
        const elems = [];
        if (!isOp("}")) for (;;) { elems.push(element()); if (isOp(";")) i++; else break; }
        expect("}");
        let ub = null;
        if (toks[i] && !isOp(":-")) ub = bound();
        return { kind: "choice", elems, lb, ub, s: start, e: toks[i - 1].e };
      }
      const elems = [];
      for (;;) { elems.push(element()); if (isOp(";") || isOp("|")) i++; else break; }
      const plain = elems.length === 1 && !elems[0].cond.length;
      return { kind: plain ? "atom" : "disj", elems, lb: null, ub: null, s: start, e: toks[i - 1].e };
    }

    // ---- statement
    if (!toks.length) return { kind: "ignore" };
    const first = toks[0];
    if (first.k === "dir") {
      if (first.v === "#const") {
        i = 1;
        if (!toks[i] || toks[i].k !== "id") throw bad("Expected a constant name after #const", line);
        const name = toks[i++].v; expect("=");
        const t = term();
        if (i < toks.length) throw bad("Cannot read the constant definition", line);
        return { kind: "const", name, term: t };
      }
      if (["#show", "#minimize", "#maximize", "#project", "#heuristic", "#edge", "#defined"].includes(first.v)) return { kind: "ignore", note: first.v };
      throw unsupported("`" + first.v + "` statements");
    }
    if (first.k === "op" && first.v === ":~") return { kind: "ignore", note: "weak constraint" };
    let h = { kind: "none", elems: [], lb: null, ub: null, s: first.s, e: first.s }, body = [];
    if (isOp(":-")) { i++; body = toks.length > i ? literals(false) : []; }
    else {
      h = head();
      if (isOp(":-")) { i++; body = literals(false); }
    }
    if (i < toks.length) throw bad("Cannot read `" + toks[i].v + "`", line);
    return { kind: "rule", head: h, body };
  }

  /** clingo rejects a rule when a variable is not bound by a positive body literal; so does the grounding view. */
  function checkSafe(rule) {
    const bind = (lits, bound) => {
      lits.forEach(L => { if (L.t === "pos") L.vars.forEach(v => bound.add(v)); });
      for (let changed = true; changed;) {
        changed = false;
        lits.forEach(L => {
          if (L.t !== "cmp" || L.op !== "=") return;
          [[L.l, L.r], [L.r, L.l]].forEach(([a, b]) => {
            if (a.t === "var" && a.v !== "_" && !bound.has(a.v) && termVars(b).every(v => bound.has(v))) { bound.add(a.v); changed = true; }
          });
        });
      }
      return bound;
    };
    const need = (vars, bound) => { const v = vars.find(x => !bound.has(x)); if (v) throw bad("Unsafe variable " + v); };
    const tests = (lits, bound) => lits.forEach(L => { if (L.t !== "pos") need(L.vars, bound); });
    const outer = bind(rule.body, new Set());
    tests(rule.body, outer);
    rule.head.elems.forEach(el => {
      const local = bind(el.cond, new Set(outer));
      tests(el.cond, local);
      need(el.atom.pools ? el.atom.pools.flat().reduce((o, t) => termVars(t, o), []) : el.atom.args.reduce((o, t) => termVars(t, o), []), local);
    });
    [rule.head.lb, rule.head.ub].forEach(b => b && need(termVars(b.term), outer));
  }

  /* ------------------------------------------------------------ terms */
  const product = lists => lists.reduce((acc, l) => acc.flatMap(p => l.map(x => [...p, x])), [[]]);
  const mkAtom = (pred, args) => ({ pred, args, key: args.length ? pred + "(" + args.join(",") + ")" : pred });

  /** All values of a term under a substitution (a range or pool gives several). Throws on an unbound variable. */
  function ev(t, sub, C) {
    switch (t.t) {
      case "int": return [String(t.v)];
      case "id": return C.has(t.v) ? ev(C.get(t.v), {}, C) : [t.v];
      case "str": return ['"' + t.v + '"'];
      case "var":
        if (t.v === "_" || !(t.v in sub)) throw bad("Unsafe variable " + t.v);
        return [sub[t.v]];
      case "fn": return product(t.args.map(a => ev(a, sub, C))).map(v => t.name + "(" + v.join(",") + ")");
      case "tuple": return product(t.args.map(a => ev(a, sub, C))).map(v => "(" + v.join(",") + (v.length === 1 ? "," : "") + ")");
      case "neg": return ev(t.e, sub, C).map(v => INT.test(v) ? String(-v) : "-" + v);
      case "bin": {
        const out = [];
        for (const a of ev(t.l, sub, C)) for (const b of ev(t.r, sub, C)) {
          if (!INT.test(a) || !INT.test(b)) continue;
          const x = +a, y = +b;
          if (t.op === "+") out.push(String(x + y)); else if (t.op === "-") out.push(String(x - y)); else if (t.op === "*") out.push(String(x * y));
          else if (y !== 0) out.push(String(t.op === "/" ? Math.trunc(x / y) : ((x % y) + y) % y));
        }
        return out;
      }
      case "range": {
        const out = [];
        for (const a of ev(t.l, sub, C)) for (const b of ev(t.r, sub, C)) {
          if (!INT.test(a) || !INT.test(b)) continue;
          if (+b - +a > 100000) throw bad("A range is too large to ground", undefined, true);
          for (let x = +a; x <= +b; x++) out.push(String(x));
        }
        return out;
      }
      default: throw bad("Cannot evaluate a term");
    }
  }

  function parseValue(v) {
    const m = /^(-?[a-z][A-Za-z0-9_']*)?\((.*)\)$/s.exec(v);
    if (!m) return null;
    let args = splitTop(m[2], ",");
    if (!m[1] && /,\s*$/.test(m[2])) args = args.slice(0);
    return { name: m[1] || "", args };
  }

  /** Match a pattern term against a value; returns the extended substitution or null. */
  function match(pat, val, sub, C) {
    switch (pat.t) {
      case "var":
        if (pat.v === "_") return sub;
        if (pat.v in sub) return sub[pat.v] === val ? sub : null;
        return { ...sub, [pat.v]: val };
      case "fn": case "tuple": {
        const pv = parseValue(val), name = pat.t === "fn" ? pat.name : "";
        if (!pv || pv.name !== name || pv.args.length !== pat.args.length) return null;
        let s = sub;
        for (let k = 0; k < pat.args.length && s; k++) s = match(pat.args[k], pv.args[k], s, C);
        return s;
      }
      default:
        if (termVars(pat).some(v => !(v in sub))) throw bad("A term with an unbound variable in a literal is not supported");
        return ev(pat, sub, C).includes(val) ? sub : null;
    }
  }
  function matchAtom(a, atom, sub, C) {
    if (a.pred !== atom.pred || a.args.length !== atom.args.length) return null;
    let s = sub;
    for (let k = 0; k < a.args.length && s; k++) s = match(a.args[k], atom.args[k], s, C);
    return s;
  }
  function headAtoms(a, sub, C) {
    const out = [];
    for (const args of a.pools || [a.args]) for (const vs of product(args.map(t => ev(t, sub, C)))) out.push(mkAtom(a.pred, vs));
    return out;
  }

  /**
   * Backtracking over the literals of a body (or of a condition). Positive atoms and assignments (`X = 1..3`) are loops,
   * comparisons and `not` are tests that run as soon as their variables are bound.
   * visit(sub, levels) gets the substitution and the loop levels `{ k, bind, i, n }` that led to it.
   */
  function enumerate(lits, sub0, ctx, visit) {
    const done = lits.map(() => false), levels = [], C = ctx.C;
    const bound = (vars, sub) => vars.every(v => v in sub);
    const loneVar = (t, sub) => t.t === "var" && t.v !== "_" && !(t.v in sub);
    const assignable = (L, sub) => L.op === "=" && ((loneVar(L.l, sub) && bound(termVars(L.r), sub)) || (loneVar(L.r, sub) && bound(termVars(L.l), sub)));
    const rec = sub => {
      if (++ctx.work > WORK_LIMIT) throw bad("The program is too large for the grounding view", undefined, true);
      let pick = -1, gen = false;
      for (let k = 0; k < lits.length && pick < 0; k++) if (!done[k] && lits[k].t !== "pos" && bound(lits[k].vars, sub)) pick = k;
      for (let k = 0; k < lits.length && pick < 0; k++) if (!done[k] && lits[k].t === "cmp" && assignable(lits[k], sub)) { pick = k; gen = true; }
      for (let k = 0; k < lits.length && pick < 0; k++) if (!done[k] && lits[k].t === "pos") { pick = k; gen = true; }
      if (pick < 0) {
        const open = lits.findIndex((_, k) => !done[k]);
        if (open >= 0) throw bad("Unsafe variable " + lits[open].vars.find(v => !(v in sub)));
        visit(sub, levels.slice());
        return;
      }
      const L = lits[pick];
      done[pick] = true;
      if (!gen) {
        let ok;
        if (L.t === "cmp") {
          const ls = ev(L.l, sub, C), rs = ev(L.r, sub, C);
          ok = ls.length > 0 && rs.length > 0 && ls.every(a => rs.every(b => holds(L.op, a, b)));
        } else ok = ctx.negOk(headAtoms(L.atom, sub, C)[0]);
        if (ok) rec(sub); else ctx.rej++;
      } else if (L.t === "cmp") {
        const [v, e] = loneVar(L.l, sub) ? [L.l.v, L.r] : [L.r.v, L.l];
        const vals = ev(e, sub, C);
        vals.forEach((val, idx) => { levels.push({ k: pick, bind: [[v, val]], i: idx + 1, n: vals.length }); rec({ ...sub, [v]: val }); levels.pop(); });
      } else {
        const cands = [];
        for (const a of ctx.src(L.atom.pred).slice()) { const s2 = matchAtom(L.atom, a, sub, C); if (s2) cands.push(s2); }
        cands.forEach((s2, idx) => {
          levels.push({ k: pick, bind: Object.keys(s2).filter(v => !(v in sub)).map(v => [v, s2[v]]), i: idx + 1, n: cands.length });
          rec(s2); levels.pop();
        });
      }
      done[pick] = false;
    };
    rec(sub0);
  }

  /* ------------------------------------------------------------ atoms that can be true / are certainly true */
  const mkDom = () => ({ by: new Map(), keys: new Set(), list: [] });
  function addAtom(d, a) {
    if (d.keys.has(a.key)) return false;
    if (d.list.length >= MAX_ATOMS) throw bad("More than " + MAX_ATOMS + " atoms: the program is too large for the grounding view", undefined, true);
    d.keys.add(a.key); d.list.push(a);
    if (!d.by.has(a.pred)) d.by.set(a.pred, []);
    d.by.get(a.pred).push(a);
    return true;
  }

  function computeDomains(rules, C, dead) {
    const work = { n: 0 };
    const guard = (ri, f) => {
      try { f(); } catch (e) { if (!(e instanceof AspError) || e.fatal) throw e; dead.set(ri, e.message); }
    };
    const possibleFix = certain => {
      const P = mkDom();
      const ctx = { C, src: p => P.by.get(p) || [], negOk: a => !certain.keys.has(a.key), work: 0, rej: 0 };
      for (let pass = 0; pass < 1000; pass++) {
        let changed = false;
        rules.forEach((r, ri) => {
          if (dead.has(ri)) return;
          guard(ri, () => enumerate(r.body, {}, ctx, sub => {
            for (const el of r.head.elems) {
              const put = s => headAtoms(el.atom, s, C).forEach(a => { if (addAtom(P, a)) changed = true; });
              if (el.cond.length) enumerate(el.cond, sub, ctx, put); else put(sub);
            }
          }));
        });
        work.n += ctx.work; ctx.work = 0;
        if (!changed) break;
      }
      return P;
    };
    const certainFix = possible => {
      const Ce = mkDom();
      const ctx = { C, src: p => Ce.by.get(p) || [], negOk: a => !possible.keys.has(a.key), work: 0, rej: 0 };
      for (let pass = 0; pass < 1000; pass++) {
        let changed = false;
        rules.forEach((r, ri) => {
          if (dead.has(ri) || r.head.kind !== "atom") return;
          guard(ri, () => enumerate(r.body, {}, ctx, sub => headAtoms(r.head.elems[0].atom, sub, C).forEach(a => {
            if (possible.keys.has(a.key) && addAtom(Ce, a)) changed = true;
          })));
        });
        ctx.work = 0;
        if (!changed) break;
      }
      return Ce;
    };
    let certain = mkDom(), possible = mkDom();
    for (let it = 0; it < 6; it++) {
      possible = possibleFix(certain);
      const c2 = certainFix(possible);
      const same = c2.list.length === certain.list.length;
      certain = c2;
      if (same) break;
    }
    return { possible, certain };
  }

  /* ------------------------------------------------------------ the trace */
  /** The bounds of a choice head as written: `1 {` / `1 <= {` before, `} 1` / `} = 1` after. */
  const boundText = h => ({
    lb: h.lb ? (h.lb.explicit ? h.lb.src + " " + h.lb.op + " " : h.lb.src + " ") : "",
    ub: h.ub ? (h.ub.explicit ? " " + h.ub.op + " " + h.ub.src : " " + h.ub.src) : "",
  });
  const fmtRule = (head, body) => head ? (body.length ? head + " :- " + body.join(", ") + "." : head + ".") : (body.length ? ":- " + body.join(", ") + "." : ":-.");

  function traceRules(rules, C, dom, dead) {
    const { possible, certain } = dom;
    const steps = [], ground = [], seen = new Set();
    const ctx = { C, src: p => possible.by.get(p) || [], negOk: a => !certain.keys.has(a.key), work: 0, rej: 0 };
    const push = s => { steps.push(s); s.n = ground.length; return s; };
    const addGround = (text, rule) => {
      if (seen.has(text)) return false;
      seen.add(text); ground.push({ text, rule, step: steps.length });
      return true;
    };
    const groundBody = (r, sub) => {
      const out = [];
      for (const L of r.body) {
        if (L.t === "cmp") continue;
        const a = headAtoms(L.atom, sub, C)[0];
        if (!a) return null;
        if (L.t === "pos") { if (!certain.keys.has(a.key)) out.push(a.key); }
        else if (possible.keys.has(a.key)) out.push("not " + a.key);
      }
      return out;
    };
    const lvOf = (levels, lits, prefix) => levels.map(l => ({ k: prefix(l.k), text: lits[l.k].src, bind: l.bind, i: l.i, n: l.n }));

    rules.forEach((r, ri) => {
      if (dead.has(ri)) return;
      const hk = r.head.kind, bodyKeys = r.body.map((_, k) => "b" + k);
      const headKeys = r.head.elems.flatMap((_, j) => ["h" + j, "c" + j]).concat(["hd", "hb"]);
      if (!r.body.length && hk === "atom") {
        const atoms = headAtoms(r.head.elems[0].atom, {}, C);
        atoms.forEach(a => addGround(a.key + ".", ri));
        push({ rule: ri, kind: "fact", act: ["hd", "h0"], sub: [], levels: [], atoms: atoms.slice(0, SHOWN_ATOMS).map(a => a.key), total: atoms.length });
        return;
      }
      let inst = 0, hidden = 0, shown = 0;
      const { lb, ub } = boundText(r.head);
      ctx.rej = 0;
      enumerate(r.body, {}, ctx, (sub, levels) => {
        inst++;
        const rej = ctx.rej; ctx.rej = 0;
        const body = groundBody(r, sub);
        if (!body) return;
        const vis = shown < PER_RULE && steps.length < MAX_STEPS;
        if (vis) shown++; else hidden++;
        const lv = lvOf(levels, r.body, k => "b" + k), binds = Object.entries(sub);
        if (hk === "atom" || hk === "none") {
          const heads = hk === "none" ? [""] : headAtoms(r.head.elems[0].atom, sub, C).map(a => a.key);
          const texts = heads.map(h => fmtRule(h, body)), fresh = texts.map(t => addGround(t, ri));
          if (vis) push({ rule: ri, kind: "inst", act: bodyKeys.concat(hk === "atom" ? ["hd", "h0"] : []), sub: binds, levels: lv, texts: texts.slice(0, 6), fresh: fresh.slice(0, 6), total: texts.length, rej });
          return;
        }
        // choice or disjunction: the body opens a set, each element is an inner loop
        const all = [];
        if (vis) push({ rule: ri, kind: "body", act: bodyKeys, sub: binds, levels: lv, set: [], rej });
        r.head.elems.forEach((el, j) => {
          const put = (sub2, lv2) => {
            for (const a of headAtoms(el.atom, sub2, C)) {
              const isNew = !all.includes(a.key);
              if (isNew) all.push(a.key);
              if (vis) push({ rule: ri, kind: "elem", act: ["h" + j, "c" + j], sub: Object.entries(sub2), levels: lv.concat(lvOf(lv2, el.cond, () => "c" + j)), atom: a.key, dup: !isNew, set: all.slice(), elem: j });
            }
          };
          if (el.cond.length) { const r0 = ctx.rej; enumerate(el.cond, sub, ctx, (s2, l2) => put(s2, l2)); ctx.rej = r0; } else put(sub, []);
        });
        const trivial = hk === "choice" && !all.length && !r.head.lb && !r.head.ub;
        const H = hk === "choice" ? lb + "{ " + all.join("; ") + (all.length ? " }" : "}") + ub : all.join(" | ");
        const text = fmtRule(H, body);
        const isNew = !trivial && !(hk === "disj" && !all.length) && addGround(text, ri);
        if (vis) push({ rule: ri, kind: "close", act: headKeys, sub: binds, levels: lv, set: all.slice(), text, dup: !isNew, empty: trivial || (hk === "disj" && !all.length) });
      });
      if (hidden) push({ rule: ri, kind: "bulk", act: bodyKeys.concat(headKeys), sub: [], levels: [], hidden, total: inst });
      if (!inst) push({ rule: ri, kind: "none", act: bodyKeys, sub: [], levels: [] });
    });
    push({ rule: null, kind: "end", act: [], sub: [], levels: [] });
    return { steps, ground };
  }

  /** Text pieces of a statement: `k` names the part of the rule a piece belongs to (see `act` of the steps). */
  function partsOf(clean, s0, e0, r) {
    const key = new Array(e0 - s0).fill(null), paint = (s, e, k) => { for (let x = Math.max(s, s0); x < Math.min(e, e0); x++) key[x - s0] = k; };
    if (r.head.kind !== "none") paint(r.head.s, r.head.e, "hd");
    r.head.elems.forEach((el, j) => { paint(el.s, el.e, "h" + j); if (el.cond.length) paint(el.cs, el.ce, "c" + j); });
    [r.head.lb, r.head.ub].forEach(b => b && paint(b.s, b.e, "hb"));
    r.body.forEach((L, k) => paint(L.s, L.e, "b" + k));
    const parts = [];
    for (let x = 0; x < key.length; x++) {
      const ch = clean[s0 + x];
      if (parts.length && parts[parts.length - 1].k === key[x]) parts[parts.length - 1].t += ch; else parts.push({ t: ch, k: key[x] });
    }
    parts.forEach(p => { p.t = p.t.replace(/\s+/g, " "); });
    if (parts.length) parts[0].t = parts[0].t.replace(/^\s+/, "");
    parts.push({ t: ".", k: null });
    return parts;
  }

  /** Grounding trace of a program: { rules, steps, ground, skipped, notes, incomplete } (lines are 0-based), or { error, line }. */
  function groundTrace(text) {
    const clean = blankComments(text);
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
    const lineOf = off => lineAt(starts, off);
    let toks;
    try { toks = lex(clean, lineOf); } catch (e) { return { error: e.message, line: e.line }; }
    const C = new Map(), rules = [], skipped = [], notes = [];
    let incomplete = "";
    const stmts = []; let acc = [];
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].k === "op" && toks[i].v === ".") { stmts.push(acc); acc = []; } else acc.push(toks[i]);
    }
    if (acc.length) incomplete = clean.slice(acc[0].s).trim();
    stmts.forEach(ts => {
      if (!ts.length) return;
      const s0 = ts[0].s, e0 = ts[ts.length - 1].e, line = lineOf(s0), endLine = lineOf(e0 - 1);
      const raw = clean.slice(s0, e0).replace(/\s+/g, " ") + ".";
      try {
        const st = parseStatement(ts, line);
        if (st.kind === "const") C.set(st.name, st.term);
        else if (st.kind === "ignore") { if (st.note) notes.push({ line, text: raw, note: st.note }); }
        else {
          checkSafe(st);
          const r = { head: st.head, body: st.body, text: raw, line, endLine };
          const src = (a, b) => clean.slice(a, b).replace(/\s+/g, " ");
          r.body.forEach(L => { L.src = src(L.s, L.e); });
          r.head.elems.forEach(el => el.cond.forEach(L => { L.src = src(L.s, L.e); }));
          [r.head.lb, r.head.ub].forEach(b => { if (b) b.src = src(b.ts, b.te); });
          rules.push(r); r.s0 = s0; r.e0 = e0;
        }
      } catch (e) {
        if (!(e instanceof AspError)) throw e;
        skipped.push({ line, endLine, text: raw, msg: e.message });
      }
    });
    if (!rules.length) return { error: skipped.length ? skipped[0].msg : "There are no rules to ground.", line: skipped.length ? skipped[0].line : null };
    try {
      const dead = new Map();
      const dom = computeDomains(rules, C, dead);
      const { steps, ground } = traceRules(rules, C, dom, dead);
      dead.forEach((msg, ri) => skipped.push({ line: rules[ri].line, endLine: rules[ri].endLine, text: rules[ri].text, msg }));
      const kindOf = r => r.head.kind === "none" ? "constraint" : !r.body.length && r.head.kind === "atom" ? "fact" : r.head.kind === "atom" ? "rule" : r.head.kind;
      const view = rules.map(r => {
        const { lb, ub } = boundText(r.head);
        return {
          text: r.text, parts: partsOf(clean, r.s0, r.e0, r), line: r.line, endLine: r.endLine, kind: kindOf(r), nbody: r.body.length,
          build: r.head.kind === "choice" ? { pre: lb + "{ ", sep: "; ", post: " }" + ub, empty: lb + "{ }" + ub } : r.head.kind === "disj" ? { pre: "", sep: " | ", post: "", empty: "" } : null,
        };
      });
      return { rules: view, steps, ground, skipped: skipped.sort((a, b) => a.line - b.line), notes, incomplete, atoms: dom.possible.list.length };
    } catch (e) {
      if (!(e instanceof AspError)) throw e;
      return { error: e.message, line: e.line !== undefined ? e.line : null };
    }
  }

  /** The grounding view for one program text, as the visualizer expects it (also used by the notebook output and the playground). */
  function groundingFor(text, file) {
    const g = groundTrace(text);
    if (g.error) return { error: g.error, file, line: g.line !== undefined && g.line !== null ? g.line + 1 : null };
    return { ...g, rules: g.rules.map(r => ({ ...r, file, line: r.line + 1, endLine: r.endLine + 1 })), skipped: g.skipped.map(s => ({ ...s, file, line: s.line + 1, endLine: s.endLine + 1 })), file };
  }

  return { AspError, parseProgram, evaluate, key, splitTop, isVar, animationFor, groundTrace, groundingFor };
});
