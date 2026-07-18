<script lang="ts">
  import { mavLocationStore } from '../stores/mavlinkStore';
  import { smoothHeadingStore } from '../lib/smooth-telemetry';
  import { m } from '$lib/paraglide/messages';

  interface Props {
    mavLocation?: L.LatLng | { lat: number; lng: number };
    // The compact variant is the small fullscreen-map dock: dial and heading
    // only, no coordinate readout.
    compact?: boolean;
  }

  let { mavLocation = $bindable(), compact = false }: Props = $props();

  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const TICKS = Array.from({ length: 12 }, (_, i) => i * 30);
  const CARDINALS = [
    { label: 'N', x: 60, y: 20, north: true },
    { label: 'E', x: 100, y: 60, north: false },
    { label: 'S', x: 60, y: 100, north: false },
    { label: 'W', x: 20, y: 60, north: false }
  ];

  function norm(deg: number): number {
    return ((deg % 360) + 360) % 360;
  }

  function cardinal(deg: number): string {
    return DIRS[Math.round(norm(deg) / 45) % 8];
  }

  function formatCoordinates(decimalDegree: number, isLatitude: boolean) {
    const absDegree = Math.abs(decimalDegree);
    const degrees = Math.floor(absDegree);
    const minutes = Math.floor((absDegree - degrees) * 60);
    const seconds = ((absDegree - degrees - minutes / 60) * 3600).toFixed(2);
    const direction = isLatitude
      ? decimalDegree < 0 ? 'S' : 'N'
      : decimalDegree < 0 ? 'W' : 'E';
    return `${degrees}°${minutes}'${seconds}"${direction}`;
  }

  let location = $derived(mavLocation ?? $mavLocationStore);
  let headingDeg = $derived(norm($smoothHeadingStore));
  let heading = $derived(`${Math.round(headingDeg)}° ${cardinal(headingDeg)}`);
  let currentLat = $derived(formatCoordinates(location.lat, true));
  let currentLong = $derived(formatCoordinates(location.lng, false));

  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyCoordinates() {
    const text = `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = false), 1500);
    } catch {
      // Clipboard access denied; the readout stays as is.
    }
  }
</script>

<div class="compass" class:compact>
  <div class="heading-pill">{heading}</div>

  <svg class="dial" viewBox="0 0 120 120" role="img" aria-label={m.compass_heading_aria({ heading })}>
    <circle cx="60" cy="60" r="55" class="ring" />
    {#each TICKS as t (t)}
      <line
        x1="60"
        y1="7"
        x2="60"
        y2={t % 90 === 0 ? 17 : 13}
        class="tick"
        class:major={t % 90 === 0}
        transform="rotate({t} 60 60)"
      />
    {/each}
    {#each CARDINALS as c (c.label)}
      <text x={c.x} y={c.y} class="cardinal" class:north={c.north}>{c.label}</text>
    {/each}
    <g class="needle" style="transform: rotate({headingDeg}deg); transform-origin: 60px 60px;">
      <polygon points="60,16 67,60 53,60" class="needle-n" />
      <polygon points="60,104 67,60 53,60" class="needle-s" />
    </g>
    <circle cx="60" cy="60" r="4.5" class="hub" />
  </svg>

  {#if !compact}
    <button
      type="button"
      id="lat-long"
      class="coords"
      class:copied
      data-tip={m.compass_copy_tip()}
      aria-label={m.compass_copy_aria()}
      onclick={copyCoordinates}
    >
      {#if copied}
        <i class="fas fa-check"></i> {m.compass_copied()}
      {:else}
        {currentLat} {currentLong}
      {/if}
    </button>
  {/if}
</div>

<style>
  .compass {
    color: var(--fontColor);
    background-color: var(--primaryColor);
    border-radius: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    height: 100%;
    width: 100%;
    padding: 1rem;
  }

  .heading-pill {
    background-color: #62bbff;
    color: var(--primaryColor);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.7rem;
    border-radius: 9999px;
  }

  .dial {
    width: 140px;
    max-width: 100%;
    height: auto;
    aspect-ratio: 1;
  }

  .ring {
    fill: none;
    stroke: rgb(from var(--fontColor) r g b / 0.25);
    stroke-width: 2;
  }

  .tick {
    stroke: rgb(from var(--fontColor) r g b / 0.35);
    stroke-width: 1.5;
  }

  .tick.major {
    stroke: rgb(from var(--fontColor) r g b / 0.6);
    stroke-width: 2.5;
  }

  .cardinal {
    fill: var(--fontColor);
    font-size: 11px;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: central;
  }

  .cardinal.north {
    fill: #ef4444;
  }

  .needle {
    transition: transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);
  }

  .needle-n {
    fill: #ef4444;
  }

  .needle-s {
    fill: rgb(from var(--fontColor) r g b / 0.55);
  }

  .hub {
    fill: var(--fontColor);
  }

  .coords {
    color: var(--fontColor);
    cursor: pointer;
    font-size: 0.75rem;
    border-radius: var(--radius-control);
    padding: 0.15rem 0.4rem;
    transition: color 0.15s ease, background-color 0.15s ease;
  }

  .coords:hover {
    background-color: var(--secondaryColor);
  }

  .coords.copied {
    color: #61cd89;
  }

  /* The small fullscreen-map dock: a compact floating dial, sized to content
     with a translucent backdrop rather than a full panel surface. */
  .compass.compact {
    width: auto;
    height: auto;
    padding: 0.55rem;
    gap: 0.35rem;
    background-color: rgb(from var(--primaryColor) r g b / 0.85);
    border: 1px solid rgb(from var(--secondaryColor) r g b / 0.9);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .compass.compact .dial {
    width: 84px;
  }

  .compass.compact .heading-pill {
    font-size: 0.68rem;
    padding: 0.12rem 0.55rem;
  }
</style>
