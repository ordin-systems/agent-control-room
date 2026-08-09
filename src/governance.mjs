import { deepFreeze, sha256Canonical } from "./canonical-json.mjs";
import { fail } from "./errors.mjs";
import { exactObject, nonEmptyString, requireDigest, stringArray } from "./validation.mjs";

const CONSTRUCTOR_KEYS = ["artifactDigest", "authorizedHumanIds", "authorizedReviewerIds"];
const AUDIT_KEYS = ["artifactDigest", "evidenceDigest", "evidenceIds", "reviewerId"];
const ACCEPTANCE_KEYS = ["accepted", "artifactDigest", "humanId", "reviewDigest"];
const PROMOTION_KEYS = ["artifactDigest", "evidenceDigest"];

function authorizedIds(values, label) {
  stringArray(values, label, { unique: true });
  if (values.length === 0) fail("GOVERNANCE_AUTHORITY_MISSING", `${label} must not be empty`);
  values.forEach((id) => nonEmptyString(id, label));
  return new Set(values);
}

export class GovernanceWorkflow {
  constructor(values) {
    exactObject(values, CONSTRUCTOR_KEYS, "governance constructor");
    requireDigest(values.artifactDigest, "artifactDigest");
    this.authorizedHumanIds = authorizedIds(values.authorizedHumanIds, "authorized human ID");
    this.authorizedReviewerIds = authorizedIds(values.authorizedReviewerIds, "authorized reviewer ID");
    this.state = {
      acceptance: null,
      artifactDigest: values.artifactDigest,
      audit: null,
      promotion: null,
      stage: "DRAFT",
    };
  }

  snapshot() {
    return deepFreeze(structuredClone(this.state));
  }

  submitAudit(values) {
    exactObject(values, AUDIT_KEYS, "governance audit");
    if (this.state.stage !== "DRAFT") fail("GOVERNANCE_ORDER_VIOLATION", "Audit follows draft");
    this.matchArtifact(values.artifactDigest);
    requireDigest(values.evidenceDigest, "audit evidenceDigest");
    stringArray(values.evidenceIds, "audit evidenceIds", { unique: true });
    if (values.evidenceIds.length === 0) fail("GOVERNANCE_EVIDENCE_MISSING", "Audit requires named evidence");
    values.evidenceIds.forEach((id) => nonEmptyString(id, "audit evidence ID"));
    nonEmptyString(values.reviewerId, "audit reviewerId");
    if (!this.authorizedReviewerIds.has(values.reviewerId)) {
      fail("GOVERNANCE_REVIEWER_UNAUTHORIZED", "Audit reviewer is not authorized");
    }
    this.state.audit = {
      artifactDigest: values.artifactDigest,
      evidenceDigest: values.evidenceDigest,
      evidenceIds: [...values.evidenceIds],
      reviewerId: values.reviewerId,
    };
    this.state.stage = "AUDITED";
    return this.snapshot();
  }

  accept(values) {
    exactObject(values, ACCEPTANCE_KEYS, "governance acceptance");
    if (this.state.stage !== "AUDITED") fail("GOVERNANCE_ORDER_VIOLATION", "Human acceptance follows audit");
    this.matchArtifact(values.artifactDigest);
    requireDigest(values.reviewDigest, "reviewDigest");
    nonEmptyString(values.humanId, "acceptance humanId");
    if (!this.authorizedHumanIds.has(values.humanId)) {
      fail("GOVERNANCE_HUMAN_UNAUTHORIZED", "Acceptance human is not authorized");
    }
    if (values.reviewDigest !== sha256Canonical(this.state.audit)) {
      fail("GOVERNANCE_REVIEW_DIGEST_MISMATCH", "Acceptance does not bind the retained audit");
    }
    if (values.accepted !== true) fail("GOVERNANCE_NOT_ACCEPTED", "Promotion fails closed without explicit acceptance");
    this.state.acceptance = structuredClone(values);
    this.state.stage = "ACCEPTED";
    return this.snapshot();
  }

  promote(values) {
    exactObject(values, PROMOTION_KEYS, "governance promotion");
    if (this.state.stage !== "ACCEPTED") fail("GOVERNANCE_ORDER_VIOLATION", "Promotion follows acceptance");
    this.matchArtifact(values.artifactDigest);
    requireDigest(values.evidenceDigest, "evidenceDigest");
    if (values.evidenceDigest !== this.state.audit.evidenceDigest) {
      fail("GOVERNANCE_EVIDENCE_MISMATCH", "Promotion evidence differs from audited evidence");
    }
    this.state.promotion = {
      artifactDigest: values.artifactDigest,
      evidenceDigest: values.evidenceDigest,
      scope: "local-reference-only",
    };
    this.state.stage = "PROMOTED";
    return this.snapshot();
  }

  matchArtifact(artifactDigest) {
    requireDigest(artifactDigest, "artifactDigest");
    if (artifactDigest !== this.state.artifactDigest) {
      fail("GOVERNANCE_ARTIFACT_MISMATCH", "Governance evidence targets another artifact");
    }
  }
}
