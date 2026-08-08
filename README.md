# Agent Control Room

**Execution-Boundary Authority Control for Agentic Systems**

> **Publication status:** Evidence landing page. A sanitized public reference extraction, synthetic fixtures, public CI, verification receipts, and a versioned reference release are being prepared. This repository does not yet contain the public reference source.

Agent Control Room is a local reference implementation for evaluating task-scoped authority immediately before a proposed action is handed to a downstream executor. Its bounded decision path returns deterministic `ALLOW`, `DENY`, or `STEP_UP` outcomes and withholds handoff for denied or unresolved requests.

## Intended public proof chain

```text
normalized execution intent
→ task-scoped authority evaluation
→ ALLOW / DENY / STEP_UP
→ handoff or no handoff
→ reason-coded decision receipt
→ approval or recovery path
```

## Locally verified scope being prepared for publication

- Execution-intent adapter contract and deterministic normalization
- Permission profiles and task-authority envelopes
- Approval matching and unresolved step-up handling
- No-handoff enforcement for denied and unresolved requests
- Reason-coded decision, approval, and recovery objects
- Safe-canary handoff and canary-gated restoration
- Synthetic destructive-action denial, unresolved step-up, and allowlisted-canary paths

These results are not yet independently reproducible from this repository. Public source, fixtures, tests, CI output, and release artifacts will be added only after sanitation and rights review pass.

## Claim boundary

**Accurate:** local execution-boundary reference implementation that evaluates task-scoped authority and withholds downstream execution handoff for denied or unresolved requests.

**Not claimed:** operating-system interception, interruption of already-running commands, production credential brokerage, enforcement across external services, public production deployment, scale, or independent validation.

## Ownership

Agent Control Room is canonically maintained by [ORDIN](https://github.com/ordin-systems). It was architected and engineered by [Mike “Mizzy” Barrera](https://github.com/mizzysworld).

## Planned public release gates

- Fresh-history sanitized extraction
- Secret, private-path, provenance, rights, and third-party review
- Synthetic fixtures only
- Clean locked installation
- Behavioral tests and production build
- Public GitHub Actions
- Architecture, threat model, evidence map, limitations, security, and reproducibility documentation
- Commit-bound verification receipt and `v0.1.0-reference` release
