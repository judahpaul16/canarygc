<script lang="ts">
  import { mavArmedStateStore, mavModelStore } from '../../stores/mavlinkStore';
  import { calibrationStore, resetCalibration } from '../../stores/calibrationStore';
  import {
    calCommand,
    ACCEL_POSITIONS,
    ACCEL_POSITION_LABEL,
    type CalKind
  } from '../../lib/calibration';
  import { isPX4 } from '../../lib/flight-modes';
  import { sendMavlinkCommand } from '../../lib/mavlink-client';
  import { notify } from '../../lib/overlays';

  const armed = $derived($mavArmedStateStore);
  const cal = $derived($calibrationStore);
  const px4 = $derived(isPX4($mavModelStore));

  interface CalCard {
    kind: CalKind;
    icon: string;
    title: string;
    desc: string;
  }

  const CARDS: CalCard[] = [
    { kind: 'compass', icon: 'fa-compass', title: 'Compass', desc: 'Rotate the vehicle through all axes until it completes.' },
    { kind: 'gyro', icon: 'fa-arrows-rotate', title: 'Gyroscope', desc: 'Keep the vehicle still on a level surface.' },
    { kind: 'level', icon: 'fa-ruler-horizontal', title: 'Level Horizon', desc: 'Set the level attitude with the vehicle sitting flat.' }
  ];

  // A pseudo-3D tilt per orientation, so each accel tile shows the pose to hold.
  const POSE: Record<string, string> = {
    level: 'rotateX(52deg)',
    left: 'rotateX(52deg) rotateY(-62deg)',
    right: 'rotateX(52deg) rotateY(62deg)',
    nosedown: 'rotateX(90deg)',
    noseup: 'rotateX(14deg)',
    back: 'rotateX(150deg)'
  };

  async function start(kind: CalKind) {
    if (armed) {
      notify({ title: 'Disarm first', content: 'Calibration runs only while the vehicle is disarmed.', type: 'warning' });
      return;
    }
    resetCalibration();
    calibrationStore.update((s) => ({ ...s, active: kind, status: 'running', progress: 0, log: [] }));
    const c = calCommand(kind, $mavModelStore);
    const ok = await sendMavlinkCommand(c.command, c.params, { cmdLong: c.cmdLong });
    if (!ok) {
      calibrationStore.update((s) => ({ ...s, status: 'failed' }));
      notify({ title: 'Could not start', content: 'The autopilot did not accept the calibration command.', type: 'error' });
    }
  }

  function statusColor(kind: CalKind): string {
    if (cal.active !== kind) return '';
    if (cal.status === 'done') return 'ok';
    if (cal.status === 'failed') return 'bad';
    return 'run';
  }
</script>

<svelte:head>
  <title>Canary Ground Control - Calibration</title>
</svelte:head>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
  <div class="dashboard w-full p-5 rounded-3xl rounded-l-none overflow-auto overflow-x-hidden h-[90vh] max-h-[90vh]">
    <div class="settings rounded-2xl h-full p-6 overflow-y-auto">
      <div class="content">
        <header class="head">
          <h1><i class="fas fa-crosshairs"></i> Sensor Calibration</h1>
          <p>Calibrate the sensors on the connected {px4 ? 'PX4' : 'ArduPilot'} vehicle. Run each on a disarmed vehicle and follow the prompts. Progress streams live from the autopilot.</p>
        </header>

        {#if armed}
          <div class="armed-warn"><i class="fas fa-triangle-exclamation"></i> The vehicle is armed. Disarm it before calibrating.</div>
        {/if}

        <div class="cal-grid">
          <section class="panel accel {statusColor('accel')}">
            <div class="panel-head">
              <span class="icon-chip"><i class="fas fa-cube"></i></span>
              <div>
                <h2>Accelerometer</h2>
                <p class="muted">Hold the vehicle in each of the six orientations as prompted.</p>
              </div>
            </div>
            <div class="poses">
              {#each ACCEL_POSITIONS as pos (pos)}
                <div class="pose-tile" class:current={cal.active === 'accel' && cal.orientation === pos}>
                  <div class="scene">
                    <div class="drone" style="transform: {POSE[pos]};">
                      <span class="arm"></span>
                      <span class="arm b"></span>
                      <span class="nose"></span>
                    </div>
                  </div>
                  <span class="pose-label">{ACCEL_POSITION_LABEL[pos]}</span>
                </div>
              {/each}
            </div>
            {#if cal.active === 'accel' && cal.status === 'running'}
              <div class="bar"><div class="fill" style="width: {cal.progress}%"></div></div>
              <p class="hint">{cal.orientation ? `Hold: ${ACCEL_POSITION_LABEL[cal.orientation as keyof typeof ACCEL_POSITION_LABEL] ?? cal.orientation}` : 'Starting...'} ({cal.progress}%)</p>
            {/if}
            <button class="cta" disabled={armed || (cal.active === 'accel' && cal.status === 'running')} onclick={() => start('accel')}>
              <i class="fas fa-play"></i> {cal.active === 'accel' && cal.status === 'done' ? 'Calibrated' : 'Start accelerometer'}
            </button>
          </section>

          {#each CARDS as card (card.kind)}
            <section class="panel {statusColor(card.kind)}">
              <div class="panel-head">
                <span class="icon-chip"><i class="fas {card.icon}"></i></span>
                <div>
                  <h2>{card.title}</h2>
                  <p class="muted">{card.desc}</p>
                </div>
              </div>
              {#if cal.active === card.kind && cal.status === 'running'}
                <div class="bar"><div class="fill" style="width: {cal.progress}%"></div></div>
                <p class="hint">Calibrating... ({cal.progress}%)</p>
              {:else if cal.active === card.kind && cal.status === 'done'}
                <p class="hint ok-text"><i class="fas fa-circle-check"></i> Done</p>
              {:else if cal.active === card.kind && cal.status === 'failed'}
                <p class="hint bad-text"><i class="fas fa-circle-xmark"></i> Failed, try again</p>
              {/if}
              <button class="cta" disabled={armed || (cal.active === card.kind && cal.status === 'running')} onclick={() => start(card.kind)}>
                <i class="fas fa-play"></i> Start {card.title.toLowerCase()}
              </button>
            </section>
          {/each}
        </div>

        <section class="panel log-panel">
          <div class="panel-head">
            <span class="icon-chip"><i class="fas fa-terminal"></i></span>
            <div>
              <h2>Status</h2>
              <p class="muted">Live calibration messages from the autopilot.</p>
            </div>
          </div>
          <div class="log">
            {#if cal.log.length === 0}
              <p class="muted">No calibration running.</p>
            {:else}
              {#each cal.log as line, i (i)}<div class="log-line">{line}</div>{/each}
            {/if}
          </div>
        </section>
      </div>
    </div>
  </div>
</div>

<style>
  .dashboard { background-color: var(--secondaryColor); }
  .settings { background: var(--primaryColor); color: var(--fontColor); }
  .content { max-width: 1080px; margin: 0 auto; padding-bottom: 2.5rem; }

  .head { margin-bottom: 1.35rem; padding-bottom: 1.1rem; border-bottom: 1px solid rgb(from var(--fontColor) r g b / 0.08); }
  .head h1 { font-size: 1.6rem; font-weight: 800; display: flex; align-items: center; gap: 0.6rem; }
  .head h1 i { color: #f5c518; }
  .head p { opacity: 0.7; font-size: 0.9rem; margin-top: 0.35rem; max-width: 62rem; }

  .armed-warn {
    display: flex; align-items: center; gap: 0.5rem;
    background: rgba(214, 41, 41, 0.12); border: 1px solid rgba(214, 41, 41, 0.4);
    color: #f7d4d4; border-radius: 0.6rem; padding: 0.6rem 0.85rem; margin-bottom: 1rem; font-size: 0.9rem;
  }

  .cal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; }
  .accel { grid-column: 1 / -1; }

  .panel {
    background: rgb(from var(--secondaryColor) r g b / 0.5);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.1);
    border-radius: 0.9rem; padding: 1.1rem; display: flex; flex-direction: column;
  }
  .panel.run { border-color: #3290e7; }
  .panel.ok { border-color: #4ade80; }
  .panel.bad { border-color: #f87171; }

  .panel-head { display: flex; gap: 0.7rem; margin-bottom: 0.9rem; }
  .icon-chip {
    width: 2.2rem; height: 2.2rem; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    border-radius: 0.6rem; background: rgb(from var(--fontColor) r g b / 0.08); color: #f5c518;
  }
  .panel-head h2 { font-size: 1.05rem; font-weight: 700; }
  .muted { opacity: 0.65; font-size: 0.82rem; margin-top: 0.15rem; }

  .poses { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.6rem; margin-bottom: 0.9rem; }
  @media (max-width: 720px) { .poses { grid-template-columns: repeat(3, 1fr); } }
  .pose-tile {
    border: 1px solid rgb(from var(--fontColor) r g b / 0.12); border-radius: 0.6rem;
    padding: 0.5rem; text-align: center; transition: border-color 0.2s, background-color 0.2s;
  }
  .pose-tile.current { border-color: #3290e7; background: rgba(50, 144, 231, 0.12); }
  .scene { perspective: 220px; height: 52px; display: flex; align-items: center; justify-content: center; }
  .drone {
    width: 30px; height: 30px; position: relative; transform-style: preserve-3d;
    border: 2px solid #cbd5e1; border-radius: 6px; background: rgb(from var(--fontColor) r g b / 0.06);
  }
  .drone .arm, .drone .arm.b { position: absolute; inset: 50% 0; height: 2px; background: #94a3b8; transform: translateY(-50%) rotate(45deg); }
  .drone .arm.b { transform: translateY(-50%) rotate(-45deg); }
  .drone .nose { position: absolute; top: -5px; left: 50%; transform: translateX(-50%); border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 6px solid #f5c518; }
  .pose-label { display: block; font-size: 0.7rem; opacity: 0.8; margin-top: 0.3rem; }

  .bar { height: 8px; border-radius: 9999px; background: rgb(from var(--fontColor) r g b / 0.12); overflow: hidden; margin: 0.3rem 0 0.5rem; }
  .fill { height: 100%; background: #3290e7; transition: width 0.2s; }
  .hint { font-size: 0.82rem; opacity: 0.85; margin-bottom: 0.6rem; }
  .ok-text { color: #4ade80; opacity: 1; }
  .bad-text { color: #f87171; opacity: 1; }

  .cta {
    margin-top: auto; align-self: flex-start; display: inline-flex; align-items: center; gap: 0.45rem;
    background: #3290e7; color: #fff; font-weight: 600; font-size: 0.9rem;
    border-radius: 0.55rem; padding: 0.5rem 0.9rem; cursor: pointer;
  }
  .cta:hover:not(:disabled) { background: #4e9ff0; }
  .cta:disabled { opacity: 0.5; cursor: not-allowed; }

  .log-panel { margin-top: 1rem; }
  .log {
    font-family: ui-monospace, monospace; font-size: 0.8rem; line-height: 1.5;
    background: rgb(from var(--secondaryColor) r g b / 0.6); border-radius: 0.5rem;
    padding: 0.6rem 0.75rem; max-height: 12rem; overflow-y: auto;
  }
  .log-line { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
