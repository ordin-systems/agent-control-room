import { deepFreeze, sha256Canonical } from "./canonical-json.mjs";
import { fail } from "./errors.mjs";
import { exactObject, isoInstant, nonEmptyString } from "./validation.mjs";

const APPROVAL_KEYS = [
  "action", "agentId", "approvalId", "approverId", "capability", "decisionDigest", "decisionId",
  "envelopeId", "envelopeVersion", "evidenceDigest", "expiresAt", "profileId", "profileVersion", "requestId", "resource", "status",
];
const CREATE_APPROVAL_KEYS = ["approverId", "capability", "expiresAt", "status"];

export class ApprovalStore {
  #requests = new Map();
  #issuedApprovals = new Map();
  #consumedApprovals = new Map();
  #consumedRequests = new Map();


  constructor({ clock, idGenerator }) {
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  createRequest(decision, envelope) {
    if (decision.outcome !== "STEP_UP") fail("NOT_STEP_UP", "Approval requests require STEP_UP");
    if (!envelope || envelope.id !== decision.envelopeId || envelope.profileId !== decision.profileId) {
      fail("APPROVAL_REQUEST_AUTHORITY_MISMATCH", "Approval request requires the evaluated envelope");
    }
    const request = deepFreeze({
      action: decision.action,
      agentId: decision.agentId,
      authorizedApprovers: structuredClone(envelope.authorizedApprovers),
      capability: "acr.approve_handoff",
      decisionDigest: sha256Canonical(decision),
      decisionId: decision.decisionId,
      envelopeId: decision.envelopeId,
      envelopeVersion: decision.envelopeVersion,
      evidenceDigest: decision.evidenceDigest,
      expiresAt: new Date(Math.min(Date.parse(envelope.expiresAt), Date.parse(this.clock()) + 300_000)).toISOString(),
      profileId: decision.profileId,
      profileVersion: decision.profileVersion,
      requestId: nonEmptyString(this.idGenerator("approval-request"), "injected approval request id"),
      resource: decision.resource,
    });
    if (this.#requests.has(request.requestId)) fail("DUPLICATE_APPROVAL_REQUEST", "Approval request ID already exists");
    this.#requests.set(request.requestId, request);
    return request;
  }

  getRequest(requestId) {
    const request = this.#requests.get(requestId);
    if (!request) fail("APPROVAL_REQUEST_NOT_FOUND", "Approval request was not retained");
    return request;
  }

  createApproval(requestId, values) {
    exactObject(values, CREATE_APPROVAL_KEYS, "approval creation values");
    const request = this.getRequest(requestId);
    const approvalId = nonEmptyString(this.idGenerator("approval"), "injected approval id");

    const approval = deepFreeze({
      action: request.action,
      agentId: request.agentId,
      approvalId,
      approverId: values.approverId,
      capability: values.capability,
      decisionDigest: request.decisionDigest,
      decisionId: request.decisionId,
      envelopeId: request.envelopeId,
      envelopeVersion: request.envelopeVersion,
      evidenceDigest: request.evidenceDigest,
      expiresAt: values.expiresAt,
      profileId: request.profileId,
      profileVersion: request.profileVersion,
      requestId: request.requestId,
      resource: request.resource,
      status: values.status,
    });
    if (this.#issuedApprovals.has(approval.approvalId)) fail("DUPLICATE_APPROVAL_ID", "Approval IDs must be unique");
    this.#issuedApprovals.set(approval.approvalId, sha256Canonical(approval));
    return approval;
  }

  validate(requestId, approval) {
    const request = this.getRequest(requestId);
    exactObject(approval, APPROVAL_KEYS, "approval");
    for (const key of ["approvalId", "approverId", "capability", "requestId", "agentId", "action", "resource", "profileId", "profileVersion", "envelopeId", "envelopeVersion", "decisionId", "decisionDigest", "evidenceDigest", "status"]) {
      nonEmptyString(approval[key], `approval.${key}`, /^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/);
    }
    isoInstant(approval.expiresAt, "approval.expiresAt");
    if (approval.requestId !== request.requestId) fail("APPROVAL_REDIRECT", "Approval request redirect rejected");
    for (const key of ["agentId", "action", "resource", "profileId", "profileVersion", "envelopeId", "envelopeVersion", "decisionId", "decisionDigest", "evidenceDigest", "capability"]) {
      if (approval[key] !== request[key]) fail("APPROVAL_BINDING_MISMATCH", `Approval ${key} does not match request`);
    }
    if (approval.approverId === request.agentId) fail("APPROVAL_SELF_INJECTION", "Agent cannot approve its own request");
    const authorized = request.authorizedApprovers.some(
      (candidate) => candidate.approverId === approval.approverId && candidate.capabilities.includes(approval.capability),
    );
    if (!authorized) fail("APPROVER_UNAUTHORIZED", "Approver identity or capability is unauthorized");
    if (approval.status !== "approved") fail("APPROVAL_REJECTED", "Approval was not accepted");
    const now = Date.parse(isoInstant(this.clock(), "approval validation clock"));
    if (Date.parse(request.expiresAt) <= now || Date.parse(approval.expiresAt) <= now) {
      fail("APPROVAL_EXPIRED", "Approval or request expired");
    }
    if (Date.parse(approval.expiresAt) > Date.parse(request.expiresAt)) {
      fail("APPROVAL_EXPIRY_MISMATCH", "Approval cannot outlive its request");
    }
    const issuedDigest = this.#issuedApprovals.get(approval.approvalId);
    if (!issuedDigest) fail("APPROVAL_NOT_ISSUED", "Approval was not issued by this trusted store");
    if (issuedDigest !== sha256Canonical(approval)) fail("APPROVAL_ISSUED_CONTENT_MISMATCH", "Issued approval content changed");
    if (this.#consumedApprovals.has(approval.approvalId)) fail("APPROVAL_REPLAY", "Approval is single-use");
    if (this.#consumedRequests.has(requestId)) fail("APPROVAL_REQUEST_ALREADY_CONSUMED", "Approval request is single-use");
    return deepFreeze(structuredClone(approval));
  }

  consume(requestId, approval) {
    const validated = this.validate(requestId, approval);
    const consumption = deepFreeze({
      approvalId: validated.approvalId,
      consumedAt: isoInstant(this.clock(), "approval consumption clock"),
      requestId,
    });
    this.#consumedApprovals.set(validated.approvalId, consumption);
    this.#consumedRequests.set(requestId, consumption);
    return validated;
  }

  isConsumed(approvalId, requestId) {
    return this.#consumedApprovals.get(approvalId)?.requestId === requestId
      && this.#consumedRequests.get(requestId)?.approvalId === approvalId;
  }
}
