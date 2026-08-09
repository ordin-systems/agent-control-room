# Threat Model

## Protected invariant

No denied, unresolved, rejected, expired, unauthorized, mismatched, replayed or no-longer-current execution intent reaches the executor.

## Adversaries and failures considered

- malformed or unknown caller fields;
- caller-authored decision, authority ID or proof state;
- missing or conflicting profiles/envelopes;
- inactive, expired, revoked, stale or future-dated authority evidence;
- explicit deny combined with permissive rules;
- profile/envelope version drift;
- approval redirect, self-injection, unauthorized capability, rejection, expiry, mismatch or replay;
- authority expiring after decision but before handoff;
- substituted canary executor, malformed output or deleted marker artifact;
- duplicate receipt IDs, cross-instance concurrent appends, detail tampering and detail/index disagreement;
- Recovery Case derivation from forged, unauthenticated or incoherent evidence;
- skipped, stale, foreign or forged recovery stages;
- skipped governance review or changed artifact identity.

## Security controls

- strict plain-data schemas;
- deterministic fail-closed reason codes;
- evaluated IDs only;
- pre-handoff revalidation;
- one fixed executor adapter;
- exact executor call-count assertions;
- canonical content digests;
- trusted-host authority-receipt authentication;
- shared-root serialized atomic persistence;
- adjacent transition state machines;
- synthetic destructive tests;
- independent external publication scanner.

## Out of scope

The reference does not defend a compromised host, malicious Node runtime, malicious caller-controlled storage root, kernel-level attacker, distributed race across processes or remote authentication failure. It does not intercept operating-system commands or mediate production infrastructure.

The local file adapter performs practical symlink/path checks and serialized in-process writes. It does not claim distributed transactions, cross-process locking or public-key signer identity.
