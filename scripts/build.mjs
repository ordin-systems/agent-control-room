import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function sourceFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) output.push(...await sourceFiles(join(directory, entry.name), relative));
    else output.push(relative);
  }
  return output;
}

export async function build(projectRoot = root) {
  const source = join(projectRoot, "src");
  const destination = join(projectRoot, "dist");
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true });
  const files = await sourceFiles(source);
  const manifest = { files: {}, format: "esm", version: 1 };
  for (const file of files) {
    const bytes = await readFile(join(source, file));
    manifest.files[file] = createHash("sha256").update(bytes).digest("hex");
  }
  await writeFile(join(destination, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = await build();
  console.log(`built ${Object.keys(manifest.files).length} source modules`);
}
