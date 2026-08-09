import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { canonicalJson, deepFreeze, sha256Canonical } from "./canonical-json.mjs";
import { fail } from "./errors.mjs";
import { exactObject, isoInstant, nonEmptyString, requireDigest } from "./validation.mjs";
import { validateAuthorityDecisionPayload } from "./receipt-authenticator.mjs";

const namedAppendTails = new Map();
const objectAppendTails = new WeakMap();

function relativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || isAbsolute(value)
    || value.startsWith("/") || posix.normalize(value) !== value || value.split("/").includes("..")) {
    fail("UNSAFE_STORAGE_PATH", "Ledger paths must be normalized relative paths");
  }
  return value;
}

export class NodeFileStorage {
  constructor(root) {
    if (typeof root !== "string" || !isAbsolute(root)) fail("INVALID_STORAGE_ROOT", "Storage root must be absolute");
    this.root = resolve(root);
    this.concurrencyKey = `node-file-storage:${this.root}`;
  }

  path(relative) {
    const safe = relativePath(relative);
    const target = resolve(join(this.root, safe));
    if (!target.startsWith(`${this.root}/`)) fail("UNSAFE_STORAGE_PATH", "Storage path escaped root");
    return target;
  }

  async assertNoSymlink(relative, { allowMissing = false } = {}) {
    const safe = relativePath(relative);
    const paths = [this.root];
    let current = this.root;
    for (const part of safe.split("/")) {
      current = join(current, part);
      paths.push(current);
    }
    for (const candidate of paths) {
      try {
        const item = await lstat(candidate);
        if (item.isSymbolicLink()) fail("UNSAFE_STORAGE_SYMLINK", "Storage path contains a symbolic link");
      } catch (error) {
        if (error.code === "ENOENT" && allowMissing) return;
        throw error;
      }
    }
  }

  async exists(relative) {
    try {
      await this.assertNoSymlink(relative);
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }

  async read(relative) {
    await this.assertNoSymlink(relative);
    return readFile(this.path(relative), "utf8");
  }

  async writeAtomic(relative, content, nonce) {
    const target = this.path(relative);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await this.assertNoSymlink(relative, { allowMissing: true });
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await this.assertNoSymlink(relative, { allowMissing: true });
    const temporary = `${target}.${nonEmptyString(nonce, "atomic nonce")}.tmp`;
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    try {
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async remove(relative) {
    await this.assertNoSymlink(relative, { allowMissing: true });
    await rm(this.path(relative), { force: true });
  }
}

function parseJson(text, code, message) {
  try {
    return JSON.parse(text);
  } catch {
    fail(code, message);
  }
}

function validateIndex(index) {
  exactObject(index, ["entries", "version"], "ledger index");
  if (index.version !== 1) fail("LEDGER_INDEX_INVALID", "Ledger index version is invalid");
  if (!index.entries || typeof index.entries !== "object" || Array.isArray(index.entries)
    || Object.getPrototypeOf(index.entries) !== Object.prototype) {
    fail("LEDGER_INDEX_INVALID", "Ledger index entries are invalid");
  }
  for (const [receiptId, entry] of Object.entries(index.entries)) {
    nonEmptyString(receiptId, "indexed receipt ID");
    exactObject(entry, ["detailPath", "digest", "recordedAt"], "ledger index entry");
    relativePath(entry.detailPath);
    requireDigest(entry.digest, "ledger index digest");
    isoInstant(entry.recordedAt, "ledger index recordedAt");
  }
  return index;
}

function validateDetail(detail) {
  exactObject(detail, ["content", "digest"], "receipt detail");
  exactObject(detail.content, ["payload", "receiptId", "recordedAt"], "receipt content");
  nonEmptyString(detail.content.receiptId, "receipt detail ID");
  isoInstant(detail.content.recordedAt, "receipt detail recordedAt");
  requireDigest(detail.digest, "receipt detail digest");
  return detail;
}

export class ReceiptLedger {
  constructor(storage, { clock, idGenerator }) {
    this.storage = storage;
    this.clock = clock;
    this.idGenerator = idGenerator;
    this.indexPath = "ledger/index.json";
  }

  async readIndex() {
    if (!(await this.storage.exists(this.indexPath))) return { entries: {}, version: 1 };
    return validateIndex(parseJson(
      await this.storage.read(this.indexPath),
      "LEDGER_INDEX_INVALID",
      "Ledger index JSON is invalid",
    ));
  }

  append(payload) {
    const key = typeof this.storage.concurrencyKey === "string" ? this.storage.concurrencyKey : this.storage;
    const tails = typeof key === "string" ? namedAppendTails : objectAppendTails;
    const previous = tails.get(key) ?? Promise.resolve();
    const operation = previous.then(() => this.#appendOnce(payload));
    const settled = operation.catch(() => undefined);
    tails.set(key, settled);
    settled.finally(() => {
      if (tails.get(key) === settled) tails.delete(key);
    });
    return operation;
  }

  async #appendOnce(payload) {
    validateAuthorityDecisionPayload(payload);
    const receiptId = nonEmptyString(this.idGenerator("receipt"), "injected receipt id");
    const recordedAt = isoInstant(this.clock(), "receipt clock");
    const detailPath = `ledger/receipts/${receiptId}.json`;
    const index = await this.readIndex();
    if (index.entries[receiptId] || await this.storage.exists(detailPath)) {
      fail("DUPLICATE_RECEIPT_ID", "Receipt IDs are immutable and unique");
    }
    const content = deepFreeze({ payload: structuredClone(payload), receiptId, recordedAt });
    const detail = { content, digest: sha256Canonical(content) };
    const nextIndex = structuredClone(index);
    nextIndex.entries[receiptId] = { detailPath, digest: detail.digest, recordedAt };
    const nonce = nonEmptyString(this.idGenerator("atomic"), "injected atomic id");
    await this.storage.writeAtomic(detailPath, `${canonicalJson(detail)}\n`, nonce);
    try {
      await this.storage.writeAtomic(this.indexPath, `${canonicalJson(nextIndex)}\n`, `${nonce}-index`);
    } catch (error) {
      await this.storage.remove(detailPath);
      throw error;
    }
    return deepFreeze({ digest: detail.digest, receiptId, recordedAt });
  }

  async get(receiptId) {
    nonEmptyString(receiptId, "receiptId");
    const index = await this.readIndex();
    const entry = index.entries[receiptId];
    if (!entry) fail("RECEIPT_NOT_FOUND", "Receipt is not indexed");
    relativePath(entry.detailPath);
    const detail = validateDetail(parseJson(
      await this.storage.read(entry.detailPath),
      "RECEIPT_DETAIL_INVALID",
      "Receipt detail JSON is invalid",
    ));
    const computed = sha256Canonical(detail.content);
    if (computed !== detail.digest) fail("RECEIPT_TAMPERED", "Receipt content digest failed verification");
    if (entry.digest !== detail.digest) fail("LEDGER_DIGEST_MISMATCH", "Index and detail digests disagree");
    if (detail.content.receiptId !== receiptId) fail("RECEIPT_ID_MISMATCH", "Receipt detail identity mismatch");
    if (detail.content.recordedAt !== entry.recordedAt) fail("RECEIPT_TIME_MISMATCH", "Index and detail timestamps disagree");
    return deepFreeze(structuredClone({ ...detail.content, digest: detail.digest }));
  }
}
