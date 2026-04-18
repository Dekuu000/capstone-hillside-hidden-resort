#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const localAppDataDir = path.join(projectRoot, ".cache", "localappdata");
const useGlobalCache = process.env.HILLSIDE_HARDHAT_USE_GLOBAL_CACHE === "1";

if (!useGlobalCache) {
  // Keep Hardhat cache inside the repo to avoid LOCALAPPDATA permission issues.
  process.env.LOCALAPPDATA = localAppDataDir;
}

try {
  fs.mkdirSync(process.env.LOCALAPPDATA, { recursive: true });
} catch (error) {
  console.error("[run-hardhat] failed to prepare cache directory:", error.message);
  process.exit(1);
}

const hardhatCliPath = path.join(
  projectRoot,
  "node_modules",
  "hardhat",
  "internal",
  "cli",
  "bootstrap.js"
);

const child = spawn(process.execPath, [hardhatCliPath, ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error("[run-hardhat] failed to launch Hardhat:", error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
