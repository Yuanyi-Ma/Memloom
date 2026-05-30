#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const out = {
    knowledgeDir: path.resolve(process.cwd(), "knowledge"),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--knowledge-dir") out.knowledgeDir = path.resolve(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  node build_agent_index.js --knowledge-dir /path/to/knowledge`);
}

function readText(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath, fallback) {
  const text = readText(filePath, null);
  if (text === null || text.trim() === "") return JSON.parse(JSON.stringify(fallback));
  return JSON.parse(text);
}

function writeTextAtomic(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(tmp, text, "utf8");
  try {
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // Ignore cleanup errors; the original write failure is more useful.
    }
    throw err;
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

function loadDomains(knowledgeDir, items) {
  const whitelist = parseWhitelist(readText(path.join(knowledgeDir, "whitelist.yaml"), ""));
  const fromItems = items.map((item) => item.domain || "_unknown");
  const domains = [...new Set([...whitelist, ...fromItems, "_unknown"])];
  return domains.filter((domain) => /^[A-Za-z0-9_-]+$/.test(domain)).sort();
}

function loadCanonicalItems(knowledgeDir) {
  const dir = path.join(knowledgeDir, "canonical");
  if (!fs.existsSync(dir)) return [];
  const items = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    const filePath = path.join(dir, name);
    const data = readJson(filePath, {});
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    for (const [id, body] of Object.entries(data)) {
      if (!body || typeof body !== "object" || Array.isArray(body)) continue;
      items.push({
        id: String(body.id || id),
        title: String(body.title || ""),
        form: String(body.form || ""),
        domain: String(body.domain || path.basename(name, ".json") || "_unknown"),
        abstract: String(body.abstract || ""),
      });
    }
  }
  items.sort((a, b) => {
    const domain = a.domain.localeCompare(b.domain);
    if (domain !== 0) return domain;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
  return items;
}

function escapeMdInline(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function normalizeParagraph(value) {
  return String(value || "").replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
}

function renderGlobalIndex(items, domains, builtAt) {
  const byDomain = groupByDomain(items);
  const lines = [
    "# Agent Knowledge Index",
    "",
    `Generated: ${builtAt}`,
    "",
    "This file is derived from `canonical/*.json`. Canonical JSON remains the source of truth.",
    "",
    "Use this as a short directory. Read `agent_views/<domain>.md` for domain-level summaries before using an item.",
    "",
    "## Domains",
    "",
    "| domain | count | view |",
    "|---|---:|---|",
  ];
  for (const domain of domains) {
    const count = (byDomain.get(domain) || []).length;
    lines.push(`| ${escapeMdInline(domain)} | ${count} | agent_views/${domain}.md |`);
  }
  lines.push("", "## Canonical Directory", "");
  for (const domain of domains) {
    const entries = byDomain.get(domain) || [];
    if (!entries.length) continue;
    lines.push(`### ${domain}`, "");
    for (const item of entries) {
      lines.push(`- ${item.id} — ${item.title}`);
    }
    lines.push("");
  }
  if (!items.length) lines.push("_No canonical knowledge yet._", "");
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderDomainView(domain, entries, builtAt) {
  const lines = [
    `# ${domain} Agent View`,
    "",
    `Generated: ${builtAt}`,
    "",
    "Derived from `canonical/*.json`. Fields included: `id / title / form / abstract`.",
    "",
  ];
  if (!entries.length) {
    lines.push("_No canonical knowledge in this domain yet._", "");
    return `${lines.join("\n").trimEnd()}\n`;
  }
  lines.push("| id | title | form | abstract |", "|---|---|---|---|");
  for (const item of entries) {
    lines.push(
      `| ${escapeMdInline(item.id)} | ${escapeMdInline(item.title)} | ${escapeMdInline(item.form)} | ${escapeMdInline(normalizeParagraph(item.abstract))} |`,
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function groupByDomain(items) {
  const byDomain = new Map();
  for (const item of items) {
    const domain = item.domain || "_unknown";
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain).push(item);
  }
  return byDomain;
}

function removeStaleViews(viewsDir, keepNames) {
  if (!fs.existsSync(viewsDir)) return;
  for (const name of fs.readdirSync(viewsDir)) {
    if (!name.endsWith(".md")) continue;
    if (keepNames.has(name)) continue;
    fs.unlinkSync(path.join(viewsDir, name));
  }
}

function rebuildAgentIndex(knowledgeDir) {
  const resolved = path.resolve(knowledgeDir);
  const items = loadCanonicalItems(resolved);
  const domains = loadDomains(resolved, items);
  const byDomain = groupByDomain(items);
  const builtAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const viewsDir = path.join(resolved, "agent_views");
  fs.mkdirSync(viewsDir, { recursive: true });

  const keepNames = new Set(domains.map((domain) => `${domain}.md`));
  for (const domain of domains) {
    const entries = byDomain.get(domain) || [];
    writeTextAtomic(path.join(viewsDir, `${domain}.md`), renderDomainView(domain, entries, builtAt));
  }
  removeStaleViews(viewsDir, keepNames);
  writeTextAtomic(path.join(resolved, "agent_index.md"), renderGlobalIndex(items, domains, builtAt));

  return {
    ok: true,
    rebuilt_at: builtAt,
    canonical_count: items.length,
    domains,
  };
}

function main() {
  const options = parseArgs(process.argv);
  const result = rebuildAgentIndex(options.knowledgeDir);
  console.log(JSON.stringify({ knowledge_dir: options.knowledgeDir, ...result }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { rebuildAgentIndex };
