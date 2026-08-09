# Provenance

## Clean-room boundary

This public reference was reconstructed from a written claim-and-acceptance contract in a new branch of the existing public repository.

- No private Agent Control Room source file was copied into this candidate.
- No private Git history was imported, grafted or merged.
- Fixtures use synthetic identities, resources, actions, timestamps and digests.
- Generated runtime receipts and canary artifacts are written only to test-owned temporary directories outside the source tree.
- The public baseline ancestry remains the existing public repository history.

## First-party material

All runtime modules, test cases, documentation and verification scripts in this candidate are first-party clean-room work for ORDIN unless a file states otherwise.

## Dependencies

The runtime has no third-party dependencies. Node.js and npm are build/test prerequisites. Dependency identity is locked in `package-lock.json`; CI action identity is pinned in the workflow.

## Review rule

A clean-room origin does not itself prove correctness. Behavioral claims require the named verifiers, independent external publication scan, clean installation, build/package proof, reviewer approval and logged-out public readback.
