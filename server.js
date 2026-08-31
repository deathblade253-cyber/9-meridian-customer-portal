"use strict";

// Dependency-free local API for authentication and customer feedback.

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const PORT = Number(process.env.PORT || 4173);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(48).toString("hex");
const SESSION_LIFETIME = 60 * 60 * 24 * 7;
const authAttempts = new Map();

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon"
};

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
function verifyPassword(password, stored) {
  const [salt, expectedHex] = String(stored || "").split(":");
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64); const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function newId(prefix) { return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString("hex")}`; }
function publicUser(user) { return { id: user.id, fullName: user.fullName, email: user.email, createdAt: user.createdAt }; }
function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
function validEmail(value) { return /^\S+@\S+\.\S+$/.test(value); }
function passwordQuality(value) { return String(value).length >= 8 && [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/].filter(test => test.test(value)).length >= 2; }

function initialStore() {
  const demoId = "usr_demo_meridian";
  return {
    users: [{ id: demoId, fullName: "Alex Dawson", email: "demo@9meridian.com", passwordHash: hashPassword("Demo@123"), createdAt: new Date().toISOString() }],
    feedback: [
      { id: "fb_demo_3", userId: demoId, rating: 5, category: "UI/UX Experience", subject: "The new overview feels effortless", message: "The signal cards make our Monday review much easier to scan.", attachment: null, status: "Resolved", createdAt: "2026-08-28T09:30:00.000Z" },
      { id: "fb_demo_2", userId: demoId, rating: 4, category: "Feature Request", subject: "Export workspace pulse", message: "A PDF snapshot for leadership updates would be useful.", attachment: null, status: "Under Review", createdAt: "2026-08-24T14:15:00.000Z" },
      { id: "fb_demo_1", userId: demoId, rating: 5, category: "General Feedback", subject: "Fast and focused setup", message: "The first workspace took less than ten minutes to organize.", attachment: null, status: "Submitted", createdAt: "2026-08-19T11:05:00.000Z" }
    ]
  };
}
function loadStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) { const fresh = initialStore(); saveStore(fresh); return fresh; }
  const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  if (!Array.isArray(parsed.users) || !Array.isArray(parsed.feedback)) throw new Error("Invalid data store shape");
  return parsed;
}
function saveStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${STORE_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
  if (fs.existsSync(STORE_FILE)) fs.rmSync(STORE_FILE);
  fs.renameSync(temporary, STORE_FILE);
}

let store = loadStore();

function b64(value) { return Buffer.from(value).toString("base64url"); }
function signSession(user) {
  const payload = b64(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + SESSION_LIFETIME }));
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
function readSession(request) {
  const header = request.headers.authorization || ""; const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [payload, signature] = token.split("."); if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature); const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try { const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); if (!claims.sub || claims.exp < Date.now() / 1000) return null; return store.users.find(user => user.id === claims.sub) || null; } catch { return null; }
}

function securityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin"); response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
}
function json(response, status, payload) { securityHeaders(response); response.writeHead(status, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" }); response.end(JSON.stringify(payload)); }
function readJson(request) {
  return new Promise((resolve, reject) => { let body = ""; request.on("data", chunk => { body += chunk; if (body.length > 200_000) { reject(new Error("Request is too large.")); request.destroy(); } }); request.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Request body must be valid JSON.")); } }); request.on("error", reject); });
}
function requireUser(request, response) { const user = readSession(request); if (!user) json(response, 401, { message: "Your session has expired. Please sign in again." }); return user; }
function rateLimited(request) {
  const key = request.socket.remoteAddress || "local"; const now = Date.now(); const record = authAttempts.get(key) || { count: 0, reset: now + 10 * 60_000 };
  if (now > record.reset) { record.count = 0; record.reset = now + 10 * 60_000; }
  record.count += 1; authAttempts.set(key, record); return record.count > 30;
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/health" && request.method === "GET") return json(response, 200, { status: "ok", service: "9 Meridian mock API" });
  if ((pathname === "/api/auth/login" || pathname === "/api/auth/register") && rateLimited(request)) return json(response, 429, { message: "Too many attempts. Please wait a few minutes." });

  if (pathname === "/api/auth/register" && request.method === "POST") {
    const body = await readJson(request); const email = normalizeEmail(body.email); const fullName = String(body.fullName || "").trim(); const password = String(body.password || "");
    if (fullName.length < 2 || fullName.length > 80) return json(response, 400, { message: "Enter a valid full name." });
    if (!validEmail(email)) return json(response, 400, { message: "Enter a valid email address." });
    if (!passwordQuality(password)) return json(response, 400, { message: "Use at least 8 characters with a mix of letters, numbers, or symbols." });
    if (store.users.some(user => user.email === email)) return json(response, 409, { message: "An account with this email already exists." });
    const user = { id: newId("usr"), fullName, email, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    store.users.push(user); saveStore(store); return json(response, 201, { token: signSession(user), user: publicUser(user) });
  }
  if (pathname === "/api/auth/login" && request.method === "POST") {
    const body = await readJson(request); const email = normalizeEmail(body.email); const password = String(body.password || ""); const user = store.users.find(item => item.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) return json(response, 401, { message: "Email or password is incorrect." });
    return json(response, 200, { token: signSession(user), user: publicUser(user) });
  }
  if (pathname === "/api/auth/forgot" && request.method === "POST") {
    await readJson(request); return json(response, 200, { message: "If an account exists, recovery instructions have been sent." });
  }
  if (pathname === "/api/auth/me" && request.method === "GET") { const user = requireUser(request, response); if (user) return json(response, 200, { user: publicUser(user) }); return; }
  if (pathname === "/api/auth/profile" && request.method === "PATCH") {
    const user = requireUser(request, response); if (!user) return; const body = await readJson(request); const fullName = String(body.fullName || "").trim();
    if (fullName.length < 2 || fullName.length > 80) return json(response, 400, { message: "Enter a valid full name." });
    user.fullName = fullName; saveStore(store); return json(response, 200, { user: publicUser(user) });
  }
  if (pathname === "/api/feedback" && request.method === "GET") {
    const user = requireUser(request, response); if (!user) return; const feedback = store.feedback.filter(item => item.userId === user.id).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)); return json(response, 200, { feedback });
  }
  if (pathname === "/api/feedback" && request.method === "POST") {
    const user = requireUser(request, response); if (!user) return; const body = await readJson(request); const allowed = ["Feature Request","Bug Report","General Feedback","UI/UX Experience"];
    const rating = Number(body.rating), category = String(body.category || ""), subject = String(body.subject || "").trim(), message = String(body.message || "").trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json(response, 400, { message: "Choose a rating from 1 to 5." });
    if (!allowed.includes(category)) return json(response, 400, { message: "Choose a valid feedback category." });
    if (!subject || subject.length > 80 || !message || message.length > 600) return json(response, 400, { message: "Add a subject and feedback message within the limits." });
    let attachment = null; if (body.attachment) { const size = Number(body.attachment.size); const type = String(body.attachment.type || ""); const name = path.basename(String(body.attachment.name || "attachment")); if (size > 5*1024*1024) return json(response,400,{message:"Attachment must be smaller than 5 MB."}); attachment = { name: name.slice(0,120), size, type: type.slice(0,80) }; }
    const item = { id: newId("fb"), userId: user.id, rating, category, subject, message, attachment, status: "Submitted", createdAt: new Date().toISOString() };
    store.feedback.push(item); saveStore(store); return json(response, 201, { feedback: item });
  }
  return json(response, 404, { message: "API route not found." });
}

function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  if (!requested || requested.includes("\0") || requested.split(/[\\/]/).some(part => part === "..") || requested.startsWith("data/")) return json(response, 404, { message: "Not found." });
  const filePath = path.resolve(ROOT, requested); if (!filePath.startsWith(ROOT + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return json(response, 404, { message: "Not found." });
  securityHeaders(response); const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": type, "Cache-Control": type.startsWith("text/html") ? "no-cache" : "public, max-age=3600" }); fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  try { const url = new URL(request.url, `http://${request.headers.host || "localhost"}`); if (url.pathname.startsWith("/api/")) await handleApi(request, response, url.pathname); else if (request.method === "GET" || request.method === "HEAD") serveStatic(response, url.pathname); else json(response, 405, { message: "Method not allowed." }); }
  catch (error) { console.error(error); if (!response.headersSent) json(response, 500, { message: "The local service encountered an unexpected error." }); else response.end(); }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`9 Meridian is running at http://127.0.0.1:${PORT}`);
  console.log("Demo login: demo@9meridian.com / Demo@123");
  if (!process.env.SESSION_SECRET) console.log("Tip: set SESSION_SECRET before deploying outside local development.");
});
