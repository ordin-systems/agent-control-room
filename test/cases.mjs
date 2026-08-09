import assert from "node:assert/strict";
import { readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ApprovalStore,
  GovernanceWorkflow,
  NodeFileStorage,
  ReceiptLedger,
  SafeCanaryExecutor,
  canonicalJson,
  createPolicyBundle,
  evaluateAuthority,
  normalizeExecutionIntent,
  sha256Canonical,
} from "../src/index.mjs";
import { build } from "../scripts/build.mjs";
import { packageProof } from "../scripts/package-proof.mjs";
import { scanRepository } from "../scripts/publication-scan.mjs";
import {
  canaryPass,
  createApproval,
  digest,
  instant,
  makeIntent,
  makePolicy,
  makeRuntime,
  makeSystem,
  rawPolicy,
  temporaryRoot,
} from "./helpers.mjs";

function evaluateWith({ profile = {}, envelope = {}, intent = {} } = {}) {
  const runtime = makeRuntime();
  return evaluateAuthority(
    normalizeExecutionIntent(makeIntent(intent), runtime.deps),
    makePolicy({ profile, envelope }),
    runtime.deps,
  );
}

async function withSystem(options, callback) {
  const system = await makeSystem(options);
  try { return await callback(system); } finally { await system.cleanup(); }
}

export const CASES = {
  "01": async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
    const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url)));
    assert.equal(packageJson.private, true);
    assert.equal(packageJson.license, "UNLICENSED");
    assert.equal(packageJson.packageManager, "npm@10.9.8");
    assert.equal(packageJson.engines.node, "^20.19.0 || >=22.12.0");
    for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const version of Object.values(packageJson[section] ?? {})) {
        assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
      }
    }
    assert.equal(lock.lockfileVersion, 3);
    assert.equal(lock.packages[""].license, "UNLICENSED");
    const catalogMap = JSON.parse(await readFile(new URL("../docs/adversarial-catalog-map.json", import.meta.url)));
    assert.equal(catalogMap.catalogSha256, "4ea30d2a4c55b05f00fadefa4f0637d8212ed11d2a9f493b69a5df192c7b9f6a");
    assert.equal(catalogMap.catalogCaseCount, 95);
    assert.equal(catalogMap.cases.length, 95);
    assert.equal(new Set(catalogMap.cases.map(({ id }) => id)).size, 95);
    assert.equal(catalogMap.namedVerifierCount, 19);
    assert.equal(catalogMap.allCatalogCasesMapped, true);
    for (const item of catalogMap.cases) {
      assert.match(item.status, /^PASS/);
      assert.ok(item.checks.length > 0);
      for (const check of item.checks) assert.match(check, /^(0[1-9]|1[0-9])$/);
    }
  },

  "02": () => {
    const { deps } = makeRuntime();
    assert.throws(() => normalizeExecutionIntent({ ...makeIntent(), decision: "ALLOW" }, deps), { code: "UNKNOWN_FIELD" });
    assert.throws(() => normalizeExecutionIntent({ ...makeIntent(), evidence: { ...makeIntent().evidence, extra: true } }, deps), { code: "UNKNOWN_FIELD" });
    assert.throws(() => normalizeExecutionIntent({ ...makeIntent(), action: undefined }, deps), { code: "MALFORMED_FIELD" });
    for (const agentId of ["", "../agent", "agent\nA", "x".repeat(129), 42]) {
      assert.throws(() => normalizeExecutionIntent(makeIntent({ agentId }), deps));
    }
    for (const values of [
      { action: "arbitrary_command" },
      { resource: "remote:production" },
      { risk: "unknown" },
    ]) assert.throws(() => normalizeExecutionIntent(makeIntent(values), deps), { code: "UNSUPPORTED_VALUE" });
    assert.throws(() => createPolicyBundle({ ...rawPolicy(), profiles: [{ ...rawPolicy().profiles[0], extra: true }] }), { code: "UNKNOWN_FIELD" });
    const inherited = Object.create({ callerAuthority: true });
    Object.assign(inherited, makeIntent());
    assert.throws(() => normalizeExecutionIntent(inherited, deps), { code: "MALFORMED_FIELD" });
    const accessor = makeIntent();
    Object.defineProperty(accessor, "agentId", { enumerable: true, get() { return "agent-A"; } });
    assert.throws(() => normalizeExecutionIntent(accessor, deps), { code: "MALFORMED_FIELD" });
    for (const mutation of [
      (value) => value.agents.push("agent-A"),
      (value) => value.profiles.push({ ...value.profiles[0] }),
      (value) => value.envelopes.push({ ...value.envelopes[0] }),
      (value) => value.envelopes[0].authorizedApprovers.push({ ...value.envelopes[0].authorizedApprovers[0] }),
    ]) {
      const value = rawPolicy(); mutation(value);
      assert.throws(() => createPolicyBundle(value));
    }
  },

  "03": async () => {
    const first = makeRuntime();
    const second = makeRuntime();
    const raw = makeIntent({ contradictions: ["zeta", "alpha", "zeta"] });
    const a = normalizeExecutionIntent(raw, first.deps);
    const b = normalizeExecutionIntent({ risk: raw.risk, resource: raw.resource, evidence: raw.evidence, agentId: raw.agentId, action: raw.action }, second.deps);
    assert.equal(canonicalJson(a), canonicalJson(b));
    assert.equal(normalizeExecutionIntent(a, first.deps), a);
    assert.throws(() => normalizeExecutionIntent(structuredClone(a), first.deps), { code: "UNKNOWN_FIELD" });
    assert.deepEqual(a.evidence.contradictions, ["alpha", "zeta"]);
    assert.ok(Object.isFrozen(a));
    await withSystem({ runtime: makeRuntime() }, async (firstSystem) => {
      await withSystem({ runtime: makeRuntime() }, async (secondSystem) => {
        const firstResult = await firstSystem.boundary.propose(makeIntent());
        const secondResult = await secondSystem.boundary.propose(makeIntent());
        assert.equal(firstResult.decisionReceipt.digest, secondResult.decisionReceipt.digest);
        assert.equal(firstResult.handoffReceipt.digest, secondResult.handoffReceipt.digest);
        assert.equal(
          canonicalJson(await firstSystem.ledger.get(firstResult.handoffReceipt.receiptId)),
          canonicalJson(await secondSystem.ledger.get(secondResult.handoffReceipt.receiptId)),
        );
      });
    });
  },

  "04": () => {
    assert.ok(evaluateWith({ profile: { evidenceObservedAt: instant(1) } }).reasonCodes.includes("PROFILE_EVIDENCE_FROM_FUTURE"));
    assert.ok(evaluateWith({ profile: { active: false } }).reasonCodes.includes("PROFILE_INACTIVE"));
    assert.ok(evaluateWith({ profile: { expiresAt: instant(0) } }).reasonCodes.includes("PROFILE_EXPIRED"));
    assert.ok(evaluateWith({ profile: { revokedAt: instant(-1) } }).reasonCodes.includes("PROFILE_REVOKED"));
    assert.ok(evaluateWith({ profile: { evidenceObservedAt: instant(-400_000) } }).reasonCodes.includes("PROFILE_EVIDENCE_STALE"));
    const denied = evaluateWith({ profile: { deniedActions: ["FIXED_SAFE_CANARY", "delete_records"] } });
    assert.equal(denied.outcome, "DENY");
    assert.ok(denied.reasonCodes.includes("PROFILE_ACTION_DENIED"));
    const noAgent = rawPolicy(); noAgent.agents = [];
    assert.equal(evaluateAuthority(normalizeExecutionIntent(makeIntent(), makeRuntime().deps), createPolicyBundle(noAgent), makeRuntime().deps).outcome, "DENY");
    const conflict = rawPolicy(); conflict.profiles.push({ ...conflict.profiles[0], id: "profile-B" });
    assert.ok(evaluateAuthority(normalizeExecutionIntent(makeIntent(), makeRuntime().deps), createPolicyBundle(conflict), makeRuntime().deps).reasonCodes.includes("PROFILE_SELECTION_CONTRADICTION"));
    assert.equal(evaluateWith({ profile: { expiresAt: instant(1) } }).outcome, "ALLOW");
    assert.equal(evaluateWith({ profile: { allowedResources: [] } }).outcome, "DENY");
  },

  "05": () => {
    assert.ok(evaluateWith({ envelope: { evidenceObservedAt: instant(1) } }).reasonCodes.includes("ENVELOPE_EVIDENCE_FROM_FUTURE"));
    assert.ok(evaluateWith({ envelope: { active: false } }).reasonCodes.includes("ENVELOPE_INACTIVE"));
    assert.ok(evaluateWith({ envelope: { expiresAt: instant(0) } }).reasonCodes.includes("ENVELOPE_EXPIRED"));
    assert.ok(evaluateWith({ envelope: { revokedAt: instant(-1) } }).reasonCodes.includes("ENVELOPE_REVOKED"));
    assert.ok(evaluateWith({ envelope: { evidenceObservedAt: instant(-400_000) } }).reasonCodes.includes("ENVELOPE_EVIDENCE_STALE"));
    assert.ok(evaluateWith({ envelope: { profileVersion: "v0" } }).reasonCodes.includes("PROFILE_VERSION_MISMATCH"));
    assert.ok(evaluateWith({ envelope: { version: "v2" } }).reasonCodes.includes("ENVELOPE_VERSION_MISMATCH"));
    const missing = rawPolicy(); missing.envelopes = [];
    assert.equal(evaluateAuthority(normalizeExecutionIntent(makeIntent(), makeRuntime().deps), createPolicyBundle(missing), makeRuntime().deps).outcome, "DENY");
    const conflict = rawPolicy(); conflict.envelopes.push({ ...conflict.envelopes[0], id: "envelope-B" });
    assert.ok(evaluateAuthority(normalizeExecutionIntent(makeIntent(), makeRuntime().deps), createPolicyBundle(conflict), makeRuntime().deps).reasonCodes.includes("ENVELOPE_SELECTION_CONTRADICTION"));
    assert.equal(evaluateWith({ envelope: { resources: [] } }).outcome, "DENY");
  },

  "06": () => withSystem({}, async (system) => {
    const result = await system.boundary.propose(makeIntent());
    assert.equal(result.decision.outcome, "ALLOW");
    assert.equal(result.decision.profileId, "profile-A");
    assert.equal(result.decision.envelopeId, "envelope-A");
    assert.equal(system.executor.calls.length, 1);
    const handoff = await system.ledger.get(result.handoffReceipt.receiptId);
    assert.equal(handoff.payload.handoff.adapter, "fixed-safe-canary-v1");
    assert.equal(handoff.payload.handoff.result.status, "PASS");
  }),

  "07": () => withSystem({}, async (system) => {
    const result = await system.boundary.propose(makeIntent({ action: "delete_records" }));
    assert.equal(result.decision.outcome, "DENY");
    assert.ok(result.decision.reasonCodes.includes("PROFILE_ACTION_DENIED"));
    assert.ok(result.decision.reasonCodes.includes("PROTECTED_ACTION_DENIED"));
    assert.equal(result.handoffReceipt, null);
  }),

  "08": () => withSystem({ policy: makePolicy({ profile: { stepUpRisks: ["moderate"] } }) }, async (system) => {
    const result = await system.boundary.propose(makeIntent({ risk: "moderate" }));
    assert.equal(result.decision.outcome, "STEP_UP");
    assert.equal(result.approvalRequest.profileId, result.decision.profileId);
    assert.equal(result.approvalRequest.envelopeId, result.decision.envelopeId);
    assert.equal(result.handoffReceipt, null);
    assert.equal(system.executor.calls.length, 0);
  }),

  "09": async () => {
    const runtime = makeRuntime();
    const policy = makePolicy({ profile: { stepUpRisks: ["moderate"] } });
    const decision = evaluateAuthority(normalizeExecutionIntent(makeIntent({ risk: "moderate" }), runtime.deps), policy, runtime.deps);
    const store = new ApprovalStore(runtime.deps);
    const request = store.createRequest(decision, policy.envelopes[0]);
    const first = createApproval(store, request);
    const second = createApproval(store, request);
    const mutations = {
      action: "delete_records",
      agentId: "agent-X",
      decisionDigest: digest("d"),
      decisionId: "decision-X",
      envelopeId: "envelope-X",
      envelopeVersion: "v2",
      evidenceDigest: digest("e"),
      profileId: "profile-X",
      profileVersion: "v2",
      requestId: "request-X",
      resource: "local:other",
    };
    for (const [field, value] of Object.entries(mutations)) {
      assert.throws(
        () => store.validate(request.requestId, { ...first, [field]: value }),
        { code: field === "requestId" ? "APPROVAL_REDIRECT" : "APPROVAL_BINDING_MISMATCH" },
      );
    }
    assert.throws(() => store.validate(request.requestId, { ...first, approverId: "agent-A" }), { code: "APPROVAL_SELF_INJECTION" });
    assert.throws(() => store.validate(request.requestId, { ...first, capability: "other.capability" }), { code: "APPROVAL_BINDING_MISMATCH" });
    assert.throws(() => store.validate(request.requestId, { ...first, expiresAt: instant(700_000) }), { code: "APPROVAL_EXPIRY_MISMATCH" });
    store.consume(request.requestId, first);
    assert.equal(store.isConsumed(first.approvalId, request.requestId), true);
    assert.throws(() => store.consume(request.requestId, second), { code: "APPROVAL_REQUEST_ALREADY_CONSUMED" });
    const foreignStore = new ApprovalStore({
      clock: runtime.deps.clock,
      idGenerator: (kind) => kind === "approval-request" ? request.requestId : `foreign-${kind}`,
    });
    foreignStore.createRequest(decision, policy.envelopes[0]);
    assert.throws(() => foreignStore.validate(request.requestId, first), { code: "APPROVAL_NOT_ISSUED" });

    const noCapabilityPolicy = makePolicy({
      envelope: { authorizedApprovers: [{ approverId: "approver-A", capabilities: [] }] },
      profile: { stepUpRisks: ["moderate"] },
    });
    const noCapabilityRuntime = makeRuntime();
    const noCapabilityDecision = evaluateAuthority(
      normalizeExecutionIntent(makeIntent({ risk: "moderate" }), noCapabilityRuntime.deps),
      noCapabilityPolicy,
      noCapabilityRuntime.deps,
    );
    const noCapabilityStore = new ApprovalStore(noCapabilityRuntime.deps);
    const noCapabilityRequest = noCapabilityStore.createRequest(noCapabilityDecision, noCapabilityPolicy.envelopes[0]);
    const noCapabilityApproval = createApproval(noCapabilityStore, noCapabilityRequest);
    assert.throws(
      () => noCapabilityStore.validate(noCapabilityRequest.requestId, noCapabilityApproval),
      { code: "APPROVER_UNAUTHORIZED" },
    );

    const concurrentStore = new ApprovalStore(makeRuntime().deps);
    const concurrentRequest = concurrentStore.createRequest(decision, policy.envelopes[0]);
    const concurrentApproval = createApproval(concurrentStore, concurrentRequest);
    const attempts = await Promise.allSettled([
      Promise.resolve().then(() => concurrentStore.consume(concurrentRequest.requestId, concurrentApproval)),
      Promise.resolve().then(() => concurrentStore.consume(concurrentRequest.requestId, concurrentApproval)),
    ]);
    assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((item) => item.status === "rejected").length, 1);
  },

  "10": () => withSystem({}, async (system) => {
    const result = await system.boundary.propose(makeIntent({ action: "delete_records" }));
    assert.equal(result.decision.outcome, "DENY");
    assert.equal(system.executor.calls.length, 0);
    const receipt = await system.ledger.get(result.decisionReceipt.receiptId);
    assert.equal(receipt.payload.handoffDisposition, "WITHHELD");
    const temporary = await temporaryRoot("acr-scan-");
    try {
      await writeFile(join(temporary.root, ".opaque"), ["/", "Users", "/private/material"].join(""));
      await assert.rejects(scanRepository(temporary.root), /absolute personal path/);
    } finally { await temporary.cleanup(); }
  }),

  "11": async () => {
    const variants = [
      [() => null, "APPROVAL_MISSING"],
      [(s, r) => createApproval(s, r, { status: "rejected" }), "APPROVAL_REJECTED"],
      [(s, r) => createApproval(s, r, { expiresAt: instant(0) }), "APPROVAL_EXPIRED"],
      [(s, r) => createApproval(s, r, { approverId: "approver-X" }), "APPROVER_UNAUTHORIZED"],
      [(s, r) => ({ ...createApproval(s, r), resource: "local:other" }), "APPROVAL_BINDING_MISMATCH"],
    ];
    for (const [makeApproval, code] of variants) {
      await withSystem({ policy: makePolicy({ profile: { stepUpRisks: ["moderate"] } }) }, async (system) => {
        const proposal = await system.boundary.propose(makeIntent({ risk: "moderate" }));
        const approval = makeApproval(system.approvalStore, proposal.approvalRequest);
        await assert.rejects(system.boundary.resume(proposal.approvalRequest.requestId, approval), { code });
        assert.equal(system.executor.calls.length, 0);
      });
    }
    await withSystem({ policy: makePolicy({ profile: { stepUpRisks: ["moderate"] } }) }, async (system) => {
      const proposal = await system.boundary.propose(makeIntent({ risk: "moderate" }));
      const approval = createApproval(system.approvalStore, proposal.approvalRequest);
      await system.boundary.resume(proposal.approvalRequest.requestId, approval);
      assert.equal(system.executor.calls.length, 1);
      await assert.rejects(system.boundary.resume(proposal.approvalRequest.requestId, approval), { code: "STEP_UP_NOT_PENDING" });
      assert.equal(system.executor.calls.length, 1);
    });
    const expiringRuntime = makeRuntime();
    await withSystem({
      policy: makePolicy({ envelope: { expiresAt: instant(1_000) }, profile: { stepUpRisks: ["moderate"] } }),
      runtime: expiringRuntime,
    }, async (system) => {
      const proposal = await system.boundary.propose(makeIntent({ risk: "moderate" }));
      const approval = createApproval(system.approvalStore, proposal.approvalRequest, { expiresAt: instant(500) });
      expiringRuntime.time.now = instant(1_000);
      await assert.rejects(system.boundary.resume(proposal.approvalRequest.requestId, approval), { code: "AUTHORITY_REVALIDATION_FAILED" });
      assert.equal(system.executor.calls.length, 0);
    });
  },

  "12": async () => {
    const temporary = await temporaryRoot();
    try {
      const ledger = new ReceiptLedger(new NodeFileStorage(temporary.root), makeRuntime().deps);
      const receipts = await Promise.all(Array.from({ length: 32 }, (_, index) => ledger.append({ index, type: "synthetic" })));
      assert.equal(new Set(receipts.map((item) => item.receiptId)).size, 32);
      assert.equal(Object.keys((await ledger.readIndex()).entries).length, 32);
      for (const receipt of receipts) assert.equal((await ledger.get(receipt.receiptId)).digest, receipt.digest);
      await symlink(temporary.root, join(temporary.root, "escape-link"));
      await assert.rejects(ledger.storage.exists("escape-link/outside.json"), { code: "UNSAFE_STORAGE_SYMLINK" });
    } finally { await temporary.cleanup(); }
    assert.throws(() => new NodeFileStorage("relative/path"), { code: "INVALID_STORAGE_ROOT" });

    const duplicateRoot = await temporaryRoot();
    try {
      const fixed = makeRuntime({ idGenerator: () => "receipt-collision" });
      const ledger = new ReceiptLedger(new NodeFileStorage(duplicateRoot.root), fixed.deps);
      await ledger.append({ sequence: 1, type: "synthetic" });
      await assert.rejects(ledger.append({ sequence: 2, type: "synthetic" }), { code: "DUPLICATE_RECEIPT_ID" });
      assert.equal(Object.keys((await ledger.readIndex()).entries).length, 1);
    } finally { await duplicateRoot.cleanup(); }

    const sharedRoot = await temporaryRoot();
    try {
      const ledgerA = new ReceiptLedger(new NodeFileStorage(sharedRoot.root), makeRuntime({ idGenerator: (kind) => `a-${kind}` }).deps);
      const ledgerB = new ReceiptLedger(new NodeFileStorage(sharedRoot.root), makeRuntime({ idGenerator: (kind) => `b-${kind}` }).deps);
      const [a, b] = await Promise.all([
        ledgerA.append({ source: "a", type: "synthetic" }),
        ledgerB.append({ source: "b", type: "synthetic" }),
      ]);
      assert.deepEqual(Object.keys((await ledgerA.readIndex()).entries).sort(), [a.receiptId, b.receiptId].sort());
    } finally { await sharedRoot.cleanup(); }

    const records = new Map();
    const failingStorage = {
      exists: async (relative) => records.has(relative),
      read: async (relative) => records.get(relative),
      remove: async (relative) => { records.delete(relative); },
      writeAtomic: async (relative, content) => {
        if (relative === "ledger/index.json") throw new Error("synthetic index failure");
        records.set(relative, content);
      },
    };
    await assert.rejects(new ReceiptLedger(failingStorage, makeRuntime().deps).append({ type: "synthetic" }));
    assert.equal(records.size, 0);
  },

  "13": async () => {
    assert.throws(() => canonicalJson(new Array(1)), { code: "SPARSE_ARRAY" });
    assert.throws(() => canonicalJson(Object.create(null)), { code: "NON_PLAIN_OBJECT" });
    const temporary = await temporaryRoot();
    try {
      const ledger = new ReceiptLedger(new NodeFileStorage(temporary.root), makeRuntime().deps);
      const receipt = await ledger.append({ decision: "DENY", type: "synthetic" });
      const entry = (await ledger.readIndex()).entries[receipt.receiptId];
      const path = join(temporary.root, entry.detailPath);
      const originalDetail = await readFile(path, "utf8");
      const detail = JSON.parse(originalDetail);
      detail.content.payload.decision = "ALLOW";
      await writeFile(path, JSON.stringify(detail));
      await assert.rejects(ledger.get(receipt.receiptId), { code: "RECEIPT_TAMPERED" });
      await writeFile(path, originalDetail);
      const indexPath = join(temporary.root, "ledger/index.json");
      const index = JSON.parse(await readFile(indexPath, "utf8"));
      index.entries[receipt.receiptId].digest = digest("f");
      await writeFile(indexPath, JSON.stringify(index));
      await assert.rejects(ledger.get(receipt.receiptId), { code: "LEDGER_DIGEST_MISMATCH" });
    } finally { await temporary.cleanup(); }
  },

  "14": () => withSystem({}, async (system) => {
    const denied = await system.boundary.propose(makeIntent({ action: "delete_records" }));
    const recoveryCase = await system.recovery.derive(denied.decisionReceipt.receiptId, {
      artifactDigest: digest("a"), localStateDigest: digest("c"),
    });
    assert.equal(recoveryCase.sourceOutcome, "DENY");
    assert.equal(recoveryCase.profileId, denied.decision.profileId);
    assert.equal(recoveryCase.envelopeId, denied.decision.envelopeId);
    const arbitrary = await system.ledger.append({ type: "caller-authored" });
    await assert.rejects(system.recovery.derive(arbitrary.receiptId, {
      artifactDigest: digest("a"), localStateDigest: digest("c"),
    }), { code: "RECOVERY_SOURCE_UNAUTHENTICATED" });
    await assert.rejects(system.ledger.append({
      authorityProof: digest("f"),
      decision: { outcome: "DENY" },
      handoff: { attempted: true, executed: true },
      handoffDisposition: "ELIGIBLE",
      reasonCodes: ["FORGED"],
      type: "authority_decision",
    }), { code: "RECEIPT_AUTHORITY_INCOHERENT" });
    const genuinePayload = (await system.ledger.get(denied.decisionReceipt.receiptId)).payload;
    const { authorityProof: ignoredProof, ...unsignedPayload } = genuinePayload;
    assert.ok(ignoredProof);
    assert.throws(
      () => system.receiptAuthenticator.attach({
        ...structuredClone(unsignedPayload),
        intent: { ...unsignedPayload.intent, action: "FIXED_SAFE_CANARY" },
      }),
      { code: "RECEIPT_AUTHORITY_ID_MISMATCH" },
    );
    const forged = await system.ledger.append({ ...structuredClone(genuinePayload), authorityProof: digest("f") });
    await assert.rejects(system.recovery.derive(forged.receiptId, {
      artifactDigest: digest("a"), localStateDigest: digest("c"),
    }), { code: "RECOVERY_SOURCE_UNAUTHENTICATED" });
  }),

  "15": async () => {
    await withSystem({}, async (system) => {
      const result = await system.boundary.propose(makeIntent());
      const retained = await system.ledger.get(result.handoffReceipt.receiptId);
      assert.equal(system.executor.calls.length, 1);
      assert.deepEqual(Object.keys(system.executor.calls[0]).sort(), [
        "action", "adapter", "artifactDigest", "authorityReceiptId", "marker", "resource", "stateDigest",
      ]);
      assert.equal(retained.payload.handoff.result.status, "PASS");
      assert.equal(system.executor.verifyFixedCanary(retained.payload.handoff.result), true);
      assert.match(retained.payload.handoff.result.proofArtifactDigest, /^[a-f0-9]{64}$/);
    });
    const executor = {
      calls: [],
      executeFixedCanary(command) { this.calls.push(command); return { status: "PASS" }; },
      verifyFixedCanary() { return true; },
    };
    await assert.rejects(withSystem({ executor }, async () => undefined), { code: "INVALID_EXECUTOR" });
    assert.equal(executor.calls.length, 0);

    const failingRoot = await temporaryRoot("acr-failing-canary-");
    try {
      const runtime = makeRuntime();
      const originalIdGenerator = runtime.deps.idGenerator;
      runtime.deps.idGenerator = (kind) => kind === "canary" ? "canary-fixed" : originalIdGenerator(kind);
      await writeFile(join(failingRoot.root, "canary-fixed.marker.json"), "occupied");
      const fixedExecutor = new SafeCanaryExecutor({
        ...runtime.deps,
        artifactRoot: failingRoot.root,
      });
      await withSystem({ executor: fixedExecutor, runtime }, async (system) => {
        await assert.rejects(system.boundary.propose(makeIntent()), { code: "CANARY_ARTIFACT_WRITE_FAILED" });
        assert.equal(fixedExecutor.calls.length, 1);
      });
    } finally { await failingRoot.cleanup(); }
  },

  "16": async () => {
    await withSystem({
      policy: makePolicy({ profile: { allowedActions: [], deniedActions: ["FIXED_SAFE_CANARY", "delete_records"] } }),
    }, async (system) => {
      const denied = await system.boundary.propose(makeIntent());
      const recoveryCase = await system.recovery.derive(denied.decisionReceipt.receiptId, {
        artifactDigest: digest("a"), localStateDigest: digest("c"),
      });
      await assert.rejects(system.recovery.restoreLocalState(recoveryCase.caseId), { code: "RECOVERY_ORDER_VIOLATION" });
      await system.recovery.retainEvidence(recoveryCase.caseId);
      await system.recovery.confirmAuthority(recoveryCase.caseId);
      const canary = await system.recovery.runCanary(recoveryCase.caseId);
      await assert.rejects(system.recovery.recordCanaryPass(recoveryCase.caseId, {
        ...canaryPass(canary), caseId: "foreign-case",
      }), { code: "CANARY_BINDING_MISMATCH" });
      await assert.rejects(system.recovery.recordCanaryPass(recoveryCase.caseId, {
        ...canaryPass(canary), artifactDigest: digest("f"),
      }), { code: "CANARY_BINDING_MISMATCH" });
      await system.recovery.recordCanaryPass(recoveryCase.caseId, canaryPass(canary));
      const restored = await system.recovery.restoreLocalState(recoveryCase.caseId);
      assert.equal(restored.localState, "RESTORED_LOCAL_ONLY");
      assert.equal(restored.status, "RESTORED");
    });

    await withSystem({
      policy: makePolicy({ profile: { allowedActions: [], deniedActions: ["FIXED_SAFE_CANARY", "delete_records"] } }),
    }, async (system) => {
      const denied = await system.boundary.propose(makeIntent());
      const recoveryCase = await system.recovery.derive(denied.decisionReceipt.receiptId, {
        artifactDigest: digest("a"), localStateDigest: digest("c"),
      });
      await system.recovery.retainEvidence(recoveryCase.caseId);
      await system.recovery.confirmAuthority(recoveryCase.caseId);
      const canary = await system.recovery.runCanary(recoveryCase.caseId);
      await rm(join(system.executor.artifactRoot, canary.result.proofArtifactName));
      await assert.rejects(
        system.recovery.recordCanaryPass(recoveryCase.caseId, canaryPass(canary)),
        { code: "CANARY_ARTIFACT_INVALID" },
      );
    });

    await withSystem({ policy: makePolicy({ profile: { stepUpRisks: ["moderate"] } }) }, async (system) => {
      const proposal = await system.boundary.propose(makeIntent({ risk: "moderate" }));
      const recoveryCase = await system.recovery.derive(proposal.decisionReceipt.receiptId, {
        artifactDigest: digest("a"), localStateDigest: digest("c"),
      });
      await system.recovery.retainEvidence(recoveryCase.caseId);
      await assert.rejects(system.recovery.confirmAuthority(recoveryCase.caseId), { code: "RECOVERY_APPROVAL_REQUIRED" });
      const approval = createApproval(system.approvalStore, proposal.approvalRequest);
      const confirmed = await system.recovery.confirmAuthority(recoveryCase.caseId, approval);
      assert.equal(system.approvalStore.isConsumed(approval.approvalId, proposal.approvalRequest.requestId), false);
      assert.equal(confirmed.pendingApproval.approvalId, approval.approvalId);
      const canary = await system.recovery.runCanary(recoveryCase.caseId);
      assert.equal(system.approvalStore.isConsumed(approval.approvalId, proposal.approvalRequest.requestId), true);
      assert.equal(canary.approvalId, approval.approvalId);
      await system.recovery.recordCanaryPass(recoveryCase.caseId, canaryPass(canary));
      assert.equal((await system.recovery.restoreLocalState(recoveryCase.caseId)).status, "RESTORED");
      assert.equal(system.executor.calls.length, 1);
    });
  },

  "17": () => withSystem({}, async (system) => {
    const result = await system.boundary.propose(makeIntent({ action: "delete_records", risk: "destructive" }));
    assert.equal(result.decision.outcome, "DENY");
    assert.equal(system.executor.calls.length, 0);
    assert.equal(result.handoffReceipt, null);
    const retained = await system.ledger.get(result.decisionReceipt.receiptId);
    assert.equal(retained.payload.handoffDisposition, "WITHHELD");
    const recovery = await system.recovery.derive(result.decisionReceipt.receiptId, {
      artifactDigest: digest("a"), localStateDigest: digest("c"),
    });
    assert.equal(recovery.sourceDecisionId, result.decision.decisionId);
  }),

  "18": async () => {
    const workflow = new GovernanceWorkflow({
      artifactDigest: digest("a"),
      authorizedHumanIds: ["human-A"],
      authorizedReviewerIds: ["reviewer-A"],
    });
    assert.throws(() => workflow.promote({ artifactDigest: digest("a"), evidenceDigest: digest("b") }), { code: "GOVERNANCE_ORDER_VIOLATION" });
    assert.throws(() => workflow.submitAudit({ artifactDigest: digest("f"), evidenceDigest: digest("b"), evidenceIds: ["evidence-A"], reviewerId: "reviewer-A" }), { code: "GOVERNANCE_ARTIFACT_MISMATCH" });
    assert.throws(() => workflow.submitAudit({ artifactDigest: digest("a"), evidenceDigest: digest("b"), evidenceIds: ["evidence-A", "evidence-A"], reviewerId: "reviewer-A" }), { code: "DUPLICATE_VALUE" });
    assert.throws(() => workflow.submitAudit({ artifactDigest: digest("a"), evidenceDigest: digest("b"), evidenceIds: ["evidence-A"], reviewerId: "reviewer-A", promoted: true }), { code: "UNKNOWN_FIELD" });
    assert.throws(() => workflow.submitAudit({ artifactDigest: digest("a"), evidenceDigest: digest("b"), evidenceIds: ["evidence-A"], reviewerId: "reviewer-X" }), { code: "GOVERNANCE_REVIEWER_UNAUTHORIZED" });
    workflow.submitAudit({ artifactDigest: digest("a"), evidenceDigest: digest("b"), evidenceIds: ["evidence-A"], reviewerId: "reviewer-A" });
    const reviewDigest = sha256Canonical(workflow.snapshot().audit);
    assert.throws(() => workflow.accept({ accepted: false, artifactDigest: digest("a"), humanId: "human-A", reviewDigest }), { code: "GOVERNANCE_NOT_ACCEPTED" });
    assert.throws(() => workflow.accept({ accepted: true, artifactDigest: digest("f"), humanId: "human-A", reviewDigest }), { code: "GOVERNANCE_ARTIFACT_MISMATCH" });
    assert.throws(() => workflow.accept({ accepted: true, artifactDigest: digest("a"), humanId: "human-X", reviewDigest }), { code: "GOVERNANCE_HUMAN_UNAUTHORIZED" });
    assert.throws(() => workflow.accept({ accepted: true, artifactDigest: digest("a"), humanId: "human-A", reviewDigest: digest("c") }), { code: "GOVERNANCE_REVIEW_DIGEST_MISMATCH" });
    workflow.accept({ accepted: true, artifactDigest: digest("a"), humanId: "human-A", reviewDigest });
    assert.throws(() => workflow.promote({ artifactDigest: digest("a"), evidenceDigest: digest("f") }), { code: "GOVERNANCE_EVIDENCE_MISMATCH" });
    assert.equal(workflow.promote({ artifactDigest: digest("a"), evidenceDigest: digest("b") }).stage, "PROMOTED");
    const source = new URL("../src/", import.meta.url);
    for (const name of await readdir(source)) {
      if (!name.endsWith(".mjs")) continue;
      const text = await readFile(new URL(name, source), "utf8");
      assert.doesNotMatch(text, /node:child_process|\beval\s*\(|new\s+Function|\bfetch\s*\(|WebSocket|createServer/);
    }
  },

  "19": async () => {
    const manifest = await build();
    assert.ok(Object.keys(manifest.files).includes("index.mjs"));
    const packed = packageProof();
    assert.ok(packed.fileCount > 0);
    assert.match(packed.filename, /agent-control-room-public-reference-0\.1\.1\.tgz$/);
  },
};
