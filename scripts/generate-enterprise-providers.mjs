#!/usr/bin/env node
/**
 * Writes src/data/enterprise-providers.json from the OpenCode console provider
 * snapshot (enterprise + provider.opencode + provider.opencode-go).
 * Run: node scripts/generate-enterprise-providers.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "scripts", "enterprise-providers.source.json");
const outDir = path.join(root, "src", "data");
const outFile = path.join(outDir, "enterprise-providers.json");

if (!fs.existsSync(source)) {
  console.error(`Missing ${source} — paste the OpenCode console provider JSON there.`);
  process.exit(1);
}

const raw = fs.readFileSync(source, "utf8");
const doc = JSON.parse(raw);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote ${outFile} (${fs.statSync(outFile).size} bytes)`);
