# Reproducibility

## Supported runtimes

- Node `^20.19.0 || >=22.12.0`
- npm `10.9.8`
- CI: clean Ubuntu runners on Node `20.19.0` and `22.12.0`

## Clean verification

```bash
npm ci --ignore-scripts
npm run verify
```

The aggregate command runs:

1. format check;
2. syntax lint;
3. candidate publication scan;
4. exactly 19 named behavioral verifiers;
5. production ESM build;
6. bounded package dry-run and member check;
7. `npm audit --audit-level=high`;
8. `git diff --check`.

## Isolated artifact locations

Behavioral tests create receipt ledgers and canary evidence under operating-system temporary directories and remove them afterward. The production build writes only declared `dist/` output, which is excluded from source control.

## Expected result

The aggregate command must finish with:

```text
aggregate verification passed: 19/19 named checks
```

A local pass is not sufficient for publication. Release evidence also requires:

- external scanner and policy hashes;
- clean worktree and exact commit/tree identity;
- clean clone without local hard links or object alternates;
- audited package/source archive hashes;
- independent specification and security review;
- immutable tag/release identity;
- logged-out clone, download, hash verification and rerun.

## Determinism boundary

Clock and ID generation are injected. With identical policy, intent, fixture clock and ID sequence, normalized intents, decisions and canonical receipt content are deterministic. Filesystem atomicity is bounded to the documented local file-storage adapter; no distributed durability is claimed.
