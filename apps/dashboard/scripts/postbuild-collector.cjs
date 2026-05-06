#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const candidateClientPaths = [
  path.resolve(
    __dirname,
    "..",
    "dist-collector",
    "server",
    "db",
    "generated",
    "prisma",
    "client.js",
  ),
  path.resolve(
    __dirname,
    "..",
    "dist-collector",
    "generated",
    "prisma",
    "client.js",
  ),
];

const clientPath = candidateClientPaths.find((candidate) => fs.existsSync(candidate));
if (!clientPath) {
  process.exit(0);
}

const source = fs.readFileSync(clientPath, "utf8");
const marker = "fileURLToPath)(import.meta.url)";
if (!source.includes(marker)) {
  process.exit(0);
}

const patched = source.replace(
  /globalThis\['__dirname'\]\s*=\s*path\.dirname\(\(0,\s*node_url_1\.fileURLToPath\)\(import\.meta\.url\)\);/,
  "globalThis['__dirname'] = __dirname;",
);

if (patched === source) {
  throw new Error("Failed to patch Prisma generated client for collector runtime");
}

fs.writeFileSync(clientPath, patched, "utf8");
