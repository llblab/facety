# Dead-code removal: 2026-10-23

**Diagnostic preservation, not a mechanism confirmation.** Owner instruction: remove verified dead code without routine approval requests. The canonical implementation remains `src/accountability.mjs` plus shared dispute/model primitives.

Removed the disconnected `src/relay.mjs`, `src/trace.mjs`, `src/walkthroughs.mjs` component: **three files, 638 source lines**. Inspection found imports only within that component; no CLI, example, test or retained study imported it. The private package has no library exports. Dead prototype controls were removed from the current inventory, not merged into protocol rules. Their complete source remains available in commit `71242626e532f0a3e08aa7c3bd987d962afef000`.

## Preservation boundary

[preservation.mjs](preservation.mjs) extracts the previous committed source into an isolated temporary directory and compares it with the current checkout. It asserts that the only source differences are the three deletions, then compares every retained field except provenance in all **10 named walkthroughs and 288 paired runs**, including the retained historical raw outputs. It also verifies all **116 pre-existing study files** byte-for-byte against that commit.

The source digest changes from `1338b35c06a19c668b833b84fa6f15f9152c98082e811efee672ab64f421d3fb` (28 modules) to `5affbad3eda494794d9aea8308cccaaca6a8c14bf43229cf76a8bf94afb556b5` (25). No remaining source module, protocol default, random generator, logical random-key layout, or behavioral policy changed. [preservation.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-dead-code/preservation.json) retains the measured identities and output digests.

Old artifacts keep their original provenance. Consequently, `studies/2026-10-23-causal-core/run.mjs --check` correctly refuses a provenance-exact replay on this new source tree. Run it at commit `7124262` in a separate checkout/worktree. The new differential check proves bounded semantic preservation; it does not weaken that refusal or transfer historical confirmation status.

## Reproduce

```sh
npm test
node studies/2026-10-23-dead-code/preservation.mjs
node studies/2026-10-23-causal-core/preservation.mjs
bash /home/llb/.agents/skills/domain-dag/scripts/validate-domain-dag.sh --root .
NO_COLOR=1 node /home/llb/.agents/skills/abcd-context/scripts/validate-context.mjs /home/llb/Repos/facety
git diff --check
```

[validation.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-dead-code/validation.json) binds the actual results and source identity; raw test output is retained separately. No old research artifact was rewritten, no protocol choice was selected, and no new numerical effect or universal external compatibility is claimed. Future changes to surviving source intentionally make the exact-source assertion fail until independently assessed.
