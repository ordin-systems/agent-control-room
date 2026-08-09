# Reason-Code Registry

The independent adversarial catalog proposed semantic code names before implementation. This reference publishes the stable implementation vocabulary below. Tests assert these codes rather than free-text messages.

## Schema

| Catalog family | Stable implementation code |
|---|---|
| unknown/caller authority field | `UNKNOWN_FIELD` |
| missing field | `MISSING_FIELD` |
| invalid identifier/type/timestamp | `MALFORMED_FIELD` |
| unsupported action/resource/risk | `UNSUPPORTED_VALUE` at intake |
| duplicate nested identity | `DUPLICATE_AGENT`, `DUPLICATE_PROFILE_ID`, `DUPLICATE_ENVELOPE_ID`, `DUPLICATE_APPROVER`, `DUPLICATE_VALUE` |

## Authority

| Condition | Stable code |
|---|---|
| agent missing | `AGENT_NOT_REGISTERED` |
| profile/envelope missing | `PROFILE_MISSING`, `ENVELOPE_MISSING` |
| ambiguous selection | `PROFILE_SELECTION_CONTRADICTION`, `ENVELOPE_SELECTION_CONTRADICTION` |
| inactive/expired/revoked | `PROFILE_*`, `ENVELOPE_*` lifecycle suffixes |
| future/stale evidence | `*_EVIDENCE_FROM_FUTURE`, `*_EVIDENCE_STALE` |
| version mismatch | `PROFILE_VERSION_MISMATCH` |
| explicit deny | `PROFILE_ACTION_DENIED`, `PROFILE_RESOURCE_DENIED` |
| protected action | `PROTECTED_ACTION_DENIED` |
| out of scope | `*_ACTION_NOT_ALLOWED`, `*_RESOURCE_NOT_ALLOWED` |
| contradiction | `EVIDENCE_CONTRADICTION` |
| allow | `AUTHORITY_CONFIRMED` |
| step-up | `AUTHORIZED_APPROVAL_REQUIRED` |

## Approval and handoff

- `APPROVAL_REDIRECT`
- `APPROVAL_MISSING`
- `APPROVAL_NOT_ISSUED`
- `APPROVAL_ISSUED_CONTENT_MISMATCH`
- `APPROVAL_BINDING_MISMATCH`
- `APPROVAL_SELF_INJECTION`
- `APPROVER_UNAUTHORIZED`
- `APPROVAL_REJECTED`
- `APPROVAL_EXPIRED`
- `APPROVAL_EXPIRY_MISMATCH`
- `APPROVAL_REPLAY`
- `APPROVAL_REQUEST_ALREADY_CONSUMED`
- `AUTHORITY_REVALIDATION_FAILED`
- `NO_EXECUTOR_ADAPTER`
- `INVALID_EXECUTOR`
- `UNSUPPORTED_EXECUTOR_COMMAND`
- `CANARY_EXECUTION_FAILED`
- `CANARY_ARTIFACT_INVALID`
- `CANARY_ARTIFACT_MISMATCH`
- `CANARY_DIGEST_MISMATCH`

## Persistence

- `DUPLICATE_RECEIPT_ID`
- `RECEIPT_AUTHORITY_INCOHERENT`
- `RECEIPT_AUTHORITY_ID_MISMATCH`
- `LEDGER_INDEX_INVALID`
- `RECEIPT_TAMPERED`
- `LEDGER_DIGEST_MISMATCH`
- `RECEIPT_ID_MISMATCH`
- `RECEIPT_TIME_MISMATCH`
- `UNSAFE_STORAGE_PATH`
- `UNSAFE_STORAGE_SYMLINK`

## Recovery and governance

Recovery uses `RECOVERY_*` and `CANARY_*` codes, including `RECOVERY_SOURCE_INVALID`, `RECOVERY_ORDER_VIOLATION`, `RECOVERY_APPROVAL_REQUIRED`, `CANARY_BINDING_MISMATCH`, `CANARY_STALE`, `CANARY_RESULT_TAMPERED` and `CANARY_APPROVAL_NOT_CONSUMED`.

Unauthenticated or forged retained authority receipts fail with `RECOVERY_SOURCE_UNAUTHENTICATED`. A deleted, unreadable or mismatched marker fails with `CANARY_ARTIFACT_INVALID`.

Governance uses `GOVERNANCE_*`, including `GOVERNANCE_ORDER_VIOLATION`, `GOVERNANCE_ARTIFACT_MISMATCH`, `GOVERNANCE_EVIDENCE_MISSING`, `GOVERNANCE_EVIDENCE_MISMATCH` and `GOVERNANCE_NOT_ACCEPTED`.

Identity and review binding use `GOVERNANCE_REVIEWER_UNAUTHORIZED`, `GOVERNANCE_HUMAN_UNAUTHORIZED` and `GOVERNANCE_REVIEW_DIGEST_MISMATCH`.

## Ordering

Decision reason arrays are deduplicated in deterministic evaluation order. Explicit policy and protected-action denials are recorded before allow/step-up resolution. Any nonempty denial array prevents `ALLOW` and `STEP_UP`.
