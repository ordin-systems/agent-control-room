import { deepFreeze, sha256Canonical } from "./canonical-json.mjs";
import { fail } from "./errors.mjs";
import { handoffSafeCanary, SafeCanaryExecutor } from "./executor.mjs";
import { exactObject, isoInstant, nonEmptyString, requireDigest } from "./validation.mjs";

const PASS_KEYS = [
  "approvalId", "artifactDigest", "authorityReceiptDigest", "authorityReceiptId", "caseId", "executedAt",
  "observedAt", "resultDigest", "stateDigest", "status", "tokenId",
];

export class RecoveryManager {
  #cases = new Map();

  constructor({ approvalStore, deps, executor, ledger, maxCanaryAgeMs = 300_000, receiptAuthenticator }) {
    if (!(executor instanceof SafeCanaryExecutor) || executor.constructor !== SafeCanaryExecutor) {
      fail("INVALID_EXECUTOR", "Recovery requires the fixed safe-canary executor");
    }
    if (!receiptAuthenticator || typeof receiptAuthenticator.verify !== "function") {
      fail("AUTHORITY_RECEIPT_AUTHENTICATOR_MISSING", "Recovery requires authority receipt verification");
    }
    this.approvalStore = approvalStore;
    this.deps = deps;
    this.executor = executor;
    this.ledger = ledger;
    this.maxCanaryAgeMs = maxCanaryAgeMs;
    this.receiptAuthenticator = receiptAuthenticator;
  }

  get(caseId) {
    const item = this.#cases.get(caseId);
    if (!item) fail("RECOVERY_CASE_NOT_FOUND", "Recovery Case is not retained");
    return item;
  }

  async derive(authorityReceiptId, { artifactDigest, localStateDigest }) {
    requireDigest(artifactDigest, "artifactDigest");
    requireDigest(localStateDigest, "localStateDigest");
    const retained = await this.ledger.get(authorityReceiptId);
    if (!this.receiptAuthenticator.verify(retained.payload)) {
      fail("RECOVERY_SOURCE_UNAUTHENTICATED", "Recovery source was not emitted by the authority boundary");
    }
    const payload = retained.payload;
    if (payload.type !== "authority_decision" || payload.handoffDisposition !== "WITHHELD"
      || !["DENY", "STEP_UP"].includes(payload.decision?.outcome)) {
      fail("RECOVERY_SOURCE_INVALID", "Recovery Case requires a retained withheld gate outcome");
    }
    const caseId = nonEmptyString(this.deps.idGenerator("recovery-case"), "injected Recovery Case id");
    if (this.#cases.has(caseId)) fail("DUPLICATE_RECOVERY_CASE", "Recovery Case ID already exists");
    const recoveryCase = {
      approvalRequestId: payload.approvalRequest?.requestId ?? null,
      artifactDigest,
      authorityReceiptDigest: retained.digest,
      authorityReceiptId,
      canary: null,
      caseId,
      envelopeId: payload.decision.envelopeId,
      envelopeVersion: payload.decision.envelopeVersion,
      localState: "GATED",
      profileId: payload.decision.profileId,
      profileVersion: payload.decision.profileVersion,
      sourceDecisionId: payload.decision.decisionId,
      sourceOutcome: payload.decision.outcome,
      stateDigest: localStateDigest,
      status: "OPEN",
    };
    this.#cases.set(caseId, recoveryCase);
    await this.ledger.append({
      authorityReceiptDigest: retained.digest,
      authorityReceiptId,
      caseId,
      envelopeId: recoveryCase.envelopeId,
      profileId: recoveryCase.profileId,
      reasonCodes: ["RECOVERY_DERIVED_FROM_RETAINED_GATE"],
      type: "recovery_case_created",
    });
    return deepFreeze(structuredClone(recoveryCase));
  }

  async retainEvidence(caseId) {
    const item = this.get(caseId);
    if (item.status !== "OPEN") fail("RECOVERY_ORDER_VIOLATION", "Evidence retention must be first");
    item.status = "EVIDENCE_RETAINED";
    await this.record(item, "RECOVERY_EVIDENCE_RETAINED");
    return deepFreeze(structuredClone(item));
  }

  async confirmAuthority(caseId, approval = null) {
    const item = this.get(caseId);
    if (item.status !== "EVIDENCE_RETAINED") fail("RECOVERY_ORDER_VIOLATION", "Authority confirmation follows evidence retention");
    if (item.approvalRequestId !== null) {
      if (approval === null) fail("RECOVERY_APPROVAL_REQUIRED", "STEP_UP recovery requires bound approval");
      this.approvalStore.validate(item.approvalRequestId, approval);
      item.pendingApproval = structuredClone(approval);
    } else if (approval !== null) {
      fail("RECOVERY_APPROVAL_UNEXPECTED", "DENY recovery cannot inject an approval");
    }
    item.status = "AUTHORITY_RECONFIRMED";
    await this.record(item, "RECOVERY_AUTHORITY_RECONFIRMED");
    return deepFreeze(structuredClone(item));
  }

  async runCanary(caseId) {
    const item = this.get(caseId);
    if (item.status !== "AUTHORITY_RECONFIRMED") fail("RECOVERY_ORDER_VIOLATION", "Canary handoff follows authority confirmation");
    let approvalId = null;
    if (item.approvalRequestId !== null) {
      const consumed = this.approvalStore.consume(item.approvalRequestId, item.pendingApproval);
      approvalId = consumed.approvalId;
      delete item.pendingApproval;
    }
    const result = handoffSafeCanary(this.executor, {
      artifactDigest: item.artifactDigest,
      authorityReceiptId: item.authorityReceiptId,
      stateDigest: item.stateDigest,
    });
    item.canary = {
      approvalId,
      artifactDigest: item.artifactDigest,
      authorityReceiptDigest: item.authorityReceiptDigest,
      authorityReceiptId: item.authorityReceiptId,
      caseId,
      executedAt: result.completedAt,
      result: structuredClone(result),
      resultDigest: sha256Canonical(result),
      stateDigest: item.stateDigest,
      tokenId: nonEmptyString(this.deps.idGenerator("recovery-canary-token"), "injected recovery canary token"),
    };
    item.status = "CANARY_EXECUTED";
    await this.record(item, "RECOVERY_SAFE_CANARY_HANDED_OFF");
    return deepFreeze(structuredClone(item.canary));
  }

  async recordCanaryPass(caseId, proof) {
    const item = this.get(caseId);
    if (item.status !== "CANARY_EXECUTED") fail("RECOVERY_ORDER_VIOLATION", "Canary pass requires executed canary");
    exactObject(proof, PASS_KEYS, "canary pass proof");
    isoInstant(proof.executedAt, "proof.executedAt");
    isoInstant(proof.observedAt, "proof.observedAt");
    const expected = item.canary;
    for (const key of [
      "approvalId", "artifactDigest", "authorityReceiptDigest", "authorityReceiptId", "caseId", "executedAt",
      "resultDigest", "stateDigest", "tokenId",
    ]) {
      if (proof[key] !== expected[key]) fail("CANARY_BINDING_MISMATCH", `Canary ${key} binding mismatch`);
    }
    if (expected.result.status !== "PASS" || proof.status !== "PASS") {
      fail("CANARY_NOT_PASSED", "Canary proof must derive from a successful fixed canary");
    }
    if (sha256Canonical(expected.result) !== expected.resultDigest) fail("CANARY_RESULT_TAMPERED", "Retained canary result digest mismatch");
    try {
      if (!this.executor.verifyFixedCanary(expected.result)) {
        fail("CANARY_ARTIFACT_INVALID", "Canary marker artifact no longer verifies");
      }
    } catch (error) {
      if (error?.code === "CANARY_ARTIFACT_INVALID") throw error;
      fail("CANARY_ARTIFACT_INVALID", "Canary marker artifact is missing or unreadable");
    }
    const now = Date.parse(isoInstant(this.deps.clock(), "canary proof clock"));
    const observed = Date.parse(proof.observedAt);
    if (observed < Date.parse(expected.executedAt) || now - observed < 0 || now - observed > this.maxCanaryAgeMs) {
      fail("CANARY_STALE", "Canary proof is stale, future-dated, or predates execution");
    }
    if (item.approvalRequestId !== null
      && !this.approvalStore.isConsumed(expected.approvalId, item.approvalRequestId)) {
      fail("CANARY_APPROVAL_NOT_CONSUMED", "Canary is not bound to the consumed approval");
    }
    item.status = "CANARY_PASSED";
    await this.record(item, "RECOVERY_CANARY_PASSED");
    return deepFreeze(structuredClone(item));
  }

  async restoreLocalState(caseId) {
    const item = this.get(caseId);
    if (item.status !== "CANARY_PASSED") fail("RECOVERY_ORDER_VIOLATION", "Local restoration requires a valid canary pass");
    item.localState = "RESTORED_LOCAL_ONLY";
    item.status = "RESTORED";
    await this.record(item, "RECOVERY_LOCAL_STATE_RESTORED");
    return deepFreeze(structuredClone(item));
  }

  async record(item, reasonCode) {
    return this.ledger.append({
      authorityReceiptDigest: item.authorityReceiptDigest,
      authorityReceiptId: item.authorityReceiptId,
      caseId: item.caseId,
      reasonCodes: [reasonCode],
      status: item.status,
      type: "recovery_transition",
    });
  }
}
