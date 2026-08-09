# Decision Lifecycle

## 1. Intake

The adapter accepts exactly:

- `agentId`
- `action`
- `resource`
- `risk`
- `evidence.observedAt`
- `evidence.stateDigest`
- `evidence.contradictions`

Clock and intent ID are injected rather than caller-authored.

Normalization is idempotent only for the exact module-branded in-process normalized object. Supplying a serialized, cloned or caller-reconstructed object back to the raw-intent adapter is rejected because its injected `intentId` and `receivedAt` fields are not caller-authorized input. Determinism is also proven by normalizing equivalent raw inputs under equivalent injected dependencies.

## 2. Authority selection

The evaluator requires one registered agent, one matching profile and one matching task envelope. Results retain the selected IDs and versions.

## 3. Precedence

1. Missing, conflicting, unsupported or invalid authority denies.
2. Explicit policy/resource/action denial denies.
3. Protected actions deny.
4. Lifecycle, version, scope, contradiction or freshness failure denies.
5. A valid step-up risk produces `STEP_UP`.
6. Otherwise valid authority produces `ALLOW`.

## 4. Receipt before handoff

The decision and `ELIGIBLE` or `WITHHELD` disposition are persisted before the executor boundary.

## 5. Immediate revalidation

Immediately before a direct or approved handoff, the boundary checks the exact selected profile/envelope, versions, scope, lifecycle, intent binding and evidence freshness again without generating a replacement decision.

## 6. Handoff

- `DENY`: zero executor calls.
- unresolved `STEP_UP`: zero executor calls.
- approved `STEP_UP`: consume the exact request/approval once, then call only the fixed safe canary.
- `ALLOW`: call only the fixed safe canary.

## 7. Outcome evidence

A successful fixed canary produces a validated handoff receipt. Invalid executor output produces a failure receipt and cannot become canary proof.

## 8. Recovery

A verified withheld decision receipt may create a Recovery Case. Restoration remains local and requires every adjacent stage plus a fresh, case-bound executed-canary proof.
