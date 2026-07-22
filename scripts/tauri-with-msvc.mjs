#!/usr/bin/env node
/**
 * Run the Tauri CLI with the MSVC environment loaded on Windows.
 * (Native crates like vswhom-sys need cl.exe — Git Bash / Cursor terminals
 * usually don't have the VS toolchain on PATH.)
 *
 * Usage: node scripts/tauri-with-msvc.mjs build|dev|...
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const shellRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'shell')
const repoRoot = join(shellRoot, '..', '..')
const tauriArgs = withProfileConfig(process.argv.slice(2))
if (tauriArgs.length === 0) {
  console.error('Usage: node scripts/tauri-with-msvc.mjs <tauri-args...>')
  process.exit(1)
}

/** Dev shell uses the monorepo checkout, not the staged runtime copy. */
if (tauriArgs[0] === 'dev') {
  process.env.CONTROL_HOME = repoRoot
}

/** Dev uses the monorepo checkout; release bundles the staged runtime. */
function withProfileConfig(args) {
  if (args.includes('--config') || args.includes('-c')) return args
  const sub = args[0]
  if (sub === 'build') {
    const releaseConfig = join('src-tauri', 'tauri.release.conf.json')
    if (existsSync(join(shellRoot, releaseConfig))) {
      return [sub, '--config', releaseConfig, ...args.slice(1)]
    }
  }
  return args
}

function findVcvars64() {
  const vswhere = join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe',
  )
  if (existsSync(vswhere)) {
    const r = spawnSync(
      vswhere,
      [
        '-latest',
        '-products',
        '*',
        '-requires',
        'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
        '-property',
        'installationPath',
      ],
      { encoding: 'utf8' },
    )
    const install = (r.stdout || '').trim()
    if (install) {
      const bat = join(install, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat')
      if (existsSync(bat)) return bat
    }
  }

  const fallbacks = [
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Auxiliary\\Build\\vcvars64.bat',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat',
  ]
  return fallbacks.find((p) => existsSync(p)) ?? null
}

function runDirect() {
  const r = spawnSync('pnpm', ['exec', 'tauri', ...tauriArgs], {
    cwd: shellRoot,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  process.exit(r.status ?? 1)
}

function batEscape(s) {
  // Escape for use inside double-quoted cmd.exe strings.
  return s.replace(/"/g, '""')
}

if (process.platform !== 'win32') {
  runDirect()
} else if (process.env.VCINSTALLDIR || process.env.VSCMD_ARG_TGT_ARCH) {
  runDirect()
} else {
  const vcvars = findVcvars64()
  if (!vcvars) {
    console.error(
      '[tauri-with-msvc] cl.exe / vcvars64.bat not found.\n' +
        'Install “Desktop development with C++” (VS 2022 or Build Tools), then retry.',
    )
    process.exit(1)
  }
  console.log('[tauri-with-msvc] loading MSVC via', vcvars)

  const quotedArgs = tauriArgs.map((a) => `"${batEscape(a)}"`).join(' ')
  const lines = [
    '@echo off',
    `call "${batEscape(vcvars)}"`,
    `if errorlevel 1 exit /b %errorlevel%`,
    `cd /d "${batEscape(shellRoot)}"`,
    `pnpm exec tauri ${quotedArgs}`,
    'exit /b %errorlevel%',
    '',
  ]

  const dir = mkdtempSync(join(tmpdir(), 'control-tauri-'))
  const bat = join(dir, 'run.cmd')
  try {
    writeFileSync(bat, lines.join('\r\n'), 'utf8')
    const r = spawnSync('cmd.exe', ['/d', '/c', bat], {
      cwd: shellRoot,
      stdio: 'inherit',
      env: process.env,
    })
    process.exit(r.status ?? 1)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // ignore cleanup failures
    }
  }
}
