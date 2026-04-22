import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/run-api-python.mjs <python-args...>");
  process.exit(1);
}

const candidates = [
  resolve("hillside-api", ".venv", "Scripts", "python.exe"),
  resolve("hillside-api", ".venv", "bin", "python"),
  "python",
];

const pythonCommand = candidates.find((candidate) => candidate === "python" || existsSync(candidate));

if (!pythonCommand) {
  console.error("Could not locate a Python interpreter for hillside-api.");
  process.exit(1);
}

const child = spawn(pythonCommand, args, { stdio: "inherit" });

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Python process terminated with signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(`Failed to start Python: ${error.message}`);
  process.exit(1);
});
