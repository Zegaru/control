# Changelog

All notable changes to CONTROL are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] — 2026-07-22

### Added

- Vendored Node 22 in the Windows shell — desktop users no longer need Node on PATH
- Portable zip (`Control-*-portable-win-x64.zip`) alongside the NSIS installer

### Fixed

- Parallel Vitest SQLite lock on Ubuntu CI
- Port chips not opening
- Unblock pnpm dev on Windows

## [0.1.0] — 2026-07-22

### Added

- Local-first daemon (Hono + WebSocket + SQLite) supervising host processes and Docker stacks
- React UI: dashboard, project detail, port map, Docker view, launch groups, command palette
- Tauri Windows shell with tray, autostart, and NSIS installer (`Control_*_x64-setup.exe`)
- MIT license, security policy, contributing guide, and CI on Ubuntu + Windows

[Unreleased]: https://github.com/Zegaru/control/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Zegaru/control/releases/tag/v0.1.1
[0.1.0]: https://github.com/Zegaru/control/releases/tag/v0.1.0
