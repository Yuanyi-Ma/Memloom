#!/usr/bin/env node
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { rebuildAgentIndex } = require("./build_agent_index");

const ALLOWED_FORMS = new Set(["practice", "methodology", "theory"]);
const ALLOWED_REL_TARGETS = new Set(["canonical", "pending"]);
const EDITABLE_FIELDS = new Set([
  "title",
  "abstract",
  "agent",
  "human",
  "domain",
  "form",
  "relations",
  "temporal",
  "learning",
]);

function parseArgs(argv) {
  const out = {
    host: "127.0.0.1",
    port: 4177,
    knowledgeDir: path.resolve(process.cwd(), "knowledge"),
    check: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--host") out.host = argv[++i];
    else if (arg === "--port") out.port = Number(argv[++i]);
    else if (arg === "--knowledge-dir") out.knowledgeDir = path.resolve(argv[++i]);
    else if (arg === "--check") out.check = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(out.port) || out.port < 1 || out.port > 65535) {
    throw new Error("--port must be an integer between 1 and 65535");
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  node review_server.js --knowledge-dir /path/to/knowledge --host 127.0.0.1 --port 4177
  node review_server.js --knowledge-dir /path/to/knowledge --check`);
}

function utcNowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readText(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath, fallback) {
  const text = readText(filePath, null);
  if (text === null || text.trim() === "") return jsonClone(fallback);
  return JSON.parse(text);
}

function writeJsonAtomic(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, filePath);
}

function ensureKnowledgeLayout(knowledgeDir) {
  fs.mkdirSync(path.join(knowledgeDir, "canonical"), { recursive: true });
  const defaults = {
    "pending.json": {},
    "duplicates.json": {},
    "rejected.json": {},
    "distill_stage1.json": {},
    "history.json": { last_run_at: null, sessions: {} },
  };
  for (const [name, value] of Object.entries(defaults)) {
    const filePath = path.join(knowledgeDir, name);
    if (!fs.existsSync(filePath)) writeJsonAtomic(filePath, value);
  }
  const whitelist = path.join(knowledgeDir, "whitelist.yaml");
  if (!fs.existsSync(whitelist)) {
    fs.writeFileSync(
      whitelist,
      "domains:\n  - blockchain\n  - ai\n  - writing\n  - system\n  - life\n",
      "utf8",
    );
  }
}

function parseWhitelist(text) {
  const domains = [];
  let inDomains = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line === "domains:") {
      inDomains = true;
      continue;
    }
    if (inDomains && line.startsWith("- ")) {
      const item = line.slice(2).trim();
      if (item) domains.push(item);
      continue;
    }
    if (inDomains && !raw.startsWith(" ") && !raw.startsWith("\t")) {
      inDomains = false;
    }
  }
  return [...new Set(domains)];
}

function loadDomains(knowledgeDir) {
  const domains = parseWhitelist(readText(path.join(knowledgeDir, "whitelist.yaml"), ""));
  if (!domains.includes("_unknown")) domains.push("_unknown");
  return domains;
}

function safeDomainFile(domain, domains) {
  if (!domains.includes(domain)) {
    throw httpError(400, `domain is not in whitelist: ${domain}`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(domain)) {
    throw httpError(400, `domain contains unsupported characters: ${domain}`);
  }
  return `${domain}.json`;
}

function canonicalDir(knowledgeDir) {
  return path.join(knowledgeDir, "canonical");
}

function readCanonicalFiles(knowledgeDir) {
  const dir = canonicalDir(knowledgeDir);
  if (!fs.existsSync(dir)) return new Map();
  const files = new Map();
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    const filePath = path.join(dir, name);
    const data = readJson(filePath, {});
    if (data && typeof data === "object" && !Array.isArray(data)) {
      files.set(name, data);
    }
  }
  return files;
}

function loadCanonicalMap(knowledgeDir) {
  const files = readCanonicalFiles(knowledgeDir);
  const entries = {};
  const locations = {};
  for (const [fileName, data] of files.entries()) {
    for (const [id, body] of Object.entries(data)) {
      if (body && typeof body === "object" && !Array.isArray(body)) {
        entries[id] = body;
        locations[id] = fileName;
      }
    }
  }
  return { entries, locations, files };
}

function loadState(knowledgeDir) {
  ensureKnowledgeLayout(knowledgeDir);
  const pending = readJson(path.join(knowledgeDir, "pending.json"), {});
  const duplicates = readJson(path.join(knowledgeDir, "duplicates.json"), {});
  const rejected = readJson(path.join(knowledgeDir, "rejected.json"), {});
  const { entries: canonical } = loadCanonicalMap(knowledgeDir);
  const domains = loadDomains(knowledgeDir);
  return {
    knowledge_dir: knowledgeDir,
    domains,
    pending,
    canonical,
    duplicates,
    rejected,
    stats: buildStats(pending, canonical, duplicates, rejected),
  };
}

function countBy(items, getter) {
  const out = {};
  for (const item of items) {
    const key = getter(item) || "_empty";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function buildStats(pending, canonical, duplicates, rejected) {
  const pendingItems = Object.values(pending || {});
  const canonicalItems = Object.values(canonical || {});
  return {
    pending_count: Object.keys(pending || {}).length,
    canonical_count: Object.keys(canonical || {}).length,
    duplicate_count: Object.keys(duplicates || {}).length,
    rejected_count: Object.keys(rejected || {}).length,
    pending_by_judgment: countBy(pendingItems, (x) => x.m1_judgment),
    pending_by_domain: countBy(pendingItems, (x) => x.domain),
    pending_by_form: countBy(pendingItems, (x) => x.form),
    canonical_by_domain: countBy(canonicalItems, (x) => x.domain),
  };
}

function inferRelationTarget(rel) {
  if (rel && ALLOWED_REL_TARGETS.has(rel.target)) return rel.target;
  const id = String(rel && rel.id ? rel.id : "");
  return id.startsWith("p_") ? "pending" : "canonical";
}

function normalizeRelations(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw httpError(400, "relations must be an array");
  return raw.map((rel, idx) => {
    if (!rel || typeof rel !== "object" || Array.isArray(rel)) {
      throw httpError(400, `relations[${idx}] must be an object`);
    }
    const id = requireString(rel.id, `relations[${idx}].id`);
    const type = rel.type == null ? "link" : requireString(rel.type, `relations[${idx}].type`);
    if (type !== "link") throw httpError(400, `relations[${idx}].type must be link`);
    const target = inferRelationTarget(rel);
    if (!ALLOWED_REL_TARGETS.has(target)) {
      throw httpError(400, `relations[${idx}].target is invalid`);
    }
    const out = { type: "link", id, target };
    if (rel.reason != null && String(rel.reason).trim()) out.reason = String(rel.reason).trim();
    return out;
  });
}

function filterCanonicalRelations(relations) {
  return normalizeRelations(relations || []).filter((rel) => rel.target === "canonical");
}

function retargetPendingRelations(pending, oldPendingId, newCanonicalId) {
  for (const body of Object.values(pending || {})) {
    if (!body || typeof body !== "object" || !Array.isArray(body.relations)) continue;
    body.relations = body.relations.map((rel) => {
      if (!rel || typeof rel !== "object") return rel;
      if (rel.id === oldPendingId && inferRelationTarget(rel) === "pending") {
        return { ...rel, id: newCanonicalId, target: "canonical" };
      }
      return rel;
    });
  }
}

function removePendingRelations(pending, removedPendingId) {
  for (const body of Object.values(pending || {})) {
    if (!body || typeof body !== "object" || !Array.isArray(body.relations)) continue;
    body.relations = body.relations.filter((rel) => {
      if (!rel || typeof rel !== "object") return true;
      return !(rel.id === removedPendingId && inferRelationTarget(rel) === "pending");
    });
  }
}

function requireString(value, label, allowEmpty = false) {
  if (typeof value !== "string") throw httpError(400, `${label} must be a string`);
  if (!allowEmpty && !value.trim()) throw httpError(400, `${label} must be non-empty`);
  return value;
}

function normalizeNullableString(value, label) {
  if (value == null) return null;
  if (typeof value !== "string") throw httpError(400, `${label} must be a string or null`);
  return value;
}

function normalizeEditablePatch(raw, domains) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw httpError(400, "request body must be an object");
  }
  const patch = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!EDITABLE_FIELDS.has(key)) continue;
    if (key === "title" || key === "abstract") patch[key] = requireString(value, key);
    else if (key === "agent" || key === "human") patch[key] = normalizeNullableString(value, key);
    else if (key === "domain") {
      const domain = requireString(value, "domain");
      safeDomainFile(domain, domains);
      patch[key] = domain;
    } else if (key === "form") {
      const form = requireString(value, "form");
      if (!ALLOWED_FORMS.has(form)) throw httpError(400, `form is invalid: ${form}`);
      patch[key] = form;
    } else if (key === "relations") {
      patch[key] = normalizeRelations(value);
    } else if (key === "temporal") {
      patch[key] = normalizeTemporal(value);
    } else if (key === "learning") {
      patch[key] = normalizeLearning(value);
    }
  }
  return patch;
}

function normalizeTemporal(value) {
  if (value == null) return { invalid_at: null };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "temporal must be an object or null");
  }
  return { invalid_at: normalizeNullableString(value.invalid_at, "temporal.invalid_at") };
}

function normalizeLearning(value) {
  if (value == null) return { active_recall_questions: null };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "learning must be an object or null");
  }
  const questions = value.active_recall_questions;
  if (questions == null) return { active_recall_questions: null };
  if (!Array.isArray(questions)) {
    throw httpError(400, "learning.active_recall_questions must be an array or null");
  }
  return { active_recall_questions: questions.map((x, idx) => requireString(x, `learning.active_recall_questions[${idx}]`)) };
}

function nextCanonicalId(knowledgeDir) {
  const { entries } = loadCanonicalMap(knowledgeDir);
  let max = 0;
  for (const id of Object.keys(entries)) {
    if (/^\d+$/.test(id)) max = Math.max(max, Number(id));
  }
  return String(max + 1).padStart(4, "0");
}

function canonicalPathForDomain(knowledgeDir, domain, domains) {
  return path.join(canonicalDir(knowledgeDir), safeDomainFile(domain, domains));
}

function writeCanonicalEntry(knowledgeDir, body, domains) {
  const filePath = canonicalPathForDomain(knowledgeDir, body.domain, domains);
  const data = readJson(filePath, {});
  if (data[body.id]) throw httpError(409, `canonical id already exists: ${body.id}`);
  data[body.id] = body;
  writeJsonAtomic(filePath, data);
}

function updateCanonicalEntry(knowledgeDir, id, updater) {
  const { files, locations } = loadCanonicalMap(knowledgeDir);
  const fileName = locations[id];
  if (!fileName) throw httpError(404, `canonical not found: ${id}`);
  const data = files.get(fileName);
  data[id] = updater(data[id]);
  writeJsonAtomic(path.join(canonicalDir(knowledgeDir), fileName), data);
  return data[id];
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function acceptPending(knowledgeDir, id, body) {
  const domains = loadDomains(knowledgeDir);
  const pendingPath = path.join(knowledgeDir, "pending.json");
  const pending = readJson(pendingPath, {});
  const candidate = pending[id];
  if (!candidate) throw httpError(404, `pending candidate not found: ${id}`);

  const mode = body.mode || "accept_as_new";
  if (mode === "accept_as_new") {
    const now = utcNowIso();
    const newId = nextCanonicalId(knowledgeDir);
    const canonical = jsonClone(candidate);
    canonical.id = newId;
    canonical.audit_status = "accepted";
    canonical.human_audited_at = now;
    canonical.relations = filterCanonicalRelations(canonical.relations || []);
    if (!canonical.weight) canonical.weight = { use_count: 0, last_used: null };
    if (!canonical.temporal) canonical.temporal = { invalid_at: null };
    if (!canonical.learning) canonical.learning = { active_recall_questions: null };
    safeDomainFile(canonical.domain, domains);
    writeCanonicalEntry(knowledgeDir, canonical, domains);
    delete pending[id];
    retargetPendingRelations(pending, id, newId);
    writeJsonAtomic(pendingPath, pending);
    return { accepted_id: newId, mode };
  }

  if (mode === "apply_update") {
    const targetId = body.target_id || (candidate.m1_neighbors && candidate.m1_neighbors[0] && candidate.m1_neighbors[0].id);
    if (!targetId) throw httpError(400, "target_id is required for apply_update");
    const patch = normalizeUpdatePatch(body.patch, candidate);
    const now = utcNowIso();
    const updated = updateCanonicalEntry(knowledgeDir, targetId, (oldBody) => ({
      ...oldBody,
      title: patch.title,
      abstract: patch.abstract,
      agent: patch.agent,
      human: patch.human,
      audit_status: "revised",
      human_audited_at: now,
    }));
    delete pending[id];
    writeJsonAtomic(pendingPath, pending);
    return { updated_id: updated.id, mode };
  }

  throw httpError(400, `unsupported accept mode: ${mode}`);
}

function normalizeUpdatePatch(rawPatch, candidate) {
  let patch = rawPatch;
  if (!patch && typeof candidate.m1_merge_preview === "string") {
    try {
      const parsed = JSON.parse(candidate.m1_merge_preview);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) patch = parsed;
    } catch {
      patch = null;
    }
  }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw httpError(400, "apply_update requires a structured patch with title/abstract/agent/human");
  }
  return {
    title: requireString(patch.title, "patch.title"),
    abstract: requireString(patch.abstract, "patch.abstract"),
    agent: normalizeNullableString(patch.agent, "patch.agent"),
    human: normalizeNullableString(patch.human, "patch.human"),
  };
}

function rejectPending(knowledgeDir, id) {
  const pendingPath = path.join(knowledgeDir, "pending.json");
  const rejectedPath = path.join(knowledgeDir, "rejected.json");
  const pending = readJson(pendingPath, {});
  const rejected = readJson(rejectedPath, {});
  const candidate = pending[id];
  if (!candidate) throw httpError(404, `pending candidate not found: ${id}`);
  const now = utcNowIso();
    const body = jsonClone(candidate);
  body.audit_status = "rejected";
  body.human_audited_at = now;
  body.rejected_at = now;
  rejected[id] = body;
  delete pending[id];
  removePendingRelations(pending, id);
  writeJsonAtomic(rejectedPath, rejected);
  writeJsonAtomic(pendingPath, pending);
  return { rejected_id: id };
}

function patchPending(knowledgeDir, id, rawPatch) {
  const domains = loadDomains(knowledgeDir);
  const pendingPath = path.join(knowledgeDir, "pending.json");
  const pending = readJson(pendingPath, {});
  if (!pending[id]) throw httpError(404, `pending candidate not found: ${id}`);
  const patch = normalizeEditablePatch(rawPatch, domains);
  pending[id] = { ...pending[id], ...patch };
  writeJsonAtomic(pendingPath, pending);
  return pending[id];
}

function patchCanonical(knowledgeDir, id, rawPatch) {
  const domains = loadDomains(knowledgeDir);
  const patch = normalizeEditablePatch(rawPatch, domains);
  return updateCanonicalEntry(knowledgeDir, id, (oldBody) => ({ ...oldBody, ...patch }));
}

function rebuildAgentIndexWarning(knowledgeDir) {
  try {
    rebuildAgentIndex(knowledgeDir);
    return {};
  } catch (err) {
    return { index_error: err.message || "index rebuild failed" };
  }
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text);
}

function sendJson(res, status, obj) {
  const body = `${JSON.stringify(obj, null, 2)}\n`;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function serveStatic(req, res, publicDir, pathname) {
  const clean = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(clean);
  const filePath = path.resolve(publicDir, `.${decoded}`);
  if (!filePath.startsWith(path.resolve(publicDir))) {
    sendText(res, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, "Not found");
    return;
  }
  const data = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentTypeFor(filePath),
    "Content-Length": data.length,
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function makeServer(options) {
  const publicDir = path.resolve(__dirname, "..", "public");
  const knowledgeDir = options.knowledgeDir;

  return http.createServer(async (req, res) => {
    try {
      const parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const pathname = parsed.pathname;
      if (pathname === "/api/state" && req.method === "GET") {
        sendJson(res, 200, loadState(knowledgeDir));
        return;
      }

      let match = pathname.match(/^\/api\/pending\/([^/]+)$/);
      if (match && req.method === "GET") {
        const pending = readJson(path.join(knowledgeDir, "pending.json"), {});
        const item = pending[decodeURIComponent(match[1])];
        if (!item) throw httpError(404, "pending candidate not found");
        sendJson(res, 200, item);
        return;
      }
      if (match && req.method === "PATCH") {
        const item = patchPending(knowledgeDir, decodeURIComponent(match[1]), await readRequestJson(req));
        sendJson(res, 200, item);
        return;
      }

      match = pathname.match(/^\/api\/pending\/([^/]+)\/accept$/);
      if (match && req.method === "POST") {
        const result = acceptPending(knowledgeDir, decodeURIComponent(match[1]), await readRequestJson(req));
        const indexWarning = rebuildAgentIndexWarning(knowledgeDir);
        sendJson(res, 200, { ok: true, ...result, ...indexWarning, state: loadState(knowledgeDir) });
        return;
      }

      match = pathname.match(/^\/api\/pending\/([^/]+)\/reject$/);
      if (match && req.method === "POST") {
        const result = rejectPending(knowledgeDir, decodeURIComponent(match[1]));
        sendJson(res, 200, { ok: true, ...result, state: loadState(knowledgeDir) });
        return;
      }

      match = pathname.match(/^\/api\/canonical\/([^/]+)$/);
      if (match && req.method === "GET") {
        const { entries } = loadCanonicalMap(knowledgeDir);
        const item = entries[decodeURIComponent(match[1])];
        if (!item) throw httpError(404, "canonical entry not found");
        sendJson(res, 200, item);
        return;
      }
      if (match && req.method === "PATCH") {
        const item = patchCanonical(knowledgeDir, decodeURIComponent(match[1]), await readRequestJson(req));
        const indexWarning = rebuildAgentIndexWarning(knowledgeDir);
        sendJson(res, 200, { ...item, ...indexWarning });
        return;
      }

      if (pathname.startsWith("/api/")) {
        sendJson(res, 404, { error: "not_found" });
        return;
      }
      serveStatic(req, res, publicDir, pathname);
    } catch (err) {
      const status = err.status || (err instanceof SyntaxError ? 400 : 500);
      sendJson(res, status, { error: err.message || "internal error" });
    }
  });
}

function main() {
  const options = parseArgs(process.argv);
  ensureKnowledgeLayout(options.knowledgeDir);
  if (options.check) {
    const state = loadState(options.knowledgeDir);
    console.log(JSON.stringify({
      ok: true,
      knowledge_dir: options.knowledgeDir,
      pending: state.stats.pending_count,
      canonical: state.stats.canonical_count,
      duplicates: state.stats.duplicate_count,
      rejected: state.stats.rejected_count,
    }, null, 2));
    return;
  }
  const server = makeServer(options);
  server.listen(options.port, options.host, () => {
    console.log(`Review UI: http://${options.host}:${options.port}`);
    console.log(`Knowledge dir: ${options.knowledgeDir}`);
  });
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}
