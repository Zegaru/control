# CONTROL Design System

Industrial skeuomorphic UI for a local dev command center. Dark rack-mounted hardware aesthetic: recessed CRT screens, beveled modules, physical rockers and knobs, LED status signaling.

## Principles

1. **Signal colors for state only** — phosphor = healthy/running, amber = starting/warn, red = failed/master power, muted gray = idle/stopped, blue = informational.
2. **Depth over flatness** — use inset highlights, deep recess shadows, and bezel gradients. Active elements glow.
3. **Monospace for data** — logs, ports, timestamps, metrics use `--font-mono`. Labels and chrome use `--font-ui` (uppercase, tracked).
4. **Rack module layout** — sidebar nav | top CRT row | project card row | bottom control strip.
5. **Rack module layout** — sidebar nav | top CRT row | project card row | bottom control strip. Host/project CPU and memory gauges on Overview are wired to daemon metrics APIs.

## Tokens

Defined in [`src/index.css`](src/index.css).

| Token | Role |
|-------|------|
| `--color-bezel` | Deepest chassis background |
| `--color-panel` | Recessed screen / module face |
| `--color-panel-raised` | Raised module housing |
| `--color-panel-edge` | Rivet lines, borders |
| `--color-phosphor` | Healthy / running |
| `--color-phosphor-dim` | Running (secondary) |
| `--color-amber` | Starting / warning |
| `--color-danger` | Failed / master power |
| `--color-danger-glow` | Red glow for master power |
| `--color-info` | Info / network / gauges |
| `--color-ink` / `-dim` / `-faint` | Text hierarchy |
| `--font-mono` | Data, logs, ports |
| `--font-ui` | Labels, nav, chrome |

### Spacing rhythm

- Module gap: `24px` (`gap-6`)
- Inner panel padding: `16px` (`p-4`)
- Chip radius: `4px`, rocker height: `56px` (`h-14`)

### Utility classes

| Class | Use |
|-------|-----|
| `.bezel-recessed` | Inset module / screen housing |
| `.bezel-raised` | Protruding panel frame |
| `.glow-phosphor` / `.glow-amber` / `.glow-danger` | Text or box glow by signal |
| `.crt` | Scanline CRT screen texture |
| `.text-glow` | Phosphor text shadow |

## Component inventory

All primitives live in [`src/components/kit.tsx`](src/components/kit.tsx).

### Status & data

| Component | Props (key) | Mockup role |
|-----------|-------------|-------------|
| `Led` | `status`, `pulse?`, `ring?` | Service status dot |
| `Chip` | `tone`, `children` | Port tags |
| `SegmentCounter` | `value`, `label`, `tone` | Running/Starting/Failed tiles |
| `Sparkline` | `data`, `label`, `unit?` | CPU/Mem/Disk mini charts |
| `statusColor` / `statusLabel` | — | Helpers for run status |

### Panels & screens

| Component | Props (key) | Mockup role |
|-----------|-------------|-------------|
| `Panel` | `title?`, `right?`, `crt?` | Beveled module housing |
| `TerminalScreen` | `children`, `footer?` | Event log CRT body |

### Controls

| Component | Props (key) | Mockup role |
|-----------|-------------|-------------|
| `RockerToggle` | `on`, `busy?`, `onToggle` | Project ON/OFF |
| `MasterPower` | `on`, `onToggle`, `disabled?` | Red ALL SYSTEMS rocker |
| `BacklitButton` | `tone`, `size?`, `children` | START ALL / STOP ALL etc. |
| `RotaryKnob` | `value`, `label`, `size?` | Per-project CPU/MEM/DISK |
| `CircularGauge` | `value`, `label` | Bottom system health rings |

### Navigation & shell

| Component | Props (key) | Mockup role |
|-----------|-------------|-------------|
| `NavItem` | `icon`, `label`, `active`, `onClick` | Sidebar nav (amber active) |
| `AgentStatus` | `online`, `label?` | Sidebar footer + waveform (`AgentStatus.tsx`) |

### Compositions

| Component | Props (key) | Mockup role |
|-----------|-------------|-------------|
| `ProjectModule` | `name`, `path`, `on`, `onToggle`, `services`, `metrics?`, `variant?` | Project card module (`ProjectModule.tsx`) |
| `ControlStrip` | `masterOn`, `onMasterToggle`, `actions`, `gauges`, `notifications?` | Bottom rack strip (`ControlStrip.tsx`) |

## View mapping

| Mockup zone | Current file | Components to adopt |
|-------------|--------------|---------------------|
| Sidebar | `App.tsx` | `NavItem`, `AgentStatus` |
| System Status CRT | `Dashboard.tsx` | `Panel` + `crt`, `SegmentCounter`, `Sparkline`, `Chip` |
| Event Logs | `Dashboard.tsx` | `TerminalScreen` |
| Project cards | `Dashboard.tsx` | `ProjectModule` |
| Bottom control strip | *(new)* | `ControlStrip` |
| Docker / Ports / Groups | respective views | `Panel`, `Led`, `Chip` |

## Kitchen sink (visual QA)

Import and render once during development to verify primitives:

```tsx
import {
  Led, Panel, RockerToggle, Chip, SegmentCounter, Sparkline,
  TerminalScreen, RotaryKnob, CircularGauge, BacklitButton, MasterPower,
  NavItem,
} from './components/kit.js'
import {AgentStatus} from './components/AgentStatus.js'
import {ProjectModule} from './components/ProjectModule.js'
import {ControlStrip} from './components/ControlStrip.js'

// Led row: idle, starting (pulse), healthy, failed
// Panel crt + SegmentCounter grid + Sparkline row
// RockerToggle on/off + MasterPower
// RotaryKnob + CircularGauge at 42
// BacklitButton tones: default, phosphor, amber, danger
// ProjectModule default + add variant
// ControlStrip with placeholder actions/gauges
```

## Do / Don't

**Do**
- Use phosphor glow sparingly on primary metrics and active LEDs
- Keep uppercase tracked labels at 10–11px for hardware chrome
- Prefer `bezel-recessed` for screen interiors, `bezel-raised` for module frames

**Don't**
- Use signal colors for decoration (no random green text)
- Flatten panels to single-border cards
- Add cards in hero/overview zones without interaction purpose
- Wire master power to destructive actions without explicit product decision

## Next UI pass checklist

- [x] Replace sidebar buttons in `App.tsx` with `NavItem` + `AgentStatus`
- [x] Add `Sparkline` + stopped counter to System Status panel
- [x] Migrate active runs list to `TerminalScreen` row format
- [x] Replace project card buttons with `ProjectModule`
- [x] Mount `ControlStrip` at bottom of overview
- [x] Wire real CPU/mem metrics into Overview gauges (`api.hostMetrics` / `api.projectMetrics`)
