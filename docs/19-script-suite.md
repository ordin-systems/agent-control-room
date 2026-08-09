# 19-Script Verification Suite

Every `check:NN` package script launches one named Node test entry point. The entry point invokes only its corresponding behavioral case.

| Check | Invariant |
|---:|---|
| 01 | Locked package metadata and dependency manifest |
| 02 | Strict execution-intent and nested policy schemas |
| 03 | Capability-safe idempotent normalization with injected clock/IDs |
| 04 | Permission-profile scope and lifecycle |
| 05 | Task-envelope scope, lifecycle and version binding |
| 06 | Deterministic `ALLOW` and evaluated IDs |
| 07 | Deterministic explicit/protected `DENY` |
| 08 | Deterministic `STEP_UP` and withheld handoff |
| 09 | Issued approval identity, semantic binding and request-level single use |
| 10 | Denied executor call count equals zero |
| 11 | Missing/rejected/expired/unauthorized/mismatched step-up call count equals zero |
| 12 | Concurrent persistent receipt ledger across shared-root instances |
| 13 | Strict canonical data, receipt digest and tamper detection |
| 14 | Recovery Case derivation from authenticated retained evidence |
| 15 | Sole concrete fixed safe-canary executor |
| 16 | Adjacent canary-gated local restoration with marker-artifact recheck |
| 17 | Destructive synthetic end-to-end denial and recovery evidence |
| 18 | Authorized, audit-bound governance and runtime publication hardening |
| 19 | Production ESM build and bounded package proof |

## Aggregate command

```bash
npm run verify
```

The aggregate runner executes format, lint, candidate scan, checks 01–19, build, package proof, dependency audit and diff check. It exits on the first failure and prints `19/19` only after every named check succeeds.

The machine-readable [adversarial catalog map](adversarial-catalog-map.json) binds all 95 independent catalog IDs to one or more named behavioral verifiers and records the exact catalog SHA-256. Check 01 rejects count, identity, status or verifier-reference drift.

See [the reason-code registry](reason-code-registry.md) for the stable implementation vocabulary and its mapping from the independent catalog’s proposed names.

## Integrity rule

A verifier is not counted merely because a filename or string exists. `package.json` must expose exactly 19 `check:NN` entries, and each entry launches the named behavioral test.
