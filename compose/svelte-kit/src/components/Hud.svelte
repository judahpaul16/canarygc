<script lang="ts">
  import {
    mavBatteryStore,
    mavSatelliteStore,
    mavModeStore,
    mavArmedStateStore
  } from '../stores/mavlinkStore';
  import {
    smoothRollStore,
    smoothPitchStore,
    smoothHeadingStore,
    smoothAltitudeStore,
    smoothSpeedStore
  } from '../lib/smooth-telemetry';

  let { compact = false, transparent = false }: { compact?: boolean; transparent?: boolean } =
    $props();

  const PX_PER_DEG = 3; // vertical pixels per degree of pitch
  const CX = 160;
  const CY = 90;

  const roll = $derived($smoothRollStore);
  const pitch = $derived($smoothPitchStore);
  const heading = $derived((((Math.round($smoothHeadingStore) % 360) + 360) % 360));
  const altitude = $derived($smoothAltitudeStore);
  const speed = $derived($smoothSpeedStore);
  const battery = $derived($mavBatteryStore);
  const sats = $derived($mavSatelliteStore);
  const mode = $derived($mavModeStore);
  const armed = $derived($mavArmedStateStore);

  const horizonTransform = $derived(
    `rotate(${-roll} ${CX} ${CY}) translate(0 ${pitch * PX_PER_DEG})`
  );

  const pitchRungs = [-30, -20, -10, 10, 20, 30];
  const rollTicks = [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60];

  // A vertical tape: ticks around the current value, one every `step`, labeled
  // every `labelEvery`. y grows downward, so a higher value sits higher up.
  function tape(value: number, step: number, count: number, labelEvery: number) {
    const base = Math.round(value / step) * step;
    const out: { v: number; y: number; label: string | null }[] = [];
    for (let i = -count; i <= count; i++) {
      const tickVal = base + i * step;
      const y = CY + (value - tickVal) * (34 / (step * count));
      out.push({
        v: tickVal,
        y,
        label: tickVal % labelEvery === 0 ? String(Math.round(tickVal)) : null
      });
    }
    return out.filter((t) => t.y > 6 && t.y < CY * 2 - 6);
  }

  const speedTape = $derived(tape(speed, 2, 6, 10));
  const altTape = $derived(tape(altitude, 5, 6, 20));

  const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  // Horizontal heading tape: ticks every 15 degrees across a ~120 degree window.
  const headingTape = $derived(
    Array.from({ length: 17 }, (_, i) => {
      const deg = (Math.round(heading / 15) * 15 + (i - 8) * 15 + 360) % 360;
      const delta = ((deg - heading + 540) % 360) - 180;
      const x = CX + delta * 1.6;
      const card = deg % 45 === 0 ? CARDINALS[deg / 45] : null;
      return { x, deg, card };
    }).filter((t) => t.x > 44 && t.x < 276)
  );

  const batteryColor = $derived(
    battery === null ? '#9aa' : battery > 40 ? '#4ade80' : battery > 15 ? '#fbbf24' : '#f87171'
  );
</script>

<div class="hud" class:transparent class:compact>
  <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Attitude indicator" class:over-video={transparent}>
    <defs>
      <clipPath id="hud-clip"><rect x="0" y="0" width="320" height="180" /></clipPath>
    </defs>

    <g clip-path="url(#hud-clip)">
      <g transform={horizonTransform}>
        {#if !transparent}
          <rect x="-260" y="-620" width="840" height="710" fill="#2f7fd1" />
          <rect x="-260" y={CY} width="840" height="620" fill="#8a5a2b" />
        {/if}
        <line x1="-260" y1={CY} x2="580" y2={CY} stroke="#fff" stroke-width="1.4" />
        {#each pitchRungs as deg (deg)}
          {@const y = CY - deg * PX_PER_DEG}
          <line x1={CX - (deg % 20 === 0 ? 22 : 12)} y1={y} x2={CX + (deg % 20 === 0 ? 22 : 12)} y2={y} stroke="#fff" stroke-width="1" />
          {#if deg % 20 === 0}
            <text x={CX - 30} y={y + 3} class="rung">{Math.abs(deg)}</text>
            <text x={CX + 30} y={y + 3} class="rung" text-anchor="end">{Math.abs(deg)}</text>
          {/if}
        {/each}
      </g>
    </g>

    <!-- Roll arc and rotating pointer -->
    <g transform="rotate({-roll} {CX} {CY})">
      {#each rollTicks as t (t)}
        <line
          x1={CX + 74 * Math.sin((t * Math.PI) / 180)}
          y1={CY - 74 * Math.cos((t * Math.PI) / 180)}
          x2={CX + (t % 30 === 0 ? 66 : 70) * Math.sin((t * Math.PI) / 180)}
          y2={CY - (t % 30 === 0 ? 66 : 70) * Math.cos((t * Math.PI) / 180)}
          stroke="#fff"
          stroke-width="1"
        />
      {/each}
      <polygon points="{CX},{CY - 74} {CX - 5},{CY - 66} {CX + 5},{CY - 66}" fill="#fbbf24" />
    </g>
    <polygon points="{CX},{CY - 78} {CX - 5},{CY - 86} {CX + 5},{CY - 86}" fill="#fff" />

    <!-- Fixed aircraft reference -->
    <g stroke="#fbbf24" stroke-width="2.5" fill="none">
      <line x1={CX - 46} y1={CY} x2={CX - 18} y2={CY} />
      <line x1={CX + 18} y1={CY} x2={CX + 46} y2={CY} />
      <circle cx={CX} cy={CY} r="2.5" fill="#fbbf24" stroke="none" />
    </g>

    <!-- Airspeed tape (left) -->
    {#if !transparent}<rect x="0" y="0" width="42" height="180" fill="#0009" />{/if}
    {#each speedTape as t (t.v)}
      <line x1="34" y1={t.y} x2={t.label ? 26 : 30} y2={t.y} stroke="#cbd5e1" stroke-width="0.8" />
      {#if t.label}<text x="24" y={t.y + 3} class="tape" text-anchor="end">{t.label}</text>{/if}
    {/each}
    <polygon points="42,{CY} 34,{CY - 8} 4,{CY - 8} 4,{CY + 8} 34,{CY + 8}" fill="#111a" stroke="#fff" stroke-width="0.8" />
    <text x="22" y={CY + 4} class="readout" text-anchor="middle">{speed.toFixed(1)}</text>
    <text x="21" y="14" class="unit" text-anchor="middle">m/s</text>

    <!-- Altitude tape (right) -->
    {#if !transparent}<rect x="278" y="0" width="42" height="180" fill="#0009" />{/if}
    {#each altTape as t (t.v)}
      <line x1="286" y1={t.y} x2={t.label ? 294 : 290} y2={t.y} stroke="#cbd5e1" stroke-width="0.8" />
      {#if t.label}<text x="296" y={t.y + 3} class="tape">{t.label}</text>{/if}
    {/each}
    <polygon points="278,{CY} 286,{CY - 8} 316,{CY - 8} 316,{CY + 8} 286,{CY + 8}" fill="#111a" stroke="#fff" stroke-width="0.8" />
    <text x="298" y={CY + 4} class="readout" text-anchor="middle">{Math.round(altitude)}</text>
    <text x="299" y="14" class="unit" text-anchor="middle">m AGL</text>

    <!-- Heading tape (top) -->
    {#if !transparent}<rect x="42" y="0" width="236" height="16" fill="#0009" />{/if}
    {#each headingTape as t (t.deg)}
      <line x1={t.x} y1="16" x2={t.x} y2={t.card ? 8 : 11} stroke="#cbd5e1" stroke-width="0.8" />
      {#if t.card}<text x={t.x} y="8" class="tape" text-anchor="middle">{t.card}</text>{/if}
    {/each}
    <polygon points="{CX},16 {CX - 6},6 {CX + 6},6" fill="#fbbf24" />
    <rect x={CX - 16} y="0" width="32" height="12" fill="#111c" />
    <text x={CX} y="9" class="readout" text-anchor="middle">{heading.toString().padStart(3, '0')}</text>

    <!-- Status chips (bottom). The mode chip is dropped when it carries nothing
         beyond the arm state: an MSP board reports only armed/disarmed, not a
         separate flight mode, so it would otherwise repeat the arm chip. -->
    <text x="46" y="172" class="chip" fill={armed ? '#f87171' : '#4ade80'}>{armed ? 'ARMED' : 'DISARMED'}</text>
    {#if mode && mode !== 'Unknown' && mode !== 'Armed' && mode !== 'Disarmed'}
      <text x={CX} y="172" class="chip" text-anchor="middle" fill="#e5e7eb">{mode}</text>
    {/if}
    <text x="274" y="172" class="chip" text-anchor="end" fill={batteryColor}>
      {battery === null ? 'BATT --' : `BATT ${battery}%`} · {sats.total} SAT
    </text>
  </svg>
</div>

<style>
  .hud {
    width: 100%;
    height: 100%;
    background-color: #0b0f14;
    border-radius: var(--radius-control);
    overflow: hidden;
  }
  .hud.transparent {
    background-color: transparent;
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  /* Over live video the instruments carry only lines and numbers, so a dark
     halo keeps them legible against a bright or busy frame. */
  svg.over-video {
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 2px rgba(0, 0, 0, 0.7));
  }
  .rung {
    fill: #fff;
    font-size: 7px;
    font-weight: 600;
  }
  .tape {
    fill: #e5e7eb;
    font-size: 7px;
  }
  .readout {
    fill: #fff;
    font-size: 9px;
    font-weight: 700;
  }
  .unit {
    fill: #94a3b8;
    font-size: 5.5px;
    font-weight: 600;
  }
  .chip {
    font-size: 7.5px;
    font-weight: 700;
  }
  .hud.compact .rung,
  .hud.compact .tape,
  .hud.compact .unit {
    font-size: 6px;
  }
</style>
