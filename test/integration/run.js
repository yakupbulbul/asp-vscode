"use strict";
/* Launches a real VS Code (an isolated profile) and runs the suite in ./suite.js inside the extension host. */
const path = require("path");
const os = require("os");
const fs = require("fs");
const { runTests } = require("@vscode/test-electron");

(async () => {
  const root = path.resolve(__dirname, "..", "..");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "asp-it-"));
  try {
    await runTests({
      vscodeExecutablePath: process.env.VSCODE_EXECUTABLE || undefined,
      version: process.env.VSCODE_EXECUTABLE ? undefined : "stable",
      extensionDevelopmentPath: root,
      extensionTestsPath: path.join(__dirname, "suite.js"),
      launchArgs: [path.join(__dirname, "workspace"), "--disable-extensions", "--user-data-dir", path.join(profile, "data"), "--extensions-dir", path.join(profile, "ext")],
    });
  } catch (e) {
    console.error("Integration tests failed:", e.message || e);
    process.exit(1);
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
})();
