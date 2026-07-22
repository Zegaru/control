# Spike: Finish detection markers from DESIGN

## Evidence

| Marker | DESIGN | `scanner.ts` |
|--------|--------|--------------|
| package.json / compose / Makefile / Cargo / Go / pyproject | ✅ | ✅ |
| justfile | listed | ❌ |
| Expo / RN (`app.json`, `metro.config.js`) | listed | ❌ |
| `.claude/launch.json` | highest-confidence | ✅ done (plan 036) |
| turbo/nx/lerna workspace expansion | open question §12 | ❌ |

## Priority order

1. **`.claude/launch.json`** — ✅ done (plan 036): explicit dev-server entries imported as primary actions.
2. **pnpm/npm workspace package globs** — monorepo onboarding gap.
3. **justfile** — parse targets matching `dev|start|serve`.
4. **Expo** — lower priority; noisier heuristics.

## Open question (DESIGN §12)

Turbo root `dev` vs per-module scripts → detect both; let favorites decide.

## Recommendation

**`.claude/launch.json` is implemented.** Next: workspace glob expansion (M–L), then justfile targets.
