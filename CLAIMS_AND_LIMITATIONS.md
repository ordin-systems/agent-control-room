# Claims and Limitations

## Supported public claims

| Claim | Implementation | Behavioral evidence | Boundary |
|---|---|---|---|
| Strict execution-intent adapter and normalization | `src/execution-intent.mjs`, `src/validation.mjs` | Checks 02–03 | Rejects unknown and malformed fields; injected clock/IDs |
| Permission-profile and task-envelope authority | `src/policy.mjs` | Checks 04–05 | Repo-local synthetic policy only |
| Deterministic `ALLOW`, `DENY`, `STEP_UP` | `src/policy.mjs` | Checks 06–08 | Explicit deny and protected-action denial dominate |
| Authorized approval matching and consumption | `src/approval.mjs`, `src/boundary.mjs` | Checks 09, 11 | Binds evaluated IDs and complete request semantics; single use |
| No handoff on denied/unresolved work | `src/boundary.mjs` | Checks 10–11, 17 | Executor call count is exactly zero |
| Persistent reason-coded receipts | `src/ledger.mjs` | Checks 12–13 | Local file adapter, canonical SHA-256 integrity, no signature |
| Approval and Recovery Case objects | `src/approval.mjs`, `src/recovery.mjs` | Checks 09, 14 | Derived from retained local evidence |
| Explicit safe-canary handoff | `src/executor.mjs` | Check 15 | Sole fixed adapter; no arbitrary command/payload |
| Canary-gated restoration | `src/recovery.mjs` | Check 16 | Adjacent local-state transitions only |
| Action-to-receipt recovery chain | boundary, ledger and recovery modules | Checks 14, 17 | Reviewer-visible synthetic chain |
| Executable governance | `src/governance.mjs` | Check 18 | Draft, audit, human acceptance, promotion |
| 19-script verification and build/package proof | `package.json`, `test/`, `scripts/` | Checks 01–19 | Clean Node/npm reference environment |

## Explicit non-claims

This reference does not claim or provide:

- Does not perform operating-system interception.
- Does not interrupt already-running commands.
- Does not perform arbitrary, generic or protected-action execution.
- Does not mutate external permissions.
- Does not control unmanaged agents.
- Does not broker or store credentials.
- Does not listen for webhooks, deliver callbacks or make outbound runtime integrations.
- Does not implement payment, wallet or x402 behavior.
- Does not integrate model providers or inference services.
- Does not deploy or restart production systems.
- Does not provide distributed persistence or consensus.
- Does not administer remote policy through authentication.
- Does not provide cryptographic signatures, portable credentials or external attestation.

## Integrity language

A receipt digest is SHA-256 over canonical local content. It supports tamper detection when detail and index are read through this implementation. It is not a signature, MAC, notarization or proof of who created the receipt.

## Release status

Implementation parity is not the same as public-evidence parity. Public substantiation requires an immutable release, passing CI, independent external scan, exact hashes and logged-out readback. Until those gates pass, this branch remains a candidate rather than final public evidence.
