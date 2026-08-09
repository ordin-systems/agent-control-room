# Agent Control Room Technical Evidence Index

- **Verified stage:** immutable, externally reviewable synthetic reference implementation
- **Release:** [`v0.1.0`](https://github.com/ordin-systems/agent-control-room/releases/tag/v0.1.0)
- **Release commit:** [`24bbb09176ec790000d05ffde382ed3c743f944a`](https://github.com/ordin-systems/agent-control-room/commit/24bbb09176ec790000d05ffde382ed3c743f944a)
- **Audited source commit:** [`0a93abac3e2353698c6f4dd1dc91043fb8e6b8bf`](https://github.com/ordin-systems/agent-control-room/commit/0a93abac3e2353698c6f4dd1dc91043fb8e6b8bf)
- **Source tree:** `2b68c31b68bc622b02c4eeee2f8b3a240537c99e`
- **Release evidence:** [`docs/release-evidence-v0.1.0.json`](release-evidence-v0.1.0.json)

This index maps the frozen CV’s Agent Control Room clauses to public source, named behavioral verifiers, machine-validated adversarial cases, and immutable release evidence. It does not claim operating-system interception, arbitrary execution, external permission mutation, production deployment, adoption, or distributed durability.

## Frozen-CV clause map

| Frozen CV clause | Public source | Named checks | Adversarial IDs | Public proof |
|---|---|---:|---|---|
| Execution-intent adapter contract | [`src/execution-intent.mjs`](../src/execution-intent.mjs), [`src/validation.mjs`](../src/validation.mjs) | 02 | `SCH-01–05`, `AUT-16–17`, `PUB-03` | Strict unknown/malformed-field rejection in CI and immutable source |
| Normalizes proposed actions | [`src/execution-intent.mjs`](../src/execution-intent.mjs) | 03 | `SCH-06–09`, `PUB-03`, `E2E-04` | Capability-safe idempotent normalization with injected clock/IDs |
| Evaluates task-scoped authority immediately before handoff | [`src/boundary.mjs`](../src/boundary.mjs), [`src/policy.mjs`](../src/policy.mjs) | 06, 08, 09, 11 | `AUT-14–17`, `APR-01–13`, `HND-02–07`, `E2E-02–03` | Authority is revalidated before synchronous approval consumption and handoff |
| Deterministically returns `ALLOW`, `DENY`, or `STEP_UP` | [`src/policy.mjs`](../src/policy.mjs) | 06–08 | `AUT-11–17`, `HND-11` | Separate fixed-fixture behavioral paths for all three outcomes |
| Permission profiles | [`src/policy.mjs`](../src/policy.mjs) | 04 | `SCH-10–11`, `AUT-01–10`, `PUB-03` | Scope, lifecycle, precedence, and version-binding tests |
| Task-authority envelopes | [`src/policy.mjs`](../src/policy.mjs) | 05 | `SCH-10–11`, `AUT-01–10`, `PUB-03` | Activity, expiry, revocation, freshness, scope, and profile/envelope version binding |
| Approval matching | [`src/approval.mjs`](../src/approval.mjs), [`src/boundary.mjs`](../src/boundary.mjs) | 09, 11 | `SCH-11`, `APR-01–13`, `HND-02–07`, `E2E-02–03` | Issuance provenance, authorized capability, semantic binding, expiry, and single use |
| No-handoff for `DENY` | [`src/boundary.mjs`](../src/boundary.mjs) | 10, 17 | `HND-01`, `E2E-01–02`, `E2E-04`, `PUB-03` | Executor call count is exactly zero and denial evidence is retained |
| No-handoff for unresolved `STEP_UP` | [`src/boundary.mjs`](../src/boundary.mjs) | 08, 11 | `AUT-14`, `APR-01–13`, `HND-02–07`, `E2E-02`, `PUB-03` | Missing, rejected, expired, unauthorized, mismatched, replayed, and redirected paths remain zero-call |
| Persistent reason-coded decision receipts | [`src/ledger.mjs`](../src/ledger.mjs), [`src/errors.mjs`](../src/errors.mjs) | 12–13 | `RCP-01–09`, `RCP-13`, `PUB-03` | Unique IDs, serialized shared-root append, atomic detail/index persistence, and stable reason codes |
| Receipt integrity | [`src/canonical-json.mjs`](../src/canonical-json.mjs), [`src/receipt-authenticator.mjs`](../src/receipt-authenticator.mjs), [`src/ledger.mjs`](../src/ledger.mjs) | 13–14 | `RCP-01–14`, `REC-01–04`, `PUB-03` | Canonical SHA-256, authenticated authority payloads, coherence checks, and tamper rejection |
| Approval objects | [`src/approval.mjs`](../src/approval.mjs) | 09 | `APR-01–13`, `E2E-03`, `PUB-03` | Issued request/approval identities, exact bindings, expiry, and atomic consumption |
| Recovery objects | [`src/recovery.mjs`](../src/recovery.mjs) | 14 | `RCP-10–12`, `RCP-14`, `REC-01–04`, `PUB-03` | Recovery Cases derive only from retained authenticated withheld-authority evidence |
| Explicit safe-canary handoff | [`src/executor.mjs`](../src/executor.mjs) | 15 | `HND-08–10`, `E2E-03`, `PUB-03` | Sole positive adapter is exact `FIXED_SAFE_CANARY`; malformed results fail closed |
| Canary-gated restoration | [`src/recovery.mjs`](../src/recovery.mjs) | 16 | `RST-01–11`, `E2E-03`, `PUB-03` | Adjacent-stage enforcement, current marker digest recheck, and foreign/stale proof rejection |
| Auditable path from proposed action through enforcement and recovery | boundary, ledger, approval, recovery modules | 14, 16–17 | `REC-01–04`, `RST-01–11`, `E2E-01–04`, `PUB-03` | End-to-end withheld-action fixture retains decision receipt and Recovery Case without execution |
| Literal 19-script verification suite | [`package.json`](../package.json), [`test/`](../test), [`scripts/verify.mjs`](../scripts/verify.mjs) | 01–19 | All 95 mapped IDs | Package metadata and check 01 enforce exactly 19 named entry points; aggregate prints only after all pass |
| Clean installation | [`package-lock.json`](../package-lock.json), [CI workflow](../.github/workflows/verify.yml) | 01, 19 | `PUB-02–04` | `npm ci --ignore-scripts` and aggregate verification pass on Node 20.19.0 and 22.12.0 |
| Behavioral enforcement | all runtime modules | 06–18 | `AUT`, `APR`, `HND`, `RCP`, `REC`, `RST`, `E2E`, `GOV` families | Positive and negative paths execute in named tests, including exact zero-call assertions |
| Recovery logic | [`src/recovery.mjs`](../src/recovery.mjs) | 14, 16 | `RCP-10–12`, `RCP-14`, `REC-01–04`, `RST-01–11` | Authenticated source derivation and ordered canary-gated restoration |
| Governance controls | [`src/governance.mjs`](../src/governance.mjs) | 18 | `GOV-01–06`, `PUB-01–03`, `E2E-04` | Authorized, separated, audit-digest-bound `draft → audit → human acceptance → promotion` transitions |
| Structural hardening | [`scripts/publication-scan.mjs`](../scripts/publication-scan.mjs), [threat model](threat-model.md) | 01, 18–19 | `PUB-01–04`, `E2E-04` | Runtime primitive scan, locked metadata, build/package proof, and independent external scanner `GO` |
| Production build | [`scripts/build.mjs`](../scripts/build.mjs), [`package.json`](../package.json) | 19 | `PUB-03–04` | Production ESM build and deterministic 32-file package verified on tag and immutable release asset |
| End-to-end destructive synthetic denial | [`test/cases.mjs`](../test/cases.mjs), boundary/ledger/recovery modules | 17 | `E2E-01–02`, `E2E-04`, `PUB-03` | Protected synthetic request returns `DENY`, executor remains zero, receipt and Recovery Case persist |

## Verification layers

| Stage | Identity | Evidence |
|---|---|---|
| Pre-commit candidate | source tree `2b68c31b…` | 19/19 checks, 95/95 map, Node 20/22, independent review closure |
| Audited public branch | commit `0a93abac…` | Push and PR CI; credential-free clone verification |
| Public `main` | merge `24bbb091…`, same tree | Main CI and external public-main scanner `GO` |
| Release tag | annotated tag object `9b2b8e3c…` | Tag CI and logged-out tag readback |
| Immutable release | `v0.1.0`, release ID `367559309` | Public API `immutable: true`; three locked assets with GitHub SHA-256 digests |
| Logged-out assets | package SHA-256 `44c93d43…82341` | Byte-identical download, 32-member archive inspection, blank-consumer install/import |

## Release assets

| Asset | ID | SHA-256 |
|---|---:|---|
| [`ordin-agent-control-room-public-reference-0.1.0.tgz`](https://github.com/ordin-systems/agent-control-room/releases/download/v0.1.0/ordin-agent-control-room-public-reference-0.1.0.tgz) | `507803822` | `44c93d431cbc829cd01b46abfcfd09980fba1f74f60d4ee619709018a3482341` |
| [`package-manifest-v0.1.0.json`](https://github.com/ordin-systems/agent-control-room/releases/download/v0.1.0/package-manifest-v0.1.0.json) | `507803823` | `3511a8436030b6dae76f6de292dfc6eefc37104b8044aa254f14b723d88ee807` |
| [`SHA256SUMS`](https://github.com/ordin-systems/agent-control-room/releases/download/v0.1.0/SHA256SUMS) | `507803820` | `c616b21a6311216fa3b8b5b121fb7dfee5b5825b0fc2abba8e1fd683bccdfe93` |

## Boundary

This evidence supports a release-ready, immutable, independently reproducible **synthetic local authority reference**. It does not establish a hosted deployment, real protected-system integration, production users, adoption, operating-system enforcement, arbitrary command control, external credential/permission management, or cryptographic signer identity.
