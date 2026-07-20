# Spike: Cross-platform host port attribution

## Evidence

- `hostPorts.ts:42` returns `[]` when `platform !== 'win32'`.
- Windows path uses PowerShell `Get-NetTCPConnection` + process cmdline for project attribution.
- `DESIGN.md` NFR-1: Windows first; macOS/Linux deferred.
- `ports.ts` WSL2 precedence: Docker API wins over host netstat — must preserve when adding parsers.

## Proposal

| Platform | Probe |
|----------|-------|
| macOS | `lsof -nP -iTCP -sTCP:LISTEN` |
| Linux | `ss -lptn` or `lsof` |

Shared `HostPort` shape unchanged. Pure parser unit tests with fixture stdout (no live OS in CI).

## Risks

- Wrong attribution on Docker bridge / WSL2 edge cases — reuse Windows precedence tests as reference.

## Recommendation

**Defer** until Windows path stable and a maintainer can manual-test on macOS/Linux (L). Parser-only spike can land earlier without enabling by default.
