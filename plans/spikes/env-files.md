# Spike: Per-action `.env` / `.env.local` selection

## Evidence

- `DESIGN.md` §11 explicitly defers per-action env file selection past MVP.
- Today: `action.envOverrides` in DB + runtime env merge in `supervisor.buildEnv`.
- Project **environments** already carry `env` maps (`packages/shared`, registry).

## Proposal

1. **Merge order**: `process.env` → selected dotenv file(s) relative to module cwd → environment map → `envOverrides`.
2. **UI**: ActionEditor multi-select of discovered `.env`, `.env.local`, `.env.development` in module tree.
3. **Storage**: new `envFiles: string[]` on action (or reuse envOverrides metadata).

## Security

- Resolve paths under project root only; reject `..` traversal.
- No secret scrubbing in logs (DESIGN non-goal).

## Open questions

- Support multiple files vs single pick?
- Interaction with environment feature when both set?

## Recommendation

**Ship next** — high daily friction; medium effort (M). Start with single `.env.local` picker + merge order spike in a follow-up plan 011.
