import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApprovalStore,
  AuthorityReceiptAuthenticator,
  AuthorityBoundary,
  NodeFileStorage,
  ReceiptLedger,
  RecoveryManager,
  SafeCanaryExecutor,
  createPolicyBundle,
} from "../src/index.mjs";

export const T0 = Date.parse("2026-08-09T12:00:00.000Z");
export const instant = (offset = 0) => new Date(T0 + offset).toISOString();
export const digest = (character = "a") => character.repeat(64);

export function makeRuntime({ idGenerator = null, start = instant(0) } = {}) {
  const time = { now: start };
  let counter = 0;
  const deps = {
    clock: () => time.now,
    idGenerator: idGenerator ?? ((kind) => `${kind}-${++counter}`),
  };
  return { deps, time };
}

export function rawPolicy(overrides = {}) {
  const profile = {
    active: true,
    agentId: "agent-A",
    allowedActions: ["FIXED_SAFE_CANARY"],
    allowedResources: ["local:reference"],
    deniedActions: ["delete_records"],
    deniedResources: [],
    envelopeVersion: "v1",
    evidenceMaxAgeMs: 300_000,
    evidenceObservedAt: instant(-1_000),
    expiresAt: instant(600_000),
    id: "profile-A",
    revokedAt: null,
    stepUpRisks: [],
    version: "v1",
    ...(overrides.profile ?? {}),
  };
  const envelope = {
    actions: ["FIXED_SAFE_CANARY"],
    active: true,
    agentId: "agent-A",
    authorizedApprovers: [{ approverId: "approver-A", capabilities: ["acr.approve_handoff"] }],
    evidenceMaxAgeMs: 300_000,
    evidenceObservedAt: instant(-1_000),
    expiresAt: instant(600_000),
    id: "envelope-A",
    profileId: "profile-A",
    profileVersion: "v1",
    resources: ["local:reference"],
    revokedAt: null,
    version: "v1",
    ...(overrides.envelope ?? {}),
  };
  return {
    agents: overrides.agents ?? ["agent-A"],
    envelopes: overrides.envelopes ?? [envelope],
    profiles: overrides.profiles ?? [profile],
  };
}

export function makePolicy(overrides = {}) {
  return createPolicyBundle(rawPolicy(overrides));
}

export function makeIntent({
  action = "FIXED_SAFE_CANARY",
  agentId = "agent-A",
  contradictions = [],
  observedAt = instant(-500),
  resource = "local:reference",
  risk = "low",
  stateDigest = digest("b"),
} = {}) {
  return {
    action,
    agentId,
    evidence: { contradictions, observedAt, stateDigest },
    resource,
    risk,
  };
}

export async function temporaryRoot(prefix = "acr-test-") {
  const root = await mkdtemp(join(tmpdir(), prefix));
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function makeSystem({ policy = makePolicy(), runtime = makeRuntime(), executor = null } = {}) {
  const temporary = await temporaryRoot();
  const approvalStore = new ApprovalStore(runtime.deps);
  const ledger = new ReceiptLedger(new NodeFileStorage(temporary.root), runtime.deps);
  const chosenExecutor = executor ?? new SafeCanaryExecutor({
    ...runtime.deps,
    artifactRoot: join(temporary.root, "canary-artifacts"),
  });
  const receiptAuthenticator = new AuthorityReceiptAuthenticator("synthetic-public-reference-authority-key-v1");
  const boundary = new AuthorityBoundary({
    approvalStore,
    artifactDigest: digest("a"),
    deps: runtime.deps,
    executor: chosenExecutor,
    ledger,
    policy,
    receiptAuthenticator,
  });
  const recovery = new RecoveryManager({
    approvalStore,
    deps: runtime.deps,
    executor: chosenExecutor,
    ledger,
    receiptAuthenticator,
  });
  return {
    approvalStore,
    boundary,
    cleanup: temporary.cleanup,
    executor: chosenExecutor,
    ledger,
    policy,
    receiptAuthenticator,
    recovery,
    root: temporary.root,
    runtime,
  };
}

export function createApproval(approvalStore, request, {
  approverId = "approver-A",
  capability = "acr.approve_handoff",
  expiresAt = instant(60_000),
  status = "approved",
} = {}) {
  return approvalStore.createApproval(request.requestId, {
    approverId,
    capability,
    expiresAt,
    status,
  });
}

export function canaryPass(canary, observedAt = canary.executedAt) {
  return {
    approvalId: canary.approvalId,
    artifactDigest: canary.artifactDigest,
    authorityReceiptDigest: canary.authorityReceiptDigest,
    authorityReceiptId: canary.authorityReceiptId,
    caseId: canary.caseId,
    executedAt: canary.executedAt,
    observedAt,
    resultDigest: canary.resultDigest,
    stateDigest: canary.stateDigest,
    status: "PASS",
    tokenId: canary.tokenId,
  };
}
