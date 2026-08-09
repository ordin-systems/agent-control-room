import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { canonicalJson, deepFreeze, sha256Canonical } from "./canonical-json.mjs";
import { fail } from "./errors.mjs";
import { exactObject, isoInstant, nonEmptyString, requireDigest } from "./validation.mjs";

const FIXED_MARKER = "ACR_FIXED_SAFE_CANARY_OK";
const RESULT_KEYS = [
  "adapter", "artifactDigest", "canaryId", "commandDigest", "completedAt", "marker",
  "proofArtifactDigest", "proofArtifactName", "stateDigest", "status",
];

function commandFor({ artifactDigest, authorityReceiptId, stateDigest }) {
  requireDigest(artifactDigest, "artifactDigest");
  requireDigest(stateDigest, "stateDigest");
  nonEmptyString(authorityReceiptId, "authorityReceiptId");
  return deepFreeze({
    action: "FIXED_SAFE_CANARY",
    adapter: "fixed-safe-canary-v1",
    artifactDigest,
    authorityReceiptId,
    marker: FIXED_MARKER,
    resource: "local:reference",
    stateDigest,
  });
}

function proofContent(result) {
  return {
    adapter: result.adapter,
    canaryId: result.canaryId,
    commandDigest: result.commandDigest,
    marker: result.marker,
  };
}

export class SafeCanaryExecutor {
  constructor({ artifactRoot, clock, idGenerator }) {
    if (typeof artifactRoot !== "string" || artifactRoot.length === 0 || artifactRoot.length > 4096
        || artifactRoot.includes("\0") || !isAbsolute(artifactRoot)) {
      fail("CANARY_ARTIFACT_ROOT_INVALID", "artifactRoot must be a bounded absolute path");
    }
    if (typeof clock !== "function" || typeof idGenerator !== "function") {
      fail("MISSING_DEPENDENCY", "executor requires clock and idGenerator");
    }
    mkdirSync(artifactRoot, { recursive: true });
    if (lstatSync(artifactRoot).isSymbolicLink()) fail("CANARY_ARTIFACT_ROOT_INVALID", "artifactRoot cannot be a symlink");
    this.artifactRoot = artifactRoot;
    this.clock = clock;
    this.idGenerator = idGenerator;
    this.calls = [];
  }

  executeFixedCanary(command) {
    exactObject(command, ["action", "adapter", "artifactDigest", "authorityReceiptId", "marker", "resource", "stateDigest"], "canary command");
    if (canonicalJson(command) !== canonicalJson(commandFor(command))) {
      fail("UNSUPPORTED_EXECUTOR_COMMAND", "executor accepts only the fixed safe canary command");
    }
    this.calls.push(structuredClone(command));
    const canaryId = nonEmptyString(this.idGenerator("canary"), "canary id");
    const result = {
      adapter: command.adapter,
      artifactDigest: command.artifactDigest,
      canaryId,
      commandDigest: sha256Canonical(command),
      completedAt: isoInstant(this.clock(), "canary completion clock"),
      marker: command.marker,
      proofArtifactDigest: "",
      proofArtifactName: `${canaryId}.marker.json`,
      stateDigest: command.stateDigest,
      status: "PASS",
    };
    result.proofArtifactDigest = sha256Canonical(proofContent(result));
    const target = join(this.artifactRoot, result.proofArtifactName);
    try {
      writeFileSync(target, canonicalJson(proofContent(result)), { encoding: "utf8", flag: "wx" });
    } catch {
      fail("CANARY_ARTIFACT_WRITE_FAILED", "fixed canary proof artifact could not be created uniquely");
    }
    if (!this.verifyFixedCanary(result)) fail("CANARY_ARTIFACT_INVALID", "fixed canary proof artifact failed readback");
    return deepFreeze(result);
  }

  verifyFixedCanary(result) {
    try {
      if (result.proofArtifactName !== `${result.canaryId}.marker.json`) return false;
      const target = join(this.artifactRoot, result.proofArtifactName);
      if (lstatSync(target).isSymbolicLink()) return false;
      const expected = canonicalJson(proofContent(result));
      const actual = readFileSync(target, "utf8");
      return actual === expected && sha256Canonical(proofContent(result)) === result.proofArtifactDigest;
    } catch {
      return false;
    }
  }
}

export function handoffSafeCanary(executor, context) {
  if (!(executor instanceof SafeCanaryExecutor) || executor.constructor !== SafeCanaryExecutor) {
    fail("INVALID_EXECUTOR", "Fixed canary executor and verifier are required");
  }
  const command = commandFor(context);
  const result = executor.executeFixedCanary(command);
  exactObject(result, RESULT_KEYS, "canary result");
  for (const key of ["adapter", "canaryId", "marker", "proofArtifactName", "status"]) {
    nonEmptyString(result[key], `canary result.${key}`);
  }
  isoInstant(result.completedAt, "canary result.completedAt");
  for (const key of ["artifactDigest", "commandDigest", "proofArtifactDigest", "stateDigest"]) {
    requireDigest(result[key], `canary result.${key}`);
  }
  if (result.status !== "PASS" || result.adapter !== command.adapter || result.marker !== FIXED_MARKER) {
    fail("CANARY_EXECUTION_FAILED", "fixed canary did not return a passing bound result");
  }
  if (result.artifactDigest !== command.artifactDigest || result.stateDigest !== command.stateDigest) {
    fail("CANARY_ARTIFACT_MISMATCH", "fixed canary result is not bound to expected artifact and state");
  }
  if (result.commandDigest !== sha256Canonical(command)
      || result.proofArtifactName !== `${result.canaryId}.marker.json`
      || result.proofArtifactDigest !== sha256Canonical(proofContent(result))) {
    fail("CANARY_DIGEST_MISMATCH", "fixed canary proof digests are invalid");
  }
  if (!executor.verifyFixedCanary(result, command)) {
    fail("CANARY_ARTIFACT_INVALID", "fixed canary proof artifact is absent or invalid");
  }
  return deepFreeze(structuredClone(result));
}
