# Persistence Contract

## Storage model

`ReceiptLedger` uses an injected absolute storage root. Every stored reference beneath that root is normalized and relative.

```text
ledger/
  index.json
  receipts/
    <receipt-id>.json
```

Tests use fresh operating-system temporary directories and remove them afterward.

## Detail integrity

Each detail contains:

- `content.payload`
- `content.receiptId`
- `content.recordedAt`
- SHA-256 over canonical `content`

Canonical JSON sorts object keys, rejects unsupported values and normalizes finite numeric edge cases.

## Index integrity

Each index entry binds:

- receipt ID;
- relative detail path;
- detail digest;
- recorded time.

Reads verify the index and detail schemas, recompute the content digest, and compare receipt ID, digest and recorded time across both surfaces.

## Write behavior

- receipt IDs are unique and immutable;
- duplicate detail/index IDs fail;
- in-process appends are serialized;
- detail is written to a unique temporary file and renamed;
- index replacement is atomic at the local filesystem boundary;
- if index persistence fails, the newly written detail is removed;
- symlink, absolute, traversal and backslash paths fail closed.

## Boundaries

This is local file persistence, not a database or distributed ledger. SHA-256 supports tamper detection but is not a signature. Cross-process locking, remote durability, replication, authenticated writers and crash-proof multi-file transactions are not claimed.
