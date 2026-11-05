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

  /* ---- the demo frames are same-origin pages; give them the site theme */
  function syncFrame(frame) {
    try { frame.contentDocument.documentElement.dataset.theme = currentTheme(); } catch (e) { /* not loaded yet */ }
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
