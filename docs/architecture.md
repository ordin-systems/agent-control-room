# Architecture

## Components

### Strict adapter

`execution-intent.mjs` accepts one exact intent schema. `validation.mjs` rejects unknown, missing, inherited, accessor, symbol and malformed fields before authority evaluation.

### Deterministic authority core

`policy.mjs` selects exactly one permission profile and one task-authority envelope for the agent. It evaluates known action/resource/risk enums, versions, scope, explicit denial, activity, expiry, revocation, policy evidence freshness, intent evidence freshness and contradictions.

The only outcomes are:

- `ALLOW` — current authority permits the fixed safe canary without additional approval;
- `DENY` — authority is missing, invalid, contradictory, stale, out of scope or explicitly denied;
- `STEP_UP` — current authority requires an authorized human approval before the fixed canary.

### Approval authority

`approval.mjs` creates a request from the evaluated decision and envelope. Approval validation binds every security-relevant field, verifies that the trusted store issued the exact approval, and checks authorized approver capability, status, expiry and single-use state.

### Handoff boundary

`boundary.mjs` retains the decision receipt before any handoff. It revalidates the selected authority immediately before direct or approved handoff. `executor.mjs` exposes one fixed safe-canary method and validates the complete returned proof.

### Persistence

`ledger.mjs` writes canonical receipt details and one index atomically through an injected local storage root. Appends are serialized across every ledger instance sharing the same storage root. Reads recompute SHA-256 and compare detail/index identity, time and digest.

### Recovery

`receipt-authenticator.mjs` attaches a trusted-host HMAC to authority receipts before persistence. `recovery.mjs` verifies that proof before deriving a Recovery Case and rechecks that the fixed canary marker artifact still exists and matches immediately before accepting a pass. It enforces:

```text
OPEN
→ EVIDENCE_RETAINED
→ AUTHORITY_RECONFIRMED
→ CANARY_EXECUTED
→ CANARY_PASSED
→ RESTORED_LOCAL_ONLY
```

### Governance

`governance.mjs` separately binds one artifact to configured reviewer and human allowlists. Human acceptance binds the canonical retained audit digest before promotion:

```text
DRAFT → AUDITED → ACCEPTED → PROMOTED
```

## Trust boundary

The runtime is an in-process reference library. A trusted host supplies policy state, injected clock/ID providers, authority-receipt authentication key, local storage root and the fixed executor implementation. Untrusted intent callers do not receive those constructor capabilities. No remote service, authentication server or external policy administrator is included.
