import { createHmac, timingSafeEqual } from "node:crypto";
import { deepFreeze, canonicalJson } from "./canonical-json.mjs";
import { fail } from "./errors.mjs";
import { exactObject, requireDigest } from "./validation.mjs";

const AUTHORITY_RECEIPT_KEYS = [
  "approvalRequest", "authorityProof", "decision", "handoffDisposition", "intent", "reasonCodes", "type",
];

export function validateAuthorityDecisionPayload(payload, { requireProof = true } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.type !== "authority_decision") return;
  const keys = requireProof
    ? AUTHORITY_RECEIPT_KEYS
    : AUTHORITY_RECEIPT_KEYS.filter((key) => key !== "authorityProof");
  try {
    exactObject(payload, keys, "authority receipt payload");
    if (requireProof) requireDigest(payload.authorityProof, "authorityProof");
    if (!payload.decision || !payload.intent || !["ALLOW", "DENY", "STEP_UP"].includes(payload.decision.outcome)) {
      fail("RECEIPT_AUTHORITY_INCOHERENT", "Authority decision payload is incomplete");
    }
    const expectedDisposition = payload.decision.outcome === "ALLOW" ? "ELIGIBLE" : "WITHHELD";
    if (payload.handoffDisposition !== expectedDisposition) {
      fail("RECEIPT_AUTHORITY_INCOHERENT", "Decision and handoff disposition disagree");
    }
    for (const key of ["action", "agentId", "intentId", "resource", "risk"]) {
      if (payload.decision[key] !== payload.intent[key]) {
        fail("RECEIPT_AUTHORITY_ID_MISMATCH", `Authority receipt ${key} disagrees with evaluated intent`);
      }
    }
    if (payload.decision.outcome === "STEP_UP" && payload.approvalRequest === null) {
      fail("RECEIPT_AUTHORITY_INCOHERENT", "STEP_UP receipt requires its retained approval request");
    }
    if (payload.decision.outcome !== "STEP_UP" && payload.approvalRequest !== null) {
      fail("RECEIPT_AUTHORITY_INCOHERENT", "Non-STEP_UP receipt cannot retain an approval request");
    }
  } catch (error) {
    if (["RECEIPT_AUTHORITY_INCOHERENT", "RECEIPT_AUTHORITY_ID_MISMATCH"].includes(error?.code)) throw error;
    fail("RECEIPT_AUTHORITY_INCOHERENT", "Authority decision receipt schema is incoherent");
  }
}

export class AuthorityReceiptAuthenticator {
  #key;

  constructor(key) {
    if (typeof key !== "string" || key.length < 24 || key.length > 4096) {
      fail("AUTHORITY_RECEIPT_KEY_INVALID", "Authority receipt key must be a bounded trusted-host value");
    }
    this.#key = Buffer.from(key, "utf8");
  }

  attach(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.hasOwn(payload, "authorityProof")) {
      fail("AUTHORITY_RECEIPT_PAYLOAD_INVALID", "Authority receipt payload is invalid");
    }
    validateAuthorityDecisionPayload(payload, { requireProof: false });
    const body = structuredClone(payload);
    return deepFreeze({ ...body, authorityProof: this.#sign(body) });
  }

  verify(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    try {
      validateAuthorityDecisionPayload(payload);
      const proof = payload.authorityProof;
      const body = structuredClone(payload);
      delete body.authorityProof;
      const expected = this.#sign(body);
      return timingSafeEqual(Buffer.from(proof, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  }

  #sign(payload) {
    return createHmac("sha256", this.#key).update(canonicalJson(payload)).digest("hex");
  }
}
