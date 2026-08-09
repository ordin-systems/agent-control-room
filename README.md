# Agent Control Room

**Sanitized local execution-boundary authority reference**

> **Status:** pre-release public-reference candidate. Source, synthetic fixtures and exactly 19 named behavioral verifiers are present. This branch is not yet the immutable public release.

Agent Control Room demonstrates a deterministic, repo-local authority gate before a bounded handoff. It turns a strict execution intent into `ALLOW`, `DENY` or `STEP_UP`; retains reason-coded evidence; and proves that denied or unresolved work reaches the executor exactly zero times.

## What this reference proves

- Strict execution-intent and nested policy schemas reject unknown, malformed and caller-authored authority fields.
- Permission profiles and task-authority envelopes are selected deterministically and checked for profile/envelope version binding, activity, expiry, revocation, scope and evidence freshness.
- Explicit denial dominates `STEP_UP` and `ALLOW`.
- Results and receipts identify only the profile and envelope actually evaluated.
- `STEP_UP` approvals bind the request, agent, action, resource, evaluated profile/envelope IDs and versions, decision, evidence, approver capability `acr.approve_handoff` and expiry.
- An approval request and approval ID are single-use. Authority is revalidated immediately before consumption and handoff.
- `DENY`, missing, rejected, expired, unauthorized, mismatched and replayed approvals call the executor exactly zero times.
- The only positive executor boundary is the symbolic `FIXED_SAFE_CANARY` adapter. There is no generic command, path, argument or payload surface.
- Receipts use canonical JSON and SHA-256 content digests, unique IDs, atomic detail/index persistence and tamper verification.
- Recovery Cases derive from retained withheld gate evidence and enforce adjacent, canary-gated local restoration stages.
- Governance enforces `draft → audit → human acceptance → promotion` against one artifact identity.

## Quick verification

Requirements: Node `^20.19.0 || >=22.12.0` and npm `10.9.8`.

```bash
npm ci --ignore-scripts
npm run verify
```

`npm run verify` runs format and syntax checks, the candidate publication scan, exactly 19 named verifiers, the production ESM build, package proof, dependency audit and `git diff --check`.

See [Reproducibility](REPRODUCIBILITY.md) and [the 19-script suite](docs/19-script-suite.md).

## Architecture

```text
strict intent
  → deterministic normalization
  → profile + task-envelope authority
  → ALLOW | DENY | STEP_UP
  → immediate pre-handoff revalidation
  → fixed safe canary or zero handoff
  → canonical receipt ledger
  → retained-evidence Recovery Case
  → ordered local-only restoration
```

Core runtime code has no network listener/client, shell/process execution, `eval`, dynamic function construction, payment, wallet, model-provider or external permission integration.

## Claim boundary

This is a **repo-local pre-handoff reference**, not an operating-system enforcement product.

It does not:

- Does not intercept the operating system.
- Does not interrupt an already-running command.
- Does not execute arbitrary or protected actions.
- Does not mutate external permissions.
- Does not control unmanaged agents.
- Does not broker credentials.
- Does not listen for or send webhooks.
- Does not make outbound runtime network calls.
- Does not accept payments or implement x402.
- Does not deploy or restart production systems.
- Does not provide cryptographic signatures or distributed durability.

The fixed canary is the sole executable demonstration. Receipt SHA-256 digests provide content-integrity detection, not signer identity or external attestation.

See [Claims and limitations](CLAIMS_AND_LIMITATIONS.md) and [Threat model](docs/threat-model.md).

## Evidence map

Reviewer paths are indexed in [docs/evidence-map.md](docs/evidence-map.md). The implementation is synthetic and clean-room reconstructed; see [PROVENANCE.md](PROVENANCE.md).

## Rights

`UNLICENSED` — all rights reserved. No permission to copy, modify, distribute or use is granted except by written authorization from ORDIN.
