import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npm", ["run", "format:check"]);
run("npm", ["run", "lint"]);
run("npm", ["run", "publication:scan"]);
for (let number = 1; number <= 19; number += 1) {
  run("npm", ["run", `check:${String(number).padStart(2, "0")}`]);
}
run("npm", ["run", "build"]);
run("npm", ["run", "package:check"]);
run("npm", ["audit", "--audit-level=high"]);
run("git", ["diff", "--check"]);
console.log("aggregate verification passed: 19/19 named checks");
