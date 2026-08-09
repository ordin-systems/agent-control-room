import { createHash } from "node:crypto";
import { fail } from "./errors.mjs";

function validateDataProperty(owner, key, label) {
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || descriptor.get || descriptor.set) {
    fail("NON_CANONICAL_VALUE", `${label} must contain only enumerable data properties`);
  }
  return descriptor.value;
}

function normalize(value, seen) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("NON_CANONICAL_NUMBER", "Canonical JSON requires finite numbers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") fail("NON_CANONICAL_VALUE", "Unsupported canonical JSON value");
  if (seen.has(value)) fail("CYCLIC_VALUE", "Canonical JSON cannot encode cycles");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) fail("NON_PLAIN_OBJECT", "Canonical arrays require the standard prototype");
      const allowedKeys = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string" || !allowedKeys.has(key)) fail("NON_CANONICAL_VALUE", "Canonical arrays cannot contain extra or symbolic properties");
      }
      const output = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) fail("SPARSE_ARRAY", "Canonical arrays cannot contain holes");
        output.push(normalize(validateDataProperty(value, String(index), `array[${index}]`), seen));
      }
      return output;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      fail("NON_PLAIN_OBJECT", "Canonical JSON accepts only standard plain objects");
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) fail("NON_CANONICAL_VALUE", "Canonical objects cannot contain symbolic keys");
    const output = {};
    for (const key of keys.sort()) {
      const item = validateDataProperty(value, key, `object.${key}`);
      if (item === undefined) fail("UNDEFINED_VALUE", `Undefined value at ${key}`);
      output[key] = normalize(item, seen);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value, new Set()));
}

export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
