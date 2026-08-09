import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set([".git", "dist", "node_modules", "coverage"]);

async function files(directory, findings) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      findings.push(`${relative(root, path)}: symbolic link`);
    } else if (entry.isDirectory()) {
      output.push(...await files(path, findings));
    } else if (entry.isFile()) {
      output.push(path);
    } else {
      findings.push(`${relative(root, path)}: special file`);
    }
  }
  return output;
}

export async function scanRepository(projectRoot = root) {
  const findings = [];
  const inventory = await files(projectRoot, findings);
  const absoluteHome = new RegExp(["/", "Users", "/"].join(""), "i");
  const credential = /(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|api[_-]?key\s*[:=]\s*[A-Za-z0-9_-]{12,})/i;
  for (const path of inventory) {
    const data = await readFile(path);
    const name = relative(projectRoot, path).replaceAll("\\", "/");
    if (data.includes(0)) {
      findings.push(`${name}: binary or NUL-bearing file`);
      continue;
    }
    const content = data.toString("utf8");
    if (content.includes("\uFFFD")) findings.push(`${name}: invalid UTF-8 content`);
    if (absoluteHome.test(content)) findings.push(`${name}: absolute personal path`);
    if (credential.test(content)) findings.push(`${name}: credential-like material`);
    if (name.startsWith("src/")) {
      if (/node:child_process/.test(content)) findings.push(`${name}: process execution import`);
      if (/\beval\s*\(|new\s+Function\b|\.exec\s*\(|\.spawn\s*\(/.test(content)) findings.push(`${name}: generic execution primitive`);
      if (/\bfetch\s*\(|\bWebSocket\b|\bcreateServer\s*\(/.test(content)) findings.push(`${name}: network or listener primitive`);
    }
  }
  if (findings.length) throw new Error(findings.join("\n"));
  return { filesScanned: inventory.length, findings: [] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await scanRepository();
  console.log(`publication scan passed (${result.filesScanned} files)`);
}
