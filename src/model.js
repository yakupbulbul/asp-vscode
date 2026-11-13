"use strict";
/* vscode-independent helpers that turn a solver result and the program text into the state the webview renders. */
const { parseProgram, evaluate, key, groundTrace } = require("../media/engine");

/** Build the animator data. `locations` maps each rule to its source file and 0-based local lines (for editor highlighting). */
function buildAnimation(sources) {
  const text = sources.map(s => s.text).join("\n") + "\n";
  const starts = []; let acc = 0;
  for (const s of sources) { starts.push(acc); acc += s.text.split("\n").length; }
  const locate = line => { let i = starts.length - 1; while (i > 0 && starts[i] > line) i--; return { sourceIndex: i, line: line - starts[i] }; };
  try {
    const rules = parseProgram(text);
    const rounds = evaluate(rules);
    const locations = rules.map(r => ({ ...locate(r.line), endLine: locate(r.endLine).line }));
    return {
      locations,
      view: {
        rules: rules.map((r, i) => ({ text: r.text, file: sources[locations[i].sourceIndex].name, line: locations[i].line + 1, endLine: locations[i].endLine + 1, fact: !r.body.length })),
        rounds: rounds.map(rd => rd.map(f => ({ pred: f.atom.pred, args: f.atom.args, atom: key(f.atom), rule: f.rule, subst: f.subst }))),
        incomplete: rules.incomplete || "",
      },
    };
  } catch (e) {
    const loc = e.line !== undefined ? locate(e.line) : null;
    return { locations: [], view: { error: String(e.message), file: loc ? sources[loc.sourceIndex].name : null, line: loc ? loc.line + 1 : null } };
  }
}

/** Build the grounding view. Like `buildAnimation`, `locations` maps each shown rule to its source file and 0-based local lines. */
function buildGrounding(sources) {
  const text = sources.map(s => s.text).join("\n") + "\n";
  const starts = []; let acc = 0;
  for (const s of sources) { starts.push(acc); acc += s.text.split("\n").length; }
  const locate = line => { let i = starts.length - 1; while (i > 0 && starts[i] > line) i--; return { sourceIndex: i, line: line - starts[i] }; };
  const g = groundTrace(text);
  if (g.error) {
    const loc = g.line !== undefined && g.line !== null ? locate(g.line) : null;
    return { locations: [], view: { error: g.error, file: loc ? sources[loc.sourceIndex].name : null, line: loc ? loc.line + 1 : null } };
  }
  const locations = g.rules.map(r => ({ ...locate(r.line), endLine: locate(r.endLine).line }));
  const named = (x, loc) => ({ ...x, file: sources[loc.sourceIndex].name, line: loc.line + 1, endLine: locate(x.endLine).line + 1 });
  return {
    locations,
    view: {
      ...g,
      rules: g.rules.map((r, i) => named(r, locations[i])),
      skipped: g.skipped.map(x => named(x, locate(x.line))),
    },
  };
}

/** Limit the models sent to the webview and attach file names to diagnostics. */
function trimResult(result, sources, maxModels) {
  return {
    ...result,
    totalModels: result.models.length,
    models: result.models.slice(0, maxModels),
    diagnostics: result.diagnostics.map(d => ({ ...d, file: sources[d.sourceIndex].name })),
  };
}

module.exports = { buildAnimation, buildGrounding, trimResult };
