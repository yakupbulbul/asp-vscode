/* Glue that lets media/webview.js run outside VS Code (notebook output or standalone page).
 * Provides the small acquireVsCodeApi() surface, picks a theme and keeps the iframe height in sync. */
(function () {
  "use strict";
  const init = window.__ASP_INIT__ || {};
  window.__ASP_EMBED__ = true;
  const root = document.documentElement;
  root.classList.add("embed-doc");

  /* ---- theme: explicit > VS Code variables of the host > JupyterLab > OS preference */
  function applyTheme() {
    if (init.theme === "light" || init.theme === "dark") { root.dataset.theme = init.theme; return; }
    try {
      const host = window.parent !== window ? window.parent.document : null;
      if (!host) return;
      const style = host.documentElement.style;
      let n = 0;
      for (let i = 0; i < style.length; i++) {
        const k = style[i];
        if (k.startsWith("--vscode-")) { root.style.setProperty(k, style.getPropertyValue(k)); n++; }
      }
      if (n) return;
      const jp = host.body && host.body.dataset && host.body.dataset.jpThemeLight;
      if (jp !== undefined) root.dataset.theme = jp === "true" ? "light" : "dark";
    } catch (e) { /* cross-origin host: keep the OS preference */ }
  }
  applyTheme();

  /* ---- messaging shim */
  const TABS = { animator: "anim", anim: "anim", answers: "models", models: "models", graph: "graph", console: "console" };
  let saved = { tab: TABS[init.tab] || "anim" };
  window.acquireVsCodeApi = () => ({
    postMessage(m) {
      if (m && m.type === "ready") setTimeout(deliver, 0);
    },
    getState: () => saved,
    setState: s => { saved = s; },
  });

  function deliver() {
    const text = init.program || "";
    const anim = text.trim() && window.AspEngine ? window.AspEngine.animationFor(text, init.title || "program") : null;
    const solve = init.state || null;
    window.postMessage({
      type: "state", file: { name: init.title || "program", scope: "activeFile" }, status: solve && solve.error ? "error" : "done",
      solve, anim, empty: !text.trim(), settings: { speed: 1400 },
    }, "*");
  }

  /* ---- keep the surrounding iframe as tall as its content (up to maxHeight) */
  function fit() {
    try {
      const f = window.frameElement;
      if (!f) return;
      const h = Math.ceil(document.body.getBoundingClientRect().height);
      f.style.height = Math.min(init.maxHeight || 760, h) + "px";
    } catch (e) { /* not embedded in an iframe */ }
  }
  addEventListener("load", () => { fit(); new ResizeObserver(fit).observe(document.body); });
})();
