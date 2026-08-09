import { deepFreeze, sha256Canonical } from "./canonical-json.mjs";
import { fail } from "./errors.mjs";
import {
  booleanValue,
  exactObject,
  isoInstant,
  nonEmptyString,
  nonNegativeInteger,
  stringArray,
} from "./validation.mjs";

export const SUPPORTED_ACTIONS = Object.freeze(["FIXED_SAFE_CANARY"]);
export const PROTECTED_ACTIONS = Object.freeze(["delete_records", "restore_protected_state"]);
export const KNOWN_ACTIONS = Object.freeze([...SUPPORTED_ACTIONS, ...PROTECTED_ACTIONS]);
export const SUPPORTED_RESOURCES = Object.freeze(["local:reference"]);
export const RISK_ORDER = Object.freeze(["low", "moderate", "high", "destructive"]);
export const APPROVER_CAPABILITIES = Object.freeze(["acr.approve_handoff"]);

const BUNDLE_KEYS = ["agents", "envelopes", "profiles"];
const PROFILE_KEYS = [
  "active", "agentId", "allowedActions", "allowedResources", "deniedActions", "deniedResources",
  "envelopeVersion", "evidenceMaxAgeMs", "evidenceObservedAt", "expiresAt", "id", "revokedAt", "stepUpRisks", "version",
];
const ENVELOPE_KEYS = [
  "actions", "active", "agentId", "authorizedApprovers", "evidenceMaxAgeMs", "evidenceObservedAt",
  "expiresAt", "id", "profileId", "profileVersion", "resources", "revokedAt", "version",
];
const APPROVER_KEYS = ["approverId", "capabilities"];

function validateLifecycle(item, label) {
  booleanValue(item.active, `${label}.active`);
  isoInstant(item.expiresAt, `${label}.expiresAt`);
  if (item.revokedAt !== null) isoInstant(item.revokedAt, `${label}.revokedAt`);
  isoInstant(item.evidenceObservedAt, `${label}.evidenceObservedAt`);
  nonNegativeInteger(item.evidenceMaxAgeMs, `${label}.evidenceMaxAgeMs`);
}

function validateProfile(profile) {
  exactObject(profile, PROFILE_KEYS, "permission profile");
  nonEmptyString(profile.id, "profile.id");
  nonEmptyString(profile.agentId, "profile.agentId");
  nonEmptyString(profile.version, "profile.version");
  nonEmptyString(profile.envelopeVersion, "profile.envelopeVersion");
  stringArray(profile.allowedActions, "profile.allowedActions", { allowed: KNOWN_ACTIONS, unique: true });
  stringArray(profile.allowedResources, "profile.allowedResources", { allowed: SUPPORTED_RESOURCES, unique: true });
  stringArray(profile.deniedActions, "profile.deniedActions", { allowed: KNOWN_ACTIONS, unique: true });
  stringArray(profile.deniedResources, "profile.deniedResources", { allowed: SUPPORTED_RESOURCES, unique: true });
  stringArray(profile.stepUpRisks, "profile.stepUpRisks", { allowed: RISK_ORDER, unique: true });
  validateLifecycle(profile, "profile");
}

function validateEnvelope(envelope) {
  exactObject(envelope, ENVELOPE_KEYS, "task-authority envelope");
  nonEmptyString(envelope.id, "envelope.id");
  nonEmptyString(envelope.agentId, "envelope.agentId");
  nonEmptyString(envelope.profileId, "envelope.profileId");
  nonEmptyString(envelope.profileVersion, "envelope.profileVersion");
  nonEmptyString(envelope.version, "envelope.version");
  stringArray(envelope.actions, "envelope.actions", { allowed: KNOWN_ACTIONS, unique: true });
  stringArray(envelope.resources, "envelope.resources", { allowed: SUPPORTED_RESOURCES, unique: true });
  validateLifecycle(envelope, "envelope");
  if (!Array.isArray(envelope.authorizedApprovers)) {
    fail("MALFORMED_FIELD", "envelope.authorizedApprovers must be an array");
  }
  const approverIds = [];
  for (const approver of envelope.authorizedApprovers) {
    exactObject(approver, APPROVER_KEYS, "authorized approver");
    approverIds.push(nonEmptyString(approver.approverId, "approver.approverId"));
    stringArray(approver.capabilities, "approver.capabilities", { allowed: APPROVER_CAPABILITIES, unique: true });
  }
  if (new Set(approverIds).size !== approverIds.length) {
    fail("DUPLICATE_APPROVER", "Authorized approver identities must be unique");
  }
}

export function createPolicyBundle(raw) {
  exactObject(raw, BUNDLE_KEYS, "policy bundle");
  if (!Array.isArray(raw.agents) || !Array.isArray(raw.profiles) || !Array.isArray(raw.envelopes)) {
    fail("INVALID_POLICY", "Policy bundle requires agent, profile, and envelope arrays");
  }
  raw.agents.forEach((agent) => nonEmptyString(agent, "agent"));
  if (new Set(raw.agents).size !== raw.agents.length) fail("DUPLICATE_AGENT", "Agent IDs must be unique");
  raw.profiles.forEach(validateProfile);
  raw.envelopes.forEach(validateEnvelope);
  const profileIds = raw.profiles.map(({ id }) => id);
  const envelopeIds = raw.envelopes.map(({ id }) => id);
  if (new Set(profileIds).size !== profileIds.length) fail("DUPLICATE_PROFILE_ID", "Profile IDs must be unique");
  if (new Set(envelopeIds).size !== envelopeIds.length) fail("DUPLICATE_ENVELOPE_ID", "Envelope IDs must be unique");
  if (profileIds.some((id) => envelopeIds.includes(id))) fail("CROSS_TYPE_POLICY_ID_COLLISION", "Policy IDs cannot collide across types");
  return deepFreeze(structuredClone(raw));
}

function lifecycleReasons(prefix, item, now) {
  const reasons = [];
  if (!item.active) reasons.push(`${prefix}_INACTIVE`);
  if (Date.parse(item.expiresAt) <= now) reasons.push(`${prefix}_EXPIRED`);
  if (item.revokedAt !== null && Date.parse(item.revokedAt) <= now) reasons.push(`${prefix}_REVOKED`);
  const evidenceAge = now - Date.parse(item.evidenceObservedAt);
  if (evidenceAge < 0) reasons.push(`${prefix}_EVIDENCE_FROM_FUTURE`);
  if (evidenceAge > item.evidenceMaxAgeMs) reasons.push(`${prefix}_EVIDENCE_STALE`);
  return reasons;
}

function selectedAuthorityReasons(intent, profile, envelope, now) {
  const reasons = [];
  if (profile.agentId !== intent.agentId) reasons.push("PROFILE_AGENT_MISMATCH");
  if (envelope.agentId !== intent.agentId) reasons.push("ENVELOPE_AGENT_MISMATCH");
  if (envelope.profileId !== profile.id) reasons.push("ENVELOPE_PROFILE_MISMATCH");
  if (envelope.profileVersion !== profile.version) reasons.push("PROFILE_VERSION_MISMATCH");
  if (envelope.version !== profile.envelopeVersion) reasons.push("ENVELOPE_VERSION_MISMATCH");
  if (profile.deniedActions.includes(intent.action)) reasons.push("PROFILE_ACTION_DENIED");
  if (profile.deniedResources.includes(intent.resource)) reasons.push("PROFILE_RESOURCE_DENIED");
  if (PROTECTED_ACTIONS.includes(intent.action)) reasons.push("PROTECTED_ACTION_DENIED");
  if (!profile.allowedActions.includes(intent.action)) reasons.push("PROFILE_ACTION_NOT_ALLOWED");
  if (!profile.allowedResources.includes(intent.resource)) reasons.push("PROFILE_RESOURCE_NOT_ALLOWED");
  if (!envelope.actions.includes(intent.action)) reasons.push("ENVELOPE_ACTION_NOT_ALLOWED");
  if (!envelope.resources.includes(intent.resource)) reasons.push("ENVELOPE_RESOURCE_NOT_ALLOWED");
  reasons.push(...lifecycleReasons("PROFILE", profile, now));
  reasons.push(...lifecycleReasons("ENVELOPE", envelope, now));
  if (intent.evidence.contradictions.length > 0) reasons.push("EVIDENCE_CONTRADICTION");
  const intentEvidenceAge = now - Date.parse(intent.evidence.observedAt);
  if (intentEvidenceAge < 0) reasons.push("EVIDENCE_FROM_FUTURE");
  if (intentEvidenceAge > Math.min(profile.evidenceMaxAgeMs, envelope.evidenceMaxAgeMs)) reasons.push("EVIDENCE_STALE");
  return [...new Set(reasons)];
}

function baseDecision(intent, deps) {
  return {
    action: intent.action,
    agentId: intent.agentId,
    decidedAt: isoInstant(deps.clock(), "injected decision clock"),
    decisionId: nonEmptyString(deps.idGenerator("decision"), "injected decision id"),
    evidenceDigest: sha256Canonical(intent.evidence),
    intentId: intent.intentId,
    profileId: null,
    profileVersion: null,
    envelopeId: null,
    envelopeVersion: null,
    resource: intent.resource,
    risk: intent.risk,
  };
}

function finish(base, outcome, reasonCodes, profile = null, envelope = null) {
  return deepFreeze({
    ...base,
    envelopeId: envelope?.id ?? null,
    envelopeVersion: envelope?.version ?? null,
    outcome,
    profileId: profile?.id ?? null,
    profileVersion: profile?.version ?? null,
    reasonCodes: [...new Set(reasonCodes)],
  });
}

export function evaluateAuthority(intent, policy, deps) {
  const base = baseDecision(intent, deps);
  if (!policy.agents.includes(intent.agentId)) return finish(base, "DENY", ["AGENT_NOT_REGISTERED"]);
  if (!RISK_ORDER.includes(intent.risk)) return finish(base, "DENY", ["UNSUPPORTED_RISK"]);
  if (!KNOWN_ACTIONS.includes(intent.action)) return finish(base, "DENY", ["UNSUPPORTED_ACTION"]);
  if (!SUPPORTED_RESOURCES.includes(intent.resource)) return finish(base, "DENY", ["UNSUPPORTED_RESOURCE"]);

  const profiles = policy.profiles.filter(({ agentId }) => agentId === intent.agentId);
  if (profiles.length === 0) return finish(base, "DENY", ["PROFILE_MISSING"]);
  if (profiles.length !== 1) return finish(base, "DENY", ["PROFILE_SELECTION_CONTRADICTION"]);
  const profile = profiles[0];
  const envelopes = policy.envelopes.filter(({ agentId, profileId }) => agentId === intent.agentId && profileId === profile.id);
  if (envelopes.length === 0) return finish(base, "DENY", ["ENVELOPE_MISSING"], profile);
  if (envelopes.length !== 1) return finish(base, "DENY", ["ENVELOPE_SELECTION_CONTRADICTION"], profile);
  const envelope = envelopes[0];
  const reasons = selectedAuthorityReasons(intent, profile, envelope, Date.parse(base.decidedAt));
  if (reasons.length) return finish(base, "DENY", reasons, profile, envelope);
  if (profile.stepUpRisks.includes(intent.risk)) {
    return finish(base, "STEP_UP", ["AUTHORIZED_APPROVAL_REQUIRED"], profile, envelope);
  }
  return finish(base, "ALLOW", ["AUTHORITY_CONFIRMED"], profile, envelope);
}

export function revalidateSelectedAuthority(intent, decision, policy, clock) {
  const nowText = isoInstant(clock(), "handoff revalidation clock");
  const reasons = [];
  if (decision.agentId !== intent.agentId || decision.intentId !== intent.intentId || decision.action !== intent.action || decision.resource !== intent.resource || decision.risk !== intent.risk) {
    reasons.push("DECISION_INTENT_BINDING_MISMATCH");
  }
  if (decision.evidenceDigest !== sha256Canonical(intent.evidence)) reasons.push("DECISION_EVIDENCE_BINDING_MISMATCH");
  const profile = policy.profiles.find(({ id }) => id === decision.profileId);
  const envelope = policy.envelopes.find(({ id }) => id === decision.envelopeId);
  if (!profile) reasons.push("SELECTED_PROFILE_MISSING");
  if (!envelope) reasons.push("SELECTED_ENVELOPE_MISSING");
  if (profile && decision.profileVersion !== profile.version) reasons.push("SELECTED_PROFILE_VERSION_CHANGED");
  if (envelope && decision.envelopeVersion !== envelope.version) reasons.push("SELECTED_ENVELOPE_VERSION_CHANGED");
  if (profile && envelope) reasons.push(...selectedAuthorityReasons(intent, profile, envelope, Date.parse(nowText)));
  return deepFreeze({
    checkedAt: nowText,
    reasonCodes: [...new Set(reasons)],
    valid: reasons.length === 0,
  });
}
