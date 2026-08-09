import { normalizeExecutionIntent } from "./execution-intent.mjs";
import { ControlError, fail } from "./errors.mjs";
import { handoffSafeCanary } from "./executor.mjs";
import { evaluateAuthority, revalidateSelectedAuthority } from "./policy.mjs";
import { requireDigest } from "./validation.mjs";

export class AuthorityBoundary {
  constructor({ approvalStore, artifactDigest, deps, executor, ledger, policy, receiptAuthenticator }) {
    requireDigest(artifactDigest, "artifactDigest");
    if (!receiptAuthenticator || typeof receiptAuthenticator.attach !== "function") {
      fail("AUTHORITY_RECEIPT_AUTHENTICATOR_MISSING", "Authority receipt authenticator is required");
    }
    this.approvalStore = approvalStore;
    this.artifactDigest = artifactDigest;
    this.deps = deps;
    this.executor = executor;
    this.ledger = ledger;
    this.policy = policy;
    this.receiptAuthenticator = receiptAuthenticator;
    this.pending = new Map();
  }

  async propose(rawIntent) {
    const intent = normalizeExecutionIntent(rawIntent, this.deps);
    const decision = evaluateAuthority(intent, this.policy, this.deps);
    const envelope = decision.envelopeId === null
      ? null
      : this.policy.envelopes.find(({ id }) => id === decision.envelopeId);
    const approvalRequest = decision.outcome === "STEP_UP"
      ? this.approvalStore.createRequest(decision, envelope)
      : null;
    const handoffDisposition = decision.outcome === "ALLOW" ? "ELIGIBLE" : "WITHHELD";
    const decisionReceipt = await this.appendReceipt({
      approvalRequest,
      decision,
      handoffDisposition,
      intent,
      reasonCodes: decision.reasonCodes,
      type: "authority_decision",
    });

    if (decision.outcome === "DENY") {
      return Object.freeze({ approvalRequest: null, decision, decisionReceipt, handoffReceipt: null });
    }
    if (decision.outcome === "STEP_UP") {
      this.pending.set(approvalRequest.requestId, { decision, decisionReceipt, intent });
      return Object.freeze({ approvalRequest, decision, decisionReceipt, handoffReceipt: null });
    }
    if (intent.action !== "FIXED_SAFE_CANARY") fail("NO_EXECUTOR_ADAPTER", "Only the fixed safe-canary adapter exists");
    const revalidation = revalidateSelectedAuthority(intent, decision, this.policy, this.deps.clock);
    if (!revalidation.valid) {
      await this.rejectCurrentAuthority(decisionReceipt.receiptId, null, revalidation.reasonCodes);
    }
    const handoffReceipt = await this.executeAndRecord({
      approvalId: null,
      decision,
      decisionReceipt,
      intent,
      requestId: null,
      reasonCodes: ["ALLOW_HANDOFF_COMPLETED"],
    });
    return Object.freeze({ approvalRequest: null, decision, decisionReceipt, handoffReceipt });
  }

  async resume(requestId, approval) {
    const pending = this.pending.get(requestId);
    if (!pending) fail("STEP_UP_NOT_PENDING", "No unresolved STEP_UP request is retained");
    const revalidation = revalidateSelectedAuthority(pending.intent, pending.decision, this.policy, this.deps.clock);
    if (!revalidation.valid) {
      this.pending.delete(requestId);
      await this.rejectCurrentAuthority(
        pending.decisionReceipt.receiptId,
        requestId,
        revalidation.reasonCodes,
      );
    }
    let consumed;
    try {
      if (approval === null || approval === undefined) {
        throw new ControlError("APPROVAL_MISSING", "STEP_UP handoff requires an approval");
      }
      consumed = this.approvalStore.consume(requestId, approval);
    } catch (error) {
      const rejectionReceipt = await this.appendReceipt({
        authorityReceiptId: pending.decisionReceipt.receiptId,
        handoffDisposition: "WITHHELD",
        reasonCodes: [error.code ?? "APPROVAL_INVALID"],
        requestId,
        type: "approval_rejection",
      });
      error.rejectionReceipt = rejectionReceipt;
      throw error;
    }
    this.pending.delete(requestId);
    const handoffReceipt = await this.executeAndRecord({
      approvalId: consumed.approvalId,
      decision: pending.decision,
      decisionReceipt: pending.decisionReceipt,
      intent: pending.intent,
      requestId,
      reasonCodes: ["STEP_UP_RESOLVED", "APPROVAL_CONSUMED", "HANDOFF_COMPLETED"],
    });
    return Object.freeze({ approval: consumed, decision: pending.decision, handoffReceipt });
  }

  async rejectCurrentAuthority(authorityReceiptId, requestId, reasonCodes) {
    const rejectionReceipt = await this.appendReceipt({
      authorityReceiptId,
      handoffDisposition: "WITHHELD",
      reasonCodes: ["AUTHORITY_REVALIDATION_FAILED", ...reasonCodes],
      requestId,
      type: "authority_revalidation_rejection",
    });
    const error = new ControlError(
      "AUTHORITY_REVALIDATION_FAILED",
      "Selected authority was not current immediately before handoff",
      { reasonCodes: [...reasonCodes] },
    );
    error.rejectionReceipt = rejectionReceipt;
    throw error;
  }

  async executeAndRecord({ approvalId, decision, decisionReceipt, intent, requestId, reasonCodes }) {
    let result;
    try {
      result = handoffSafeCanary(this.executor, {
        artifactDigest: this.artifactDigest,
        authorityReceiptId: decisionReceipt.receiptId,
        stateDigest: intent.evidence.stateDigest,
      });
    } catch (error) {
      const failureReceipt = await this.appendReceipt({
        approvalId,
        authorityReceiptId: decisionReceipt.receiptId,
        decisionId: decision.decisionId,
        handoff: { adapter: "fixed-safe-canary-v1", status: "FAILED" },
        reasonCodes: [error.code ?? "CANARY_EXECUTION_FAILED"],
        requestId,
        type: "handoff_failure",
      });
      error.failureReceipt = failureReceipt;
      throw error;
    }
    return this.appendReceipt({
      approvalId,
      authorityReceiptId: decisionReceipt.receiptId,
      decisionId: decision.decisionId,
      handoff: { adapter: "fixed-safe-canary-v1", result, status: "COMPLETED" },
      reasonCodes,
      requestId,
      type: "handoff_outcome",
    });
  }

  appendReceipt(payload) {
    return this.ledger.append(this.receiptAuthenticator.attach(payload));
  }
}
