import {useEffect, useRef} from 'react';
import {cn} from '../lib/cn.js';
import {Led} from './kit.js';

const AGENT_WAVE_W = 120;
const AGENT_WAVE_H = 24;
const AGENT_WAVE_MID = 12;
const AGENT_WAVE_SAMPLES = 56;

function nextAgentSample(prev: number): number {
  const roll = Math.random();
  if (roll < 0.07) return AGENT_WAVE_MID - (5 + Math.random() * 9);
  if (roll < 0.12) return AGENT_WAVE_MID + (4 + Math.random() * 8);
  if (roll < 0.2) return AGENT_WAVE_MID + (Math.random() - 0.5) * 5;
  if (roll < 0.28) return AGENT_WAVE_MID + (prev - AGENT_WAVE_MID) * 0.55;
  return AGENT_WAVE_MID + (prev - AGENT_WAVE_MID) * 0.25 + (Math.random() - 0.5) * 1.4;
}

function agentSamplesToPoints(samples: number[]): string {
  const last = Math.max(samples.length - 1, 1);
  return samples
    .map((y, i) => {
      const x = (i / last) * AGENT_WAVE_W;
      const clamped = Math.min(AGENT_WAVE_H - 1, Math.max(1, y));
      return `${x.toFixed(1)},${clamped.toFixed(1)}`;
    })
    .join(' ');
}

export function AgentStatus({online, label}: {online: boolean; label?: string}) {
  const waveRef = useRef<SVGPolylineElement>(null);

  useEffect(() => {
    if (!online) return;
    const samples = Array.from({length: AGENT_WAVE_SAMPLES}, () => AGENT_WAVE_MID);
    let frame = 0;
    let lastTick = 0;

    const tick = (now: number) => {
      if (now - lastTick >= 55) {
        lastTick = now;
        samples.push(nextAgentSample(samples[samples.length - 1] ?? AGENT_WAVE_MID));
        samples.shift();
        waveRef.current?.setAttribute('points', agentSamplesToPoints(samples));
      }
      frame = requestAnimationFrame(tick);
    };

    waveRef.current?.setAttribute('points', agentSamplesToPoints(samples));
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [online]);

  return (
    <div className="bezel-recessed rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Led status={online ? 'healthy' : 'failed'} pulse={online} ring />
        <span
          className={cn(
            'font-ui min-w-0 flex-1 truncate text-[10px] uppercase tracking-[0.16em]',
            online ? 'text-phosphor text-glow' : 'text-ink-dim'
          )}
        >
          {label ?? (online ? 'CONTROL Online' : 'CONTROL Offline')}
        </span>
        <span
          className={cn(
            'font-ui shrink-0 text-[8px] uppercase tracking-[0.18em]',
            online ? 'text-phosphor/70' : 'text-danger/70'
          )}
        >
          {online ? 'Live' : 'Down'}
        </span>
      </div>
      <div className="crt-well mt-2 overflow-hidden rounded-sm px-1.5 py-1.5">
        {online ? (
          <svg
            viewBox={`0 0 ${AGENT_WAVE_W} ${AGENT_WAVE_H}`}
            preserveAspectRatio="none"
            className="block h-5 w-full"
            aria-hidden
          >
            <polyline
              ref={waveRef}
              points={agentSamplesToPoints(
                Array.from({length: AGENT_WAVE_SAMPLES}, () => AGENT_WAVE_MID)
              )}
              fill="none"
              stroke="var(--color-phosphor)"
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{
                filter:
                  'drop-shadow(0 0 3px var(--color-phosphor)) drop-shadow(0 0 8px var(--color-phosphor))',
              }}
            />
          </svg>
        ) : (
          <svg
            viewBox="0 0 80 24"
            preserveAspectRatio="none"
            className="block h-5 w-full"
            aria-hidden
          >
            <line
              x1="0"
              y1="12"
              x2="80"
              y2="12"
              stroke="var(--color-danger)"
              strokeWidth={1.25}
              strokeOpacity={0.35}
              strokeDasharray="3 4"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
