import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set([".git", "dist", "node_modules"]);

async function modules(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await modules(path));
    else if (extname(entry.name) === ".mjs") output.push(path);
  }
  return output;
}

export async function lint(projectRoot = root) {
  for (const path of await modules(projectRoot)) {
    const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await lint();
  console.log("syntax lint passed");
}
