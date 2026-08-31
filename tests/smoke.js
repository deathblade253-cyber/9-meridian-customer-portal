"use strict";

// End-to-end smoke coverage for the local mock service.

const path = require("node:path");
const { spawn } = require("node:child_process");

const port = 4183;
const root = path.resolve(__dirname, "..");
const child = spawn(process.execPath, [path.join(root, "server.js")], {
  cwd: root,
  env: { ...process.env, PORT: String(port), SESSION_SECRET: "local-smoke-test-secret-that-is-long-enough" },
  stdio: ["ignore", "pipe", "pipe"]
});

const base = `http://127.0.0.1:${port}`;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function call(route, options = {}) {
  const response = await fetch(base + route, options);
  const data = await response.json();
  return { response, data };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { const result = await call("/api/health"); if (result.response.ok) return; } catch { /* booting */ }
    await delay(100);
  }
  throw new Error("Local server did not become ready.");
}

async function run() {
  await waitForServer();
  const health = await call("/api/health");
  if (health.data.status !== "ok") throw new Error("Health endpoint failed.");
  if (!health.response.headers.get("content-security-policy")) throw new Error("Security headers are missing.");

  const rejected = await call("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "demo@9meridian.com", password: "incorrect" }) });
  if (rejected.response.status !== 401) throw new Error("Invalid credentials were not rejected.");

  const login = await call("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "demo@9meridian.com", password: "Demo@123" }) });
  if (!login.response.ok || !login.data.token) throw new Error("Demo login failed.");
  const authorization = { Authorization: `Bearer ${login.data.token}` };
  const me = await call("/api/auth/me", { headers: authorization });
  if (me.data.user.email !== "demo@9meridian.com") throw new Error("Session identity failed.");
  const feedback = await call("/api/feedback", { headers: authorization });
  if (!Array.isArray(feedback.data.feedback)) throw new Error("Feedback history failed.");

  console.log(`Smoke test passed: auth, sessions, feedback, and security headers (${feedback.data.feedback.length} feedback items).`);
}

run().then(() => child.kill()).catch(error => { console.error(error); child.kill(); process.exitCode = 1; });
