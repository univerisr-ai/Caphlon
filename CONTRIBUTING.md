# Contributing to Caphlon

Thanks for stopping by! This project runs on three hard rules:

1. **No rewrites.** Caphlon wires REAL upstream tools (OpenCode, Aider, …);
   it never reimplements them. New capability = new wiring, not new clones.
2. **No fake-green.** A feature ships only with a test that proves it, and a
   claim ships only with a measurement behind it. Untested behavior does not
   get merged.
3. **Honest labels.** Components carry Core / Conditional / Experimental
   status in the README — keep them truthful when you change things.

## Dev setup

```bash
git clone https://github.com/demiralpdev/Caphlon.git && cd Caphlon
bash scripts/setup-cores.sh          # fetches real tools + builds (idempotent)
cd packages/caphlon
npm test && npm run typecheck        # 129+ tests should be green
node bin/caphlon.js doctor           # end-to-end sanity
```

Python (hive/Merkez) tests: `cd core && python3 -m unittest`

## PRs

- One focused change per PR; include/update tests.
- CI must be green (typecheck + TS tests + hive stdlib tests + docker build).
- Turkish or English both welcome in issues/PRs.
