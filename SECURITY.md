# Security

## Supported scope

Security review applies to the latest immutable reference release and its exact commit, tag and attached evidence manifest. The current feature branch is a pre-release candidate.

## Reporting

Do not include credentials, private customer data or exploit payloads in a public issue. Contact the repository owner through an authorized private ORDIN channel and provide:

- affected release/tag and commit;
- relevant verifier or module;
- bounded reproduction using synthetic data;
- expected and actual decision/handoff behavior.

## Security invariants

- Unknown or malformed authority inputs fail closed.
- Explicit denial dominates.
- Lifecycle-invalid or contradictory authority cannot allow handoff.
- Caller-supplied authority IDs cannot replace evaluated IDs.
- Approval identity, capability, complete semantic binding, expiry and single-use consumption are checked immediately before handoff.
- `DENY` and unresolved `STEP_UP` call the executor zero times.
- Only the fixed safe-canary adapter is executable.
- Receipt details and index entries are content-bound and tamper-checked.
- Recovery and governance transitions cannot be skipped.

## Non-claims

This repository does not provide production deployment, OS interception, generic execution, remote administration, credential storage, network enforcement, signing-service trust or distributed persistence.

Receipt digests detect content changes inside this reference’s local trust boundary. They are not signatures and do not establish external author identity.
