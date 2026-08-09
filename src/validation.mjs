import { fail } from "./errors.mjs";

export function exactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("MALFORMED_FIELD", `${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("MALFORMED_FIELD", `${label} must be a plain object`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) {
    fail("UNKNOWN_FIELD", `${label} has symbol fields`);
  }
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      fail("MALFORMED_FIELD", `${label} fields must be enumerable data properties`);
    }
  }
  const actual = ownKeys.sort();
  const expected = [...keys].sort();
  const unknown = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !actual.includes(key));
  if (unknown.length) fail("UNKNOWN_FIELD", `${label} has unknown fields`, { fields: unknown });
  if (missing.length) fail("MISSING_FIELD", `${label} is missing fields`, { fields: missing });
  return value;
}

export function nonEmptyString(value, label, pattern = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/) {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail("MALFORMED_FIELD", `${label} must be a bounded identifier`);
  }
  return value;
}

export function isoInstant(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    fail("MALFORMED_FIELD", `${label} must be an ISO instant`);
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    fail("MALFORMED_FIELD", `${label} must be a canonical ISO instant`);
  }
  return value;
}

export function booleanValue(value, label) {
  if (typeof value !== "boolean") fail("MALFORMED_FIELD", `${label} must be boolean`);
  return value;
}

export function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("MALFORMED_FIELD", `${label} must be a non-negative safe integer`);
  }
  return value;
}

export function oneOf(value, allowed, label) {
  nonEmptyString(value, label);
  if (!allowed.includes(value)) fail("UNSUPPORTED_VALUE", `${label} is unsupported`);
  return value;
}

export function stringArray(value, label, { allowed = null, unique = false } = {}) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    fail("MALFORMED_FIELD", `${label} must be an array of non-empty strings`);
  }
  if (unique && new Set(value).size !== value.length) {
    fail("DUPLICATE_VALUE", `${label} must contain unique values`);
  }
  if (allowed && value.some((item) => !allowed.includes(item))) {
    fail("UNSUPPORTED_VALUE", `${label} contains an unsupported value`);
  }
  return value;
}

export function requireDigest(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    fail("MALFORMED_FIELD", `${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}
