/* Lets the shared visualizer (assets/panel/webview.js) run inside the playground iframe:
 * it receives its state from the parent page and reports clicks and animator steps back. */
(function () {
  "use strict";
  window.__ASP_EMBED__ = true;
  document.documentElement.classList.add("embed-doc", "fill");
  window.acquireVsCodeApi = function () {
    var saved = null;
    return {
      postMessage: function (m) { parent.postMessage({ aspPanel: true, message: m }, "*"); },
      getState: function () { return saved; },
      setState: function (s) { saved = s; },
    };
  };
})();
