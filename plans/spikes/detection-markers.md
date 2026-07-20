# Spike: Finish detection markers from DESIGN

## Evidence

| Marker | DESIGN | `scanner.ts` |
|--------|--------|--------------|
| package.json / compose / Makefile / Cargo / Go / pyproject | ✅ | ✅ |
| justfile | listed | ❌ |
| Expo / RN (`app.json`, `metro.config.js`) | listed | ❌ |
| `.claude/launch.json` | highest-confidence | ❌ |
| turbo/nx/lerna workspace expansion | open question §11 | ❌ |

## Priority order

1. **`.claude/launch.json`** — explicit dev-server entries, lowest false-positive rate.
2. **pnpm/npm workspace package globs** — monorepo onboarding gap.
3. **justfile** — parse targets matching `dev|start|serve`.
4. **Expo** — lower priority; noisier heuristics.

## Open question (DESIGN §11)

Turbo root `dev` vs per-module scripts → detect both; let favorites decide.

## Recommendation

**First implementation PR: `.claude/launch.json` only** (M). Follow with workspace glob expansion (M–L).
