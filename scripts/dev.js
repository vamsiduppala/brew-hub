const { spawn } = require("child_process");
const path = require("path");

console.log("[Runner] Launching Next.js Server & RSS Crawler Daemon...");

// Start the Next.js server on port 3001
const nextPath = path.resolve(__dirname, "../node_modules/next/dist/bin/next");
const nextDev = spawn("node", [nextPath, "dev", "-p", "3001"], {
  stdio: "inherit"
});

// Start the Crawler daemon
const crawlerPath = path.resolve(__dirname, "crawler.js");
const crawler = spawn("node", [crawlerPath], {
  stdio: "inherit"
});

// Forward exit signals
nextDev.on("exit", (code) => {
  console.log(`[Runner] Next.js process exited with code ${code}`);
  crawler.kill();
  process.exit(code || 0);
});

crawler.on("exit", (code) => {
  console.log(`[Runner] Crawler process exited with code ${code}`);
  nextDev.kill();
  process.exit(code || 0);
});

process.on("SIGINT", () => {
  console.log("\n[Runner] Gracefully shutting down both services...");
  nextDev.kill();
  crawler.kill();
  process.exit(0);
});
