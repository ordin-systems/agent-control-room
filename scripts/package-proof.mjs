import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function packageProof(projectRoot = root) {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const report = JSON.parse(result.stdout)[0];
  const names = report.files.map(({ path }) => path);
  if (!names.includes("dist/index.mjs") || !names.includes("dist/build-manifest.json")) {
    throw new Error("Package is missing production build artifacts");
  }
  if (names.some((name) => name.startsWith("test/") || name.startsWith("scripts/") || name.startsWith(".github/"))) {
    throw new Error("Package includes development-only files");
  }
  return { fileCount: names.length, filename: report.filename, integrity: report.integrity };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = packageProof();
  console.log(`package proof passed (${result.fileCount} files; ${result.filename})`);
}
