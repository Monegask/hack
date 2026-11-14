# Archived security review evidence

These are immutable copies from the separate audit branch, retained with their original conclusions and source-SHA boundaries. Later positive retests do not rewrite earlier findings. Some baseline references refer to the original audit snapshot; current integration evidence starts with RELEASE-616e870-RETEST.md.

Run only the current positive gates against the current checkout. From repository root in PowerShell:

```powershell
$env:AUDIT_PVP_ROOT = (Resolve-Path prototypes/logistics-race/pvp).Path
node --test docs/release/mainnet-v1/security-baseline/pr-tests/r08-queue-path-retest.test.mjs
node --test --test-skip-pattern='EXPOSURE R08' docs/release/mainnet-v1/security-baseline/pr-tests/v2-policy-recovery.test.mjs docs/release/mainnet-v1/security-baseline/pr-tests/release-mitigations.test.mjs
```

The other files preserve historical attack reproductions. A passing EXPOSURE assertion demonstrates an old/open problem, while its failure on repaired code may be expected. Do not count that as a positive release gate or run historical assertions blindly as the current regression suite.

Original audit commits: baseline 638c7d5; 4149986 review 41987e9; 564c0b4 retest dae7b06; 1bf3fd7 review 4388054; 80d09e0 review 1042c16; final runtime retest 7f704a8. No production, real money or user credential was used in the review.
