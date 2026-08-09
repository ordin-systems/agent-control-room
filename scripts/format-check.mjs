import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set([".git", "dist", "node_modules", "coverage"]);
const textExtensions = new Set([".json", ".md", ".mjs", ".yaml", ".yml"]);

async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path));
    else if (textExtensions.has(extname(entry.name))) output.push(path);
  }
  return output;
}

export async function checkFormatting(projectRoot = root) {
  const errors = [];
  for (const path of await files(projectRoot)) {
    const content = await readFile(path, "utf8");
    const name = relative(projectRoot, path);
    if (!content.endsWith("\n")) errors.push(`${name}: missing final newline`);
    content.split("\n").forEach((line, index) => {
      if (/[ \t]+$/.test(line)) errors.push(`${name}:${index + 1}: trailing whitespace`);
    });
    if (extname(path) === ".json") {
      const parsed = JSON.parse(content);
      if (`${JSON.stringify(parsed, null, 2)}\n` !== content) errors.push(`${name}: JSON is not canonical pretty format`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await checkFormatting();
  console.log("format check passed");
}
