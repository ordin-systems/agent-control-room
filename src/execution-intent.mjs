import { deepFreeze } from "./canonical-json.mjs";
import { exactObject, isoInstant, nonEmptyString, oneOf, requireDigest, stringArray } from "./validation.mjs";

const INTENT_KEYS = ["action", "agentId", "evidence", "resource", "risk"];
const EVIDENCE_KEYS = ["contradictions", "observedAt", "stateDigest"];
const normalizedIntents = new WeakSet();

export function normalizeExecutionIntent(raw, { clock, idGenerator }) {
  if (raw && typeof raw === "object" && normalizedIntents.has(raw)) return raw;
  exactObject(raw, INTENT_KEYS, "execution intent");
  exactObject(raw.evidence, EVIDENCE_KEYS, "execution intent evidence");
  nonEmptyString(raw.agentId, "agentId");
  oneOf(raw.action, ["FIXED_SAFE_CANARY", "delete_records", "restore_protected_state"], "action");
  oneOf(raw.resource, ["local:reference"], "resource");
  oneOf(raw.risk, ["low", "moderate", "high", "destructive"], "risk");
  isoInstant(raw.evidence.observedAt, "evidence.observedAt");
  requireDigest(raw.evidence.stateDigest, "evidence.stateDigest");
  stringArray(raw.evidence.contradictions, "evidence.contradictions");
  const receivedAt = isoInstant(clock(), "injected clock");
  const intentId = nonEmptyString(idGenerator("intent"), "injected intent id");
  const normalized = deepFreeze({
    action: raw.action,
    agentId: raw.agentId,
    evidence: {
      contradictions: [...new Set(raw.evidence.contradictions)].sort(),
      observedAt: raw.evidence.observedAt,
      stateDigest: raw.evidence.stateDigest,
    },
    intentId,
    receivedAt,
    resource: raw.resource,
    risk: raw.risk,
  });
  normalizedIntents.add(normalized);
  return normalized;
}
