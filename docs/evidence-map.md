# Public Evidence Map

| Frozen-CV clause | Source | Named checks | Reviewer evidence |
|---|---|---|---|
| Execution-intent adapter and deterministic normalization | `src/execution-intent.mjs`, `src/validation.mjs` | 02, 03 | Unknown/malformed rejection; canonical deterministic fixture |
| Permission profiles and task-authority envelopes | `src/policy.mjs` | 04, 05 | Scope, profile/envelope version binding, activity, expiry, revocation and freshness cases |
| `ALLOW`, `DENY`, `STEP_UP` | `src/policy.mjs` | 06, 07, 08 | One explicit behavioral path per decision |
| Approval matching and consumption | `src/approval.mjs`, `src/boundary.mjs` | 09, 11 | Identity/capability, semantic binding, expiry, replay and request single use |
| No handoff for denied/unresolved work | `src/boundary.mjs` | 10, 11, 17 | Executor call count exactly zero |
| Persistent reason-coded receipts | `src/ledger.mjs` | 12, 13 | Concurrent cardinality; detail/index digest tamper failure |
| Approval and Recovery Case objects | approval and recovery modules | 09, 14 | Derived IDs/digests and invalid-source rejection |
| Explicit safe-canary handoff | `src/executor.mjs` | 15 | Fixed command shape and malformed-result failure |
| Ordered canary-gated restoration | `src/recovery.mjs` | 16 | Skip/foreign proof rejection and local-only final state |
| Auditable action-to-recovery chain | boundary, ledger, recovery | 14, 17 | Withheld authority receipt to bound Recovery Case |
| 19-script verification suite | `package.json`, `test/`, `scripts/verify.mjs` | 01–19 | Exact named entry points and aggregate receipt |
| Behavioral enforcement | all runtime modules | 06–18 | Positive and negative executable assertions |
| Receipt integrity | `src/canonical-json.mjs`, `src/ledger.mjs` | 12, 13 | SHA-256 recomputation and disagreement rejection |
| Recovery and governance | recovery/governance modules | 14, 16, 18 | Adjacent executable state transitions |
| Structural hardening and build | scripts, workflow, package metadata | 01, 18, 19 | Lock, runtime primitive scan, build/package proof |
| Destructive synthetic E2E withheld handoff | boundary/ledger/recovery | 17 | Protected action denied, executor zero, receipt and Recovery Case retained |

## Independent release evidence

Release `v0.1.0` closed the prior external gates:

- exact public-main and recursive package scanner results: `GO`, zero findings;
- clean `npm ci --ignore-scripts` and aggregate verification under Node `20.19.0` and `22.12.0`;
- independent specification/security finding reconciliation and a final consistency-review `PASS`;
- source tree, package-member manifest and release-asset SHA-256 identities;
- annotated tag and public API `immutable: true` release state;
- credential-free public clone plus logged-out, byte-identical asset download and blank-consumer import.

See the [Technical Evidence Index](technical-evidence-index.md) and [machine-readable release evidence](release-evidence-v0.1.0.json).

See `CLAIMS_AND_LIMITATIONS.md` for the boundary on every claim.
