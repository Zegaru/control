# Security Policy

## Supported versions

Report vulnerabilities against the `main` branch or the latest tagged release
when tags exist. CONTROL is pre-1.0 — fixes are best-effort on the current
tip.

## Threat model (intentional)

CONTROL is a **local-first, single-developer** tool:

- The daemon binds **loopback only** (`127.0.0.1`, `localhost`, or `::1` via
  `CONTROL_HOST`). Non-loopback binds are rejected.
- **No authentication** in v1 (localhost trust). Any local user or process that
  can reach the daemon can list projects, start/stop runs, and read logs.
- Run logs may contain secrets from child processes. They are stored under
  `CONTROL_DATA_DIR` (default `~/.control`) with retention caps; there is **no
  scrubbing** in v1.
- Do **not** expose the daemon on a non-loopback interface or tunnel it to a
  shared network.

“The daemon has no auth on localhost” is **by design**, not a vulnerability,
unless you can also show a bind/escape onto a non-loopback interface or another
issue beyond this documented model.

## Reporting a vulnerability

Open a **private** [GitHub Security Advisory](https://github.com/Zegaru/control/security/advisories/new)
on this repository. Please do not file a public issue for an undisclosed
vulnerability.

Include:

- CONTROL version or git commit
- OS and Node version
- Steps to reproduce
- Impact (for example SSRF, bind escape, path traversal)

## Out of scope

- Missing authentication while bound to loopback (documented above)
- Secrets appearing in user project logs that CONTROL stores as-is
- Issues that require changing the product into a multi-user remote service
