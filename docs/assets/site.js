(function () {
  "use strict";
  var root = document.documentElement;

  /* ---- theme: saved choice, else the system setting */
  function safe(fn) { try { return fn(); } catch (e) { return null; } }
  function currentTheme() { return root.dataset.theme === "dark" ? "dark" : "light"; }
  function applyTheme(t) {
    root.dataset.theme = t;
    document.querySelectorAll("iframe[data-demo]").forEach(syncFrame);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === "dark" ? "#0a0a0a" : "#ffffff";
  }
  var stored = safe(function () { return localStorage.getItem("asp-theme"); });
  applyTheme(stored || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  var toggle = document.getElementById("theme-toggle");
  if (toggle) toggle.addEventListener("click", function () {
    var next = currentTheme() === "dark" ? "light" : "dark";
    safe(function () { localStorage.setItem("asp-theme", next); });
    applyTheme(next);
  });

  /* ---- the demo frames are same-origin pages; give them the site theme and a black and white palette */
  var MONO = {
    dark: { "--vscode-focusBorder": "#e6e6e6", "--vscode-button-background": "#f2f2f2", "--vscode-button-foreground": "#0a0a0a",
            "--vscode-button-hoverBackground": "#ffffff", "--vscode-charts-blue": "#fafafa", "--vscode-charts-orange": "#9e9e9e",
            "--vscode-charts-green": "#cfcfcf", "--vscode-charts-purple": "#707070", "--vscode-charts-red": "#bdbdbd",
            "--vscode-charts-yellow": "#888888", "--vscode-testing-iconPassed": "#8a8a8a", "--vscode-editorWarning-foreground": "#b0b0b0",
            "--vscode-editor-background": "#0a0a0a", "--vscode-editorWidget-background": "#121212", "--vscode-widget-border": "#272727",
            "--vscode-foreground": "#e8e8e8", "--vscode-descriptionForeground": "#a0a0a0" },
    light: { "--vscode-focusBorder": "#111111", "--vscode-button-background": "#111111", "--vscode-button-foreground": "#ffffff",
             "--vscode-button-hoverBackground": "#2b2b2b", "--vscode-charts-blue": "#0a0a0a", "--vscode-charts-orange": "#6b6b6b",
             "--vscode-charts-green": "#3a3a3a", "--vscode-charts-purple": "#9a9a9a", "--vscode-charts-red": "#1f1f1f",
             "--vscode-charts-yellow": "#7d7d7d", "--vscode-testing-iconPassed": "#3d3d3d", "--vscode-editorWarning-foreground": "#555555",
             "--vscode-editor-background": "#ffffff", "--vscode-editorWidget-background": "#f7f7f7", "--vscode-widget-border": "#e2e2e2",
             "--vscode-foreground": "#1a1a1a", "--vscode-descriptionForeground": "#5c5c5c" }
  };
  function syncFrame(frame) {
    try {
      var doc = frame.contentDocument, root = doc.documentElement, theme = currentTheme();
      root.dataset.theme = theme;
      var vars = MONO[theme];
      Object.keys(vars).forEach(function (k) { root.style.setProperty(k, vars[k]); });
      if (!doc.getElementById("mono-fix")) {
        var st = doc.createElement("style");
        st.id = "mono-fix";
        st.textContent = ".tag, .pill { color: var(--bg); } .btn.primary { color: var(--vscode-button-foreground); }";
        doc.head.appendChild(st);
      }
    } catch (e) { /* not loaded yet */ }
  }
  function withTheme(src) { return src + (src.indexOf("?") < 0 ? "?" : "&") + "theme=" + currentTheme(); }
  var frame = document.querySelector("iframe[data-demo]");
  if (frame) {
    frame.addEventListener("load", function () { syncFrame(frame); });
    var tabs = document.querySelectorAll(".demo-tabs button");
    tabs.forEach(function (b) {
      b.addEventListener("click", function () {
        tabs.forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
        frame.src = withTheme(b.dataset.src);
        var cap = document.getElementById("demo-caption");
        if (cap) cap.textContent = b.dataset.caption;
      });
    });
    var first = document.querySelector('.demo-tabs button[aria-selected="true"]');
    if (first) frame.src = withTheme(first.dataset.src);
  }

  /* ---- copy buttons */
  document.querySelectorAll("[data-copy], .code button.copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.dataset.copy || (btn.closest(".code") && btn.closest(".code").querySelector("pre").innerText) || "";
      var done = function () { var old = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = old; }, 1400); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });
})();
