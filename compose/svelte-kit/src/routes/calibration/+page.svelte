<script lang="ts">
  import { mavArmedStateStore, mavModelStore, mavlinkParamStore } from '../../stores/mavlinkStore';
  import { calibrationStore, resetCalibration } from '../../stores/calibrationStore';
  import {
    calCommand,
    ACCEL_POSITIONS,
    ACCEL_POSITION_LABEL,
    type CalKind
  } from '../../lib/calibration';
  import { isPX4 } from '../../lib/flight-modes';
  import { sendMavlinkCommand, writeParameter } from '../../lib/mavlink-client';
  import { notify } from '../../lib/overlays';
  import MotorOutput from '../../components/MotorOutput.svelte';
  import { onMount } from 'svelte';

  // SERVO_OUTPUT_RAW is message 36; ask the autopilot to stream it at 10 Hz
  // while the page is open so the motor-output bars update live, then restore
  // the default rate on the way out.
  const SERVO_OUTPUT_RAW_ID = 36;
  onMount(() => {
    sendMavlinkCommand('SET_MESSAGE_INTERVAL', [SERVO_OUTPUT_RAW_ID, 100000], { cmdLong: true });
    return () => {
      sendMavlinkCommand('SET_MESSAGE_INTERVAL', [SERVO_OUTPUT_RAW_ID, 0], { cmdLong: true });
    };
  });

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
  // Angles stay clear of 90deg, where a flat glyph would turn edge-on and vanish.
  const POSE: Record<string, string> = {
    level: 'rotateX(52deg)',
    left: 'rotateX(52deg) rotateY(-58deg)',
    right: 'rotateX(52deg) rotateY(58deg)',
    nosedown: 'rotateX(68deg) rotateZ(0deg)',
    noseup: 'rotateX(20deg)',
    back: 'rotateX(128deg)'
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

  // ESC calibration is a physical procedure (throttle high, power-cycle) with no
  // safe single command. ArduPilot's semi-automatic method arms it by setting
  // ESC_CALIBRATION; the operator then power-cycles with the propellers off.
  const escParam = $derived($mavlinkParamStore['ESC_CALIBRATION']);
  let escEnabled = $state(false);
  async function enableEscCal() {
    if (armed) {
      notify({ title: 'Disarm first', content: 'Arm ESC calibration only while disarmed and with propellers removed.', type: 'warning' });
      return;
    }
    if (!escParam) {
      notify({ title: 'Parameter unavailable', content: 'ESC_CALIBRATION was not found on this vehicle; it may still be loading.', type: 'warning' });
      return;
    }
    const ok = await writeParameter('ESC_CALIBRATION', 3, escParam.param_type);
    if (ok) {
      escEnabled = true;
      notify({ title: 'Semi-automatic ESC calibration armed', content: 'Remove propellers, then power-cycle with the throttle held high and follow the steps.', type: 'info' });
    } else {
      notify({ title: 'Could not arm', content: 'The autopilot did not accept the parameter write.', type: 'error' });
    }
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

          <div class="esc-row">
          <section class="panel esc {armed ? 'bad' : ''}">
            <div class="panel-head">
              <span class="icon-chip"><i class="fas fa-plug-circle-bolt"></i></span>
              <div>
                <h2>ESC Calibration</h2>
                <p class="muted">Set the throttle endpoints on every ESC so the motors respond together.</p>
              </div>
            </div>
            <div class="esc-warn"><i class="fas fa-triangle-exclamation"></i> Remove all propellers before you begin. The motors can spin at full throttle.</div>
            <div class="esc-body">
              <div class="esc-scene" aria-hidden="true">
                <div class="quad">
                  <span class="arm a"></span>
                  <span class="arm b"></span>
                  {#each ['tl', 'tr', 'bl', 'br'] as pos (pos)}
                    <span class="rotor {pos}"><span class="blade"></span></span>
                  {/each}
                  <span class="hub"></span>
                </div>
                <div class="throttle" title="throttle sweep">
                  <div class="throttle-fill"></div>
                  <span class="tcap top">MAX</span>
                  <span class="tcap bot">MIN</span>
                </div>
                <div class="beeps"><span></span><span></span><span></span><span></span></div>
              </div>
              <ol class="esc-steps">
                <li>Remove all propellers and disconnect the battery.</li>
                <li>Hold the transmitter throttle at maximum.</li>
                <li>Connect the battery and wait for the ready tones.</li>
                <li>Power-cycle the battery while the throttle stays high.</li>
                <li>Listen for the beeps that confirm the maximum endpoint.</li>
                <li>Lower the throttle to minimum; a long tone confirms the minimum.</li>
                <li>Raise the throttle slightly to confirm the motors spin together, then disconnect.</li>
              </ol>
            </div>
            {#if px4}
              <p class="hint">On PX4, run ESC calibration from the actuator setup, disarmed and with propellers removed.</p>
            {:else if escEnabled}
              <p class="hint ok-text"><i class="fas fa-circle-check"></i> Semi-automatic mode armed. Power-cycle to run it.</p>
            {:else}
              <button class="cta" disabled={armed} onclick={enableEscCal}><i class="fas fa-bolt"></i> Arm semi-automatic mode</button>
            {/if}
          </section>

          <section class="panel motors-panel">
            <div class="panel-head">
              <span class="icon-chip"><i class="fas fa-fan"></i></span>
              <div>
                <h2>Motor output</h2>
                <p class="muted">Live PWM per output.</p>
              </div>
            </div>
            <MotorOutput />
          </section>
          </div>
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

  /* ESC calibration card */
  .esc-row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr);
    gap: 1rem;
    align-items: stretch;
  }

  .motors-panel {
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 760px) {
    .esc-row { grid-template-columns: 1fr; }
  }
  .esc-warn {
    display: flex; align-items: center; gap: 0.5rem;
    background: rgba(214, 41, 41, 0.12); border: 1px solid rgba(214, 41, 41, 0.45);
    color: #f7d4d4; border-radius: 0.6rem; padding: 0.55rem 0.8rem;
    margin-bottom: 1rem; font-size: 0.85rem; font-weight: 600;
    animation: warnPulse 2.2s ease-in-out infinite;
  }
  .esc-warn i { color: #f87171; }
  @keyframes warnPulse {
    0%, 100% { border-color: rgba(214, 41, 41, 0.35); }
    50% { border-color: rgba(248, 113, 113, 0.95); }
  }

  .esc-body { display: flex; gap: 1.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.9rem; }
  .esc-scene { position: relative; display: flex; align-items: center; gap: 1rem; flex-shrink: 0; }

  .quad { position: relative; width: 118px; height: 118px; }
  .arm { position: absolute; top: 50%; left: 9%; width: 82%; height: 4px; background: #64748b; border-radius: 2px; transform-origin: center; }
  .arm.a { transform: translateY(-50%) rotate(45deg); }
  .arm.b { transform: translateY(-50%) rotate(-45deg); }
  .hub { position: absolute; top: 50%; left: 50%; width: 22px; height: 22px; transform: translate(-50%, -50%); background: #1f2937; border: 2px solid #94a3b8; border-radius: 5px; }
  .rotor { position: absolute; width: 40px; height: 40px; border-radius: 50%; border: 2px solid rgba(148, 163, 184, 0.5); background: rgba(148, 163, 184, 0.08); display: flex; align-items: center; justify-content: center; }
  .rotor.tl { top: 0; left: 0; }
  .rotor.tr { top: 0; right: 0; }
  .rotor.bl { bottom: 0; left: 0; }
  .rotor.br { bottom: 0; right: 0; }
  .blade { width: 34px; height: 4px; border-radius: 2px; background: linear-gradient(90deg, transparent, #f5c518, transparent); animation: spin 0.45s linear infinite; }
  .rotor.tr .blade, .rotor.bl .blade { animation-direction: reverse; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .throttle { position: relative; width: 26px; height: 108px; border: 2px solid rgba(148, 163, 184, 0.4); border-radius: 8px; background: rgba(148, 163, 184, 0.08); display: flex; align-items: flex-end; overflow: hidden; }
  .throttle-fill { width: 100%; background: linear-gradient(#4e9ff0, #3290e7); animation: throttleSeq 3.6s ease-in-out infinite; }
  @keyframes throttleSeq {
    0%, 8% { height: 12%; }
    30%, 58% { height: 92%; }
    78%, 100% { height: 12%; }
  }
  .tcap { position: absolute; left: 50%; transform: translateX(-50%); font-size: 0.5rem; font-weight: 700; color: #94a3b8; letter-spacing: 0.04em; }
  .tcap.top { top: 2px; }
  .tcap.bot { bottom: 2px; }

  .beeps { display: flex; flex-direction: column; gap: 0.5rem; }
  .beeps span { width: 10px; height: 10px; border-radius: 50%; background: #4ade80; opacity: 0.2; animation: beep 3.6s ease-in-out infinite; }
  .beeps span:nth-child(1) { animation-delay: 1.1s; }
  .beeps span:nth-child(2) { animation-delay: 1.4s; }
  .beeps span:nth-child(3) { animation-delay: 1.7s; }
  .beeps span:nth-child(4) { animation-delay: 2.7s; }
  @keyframes beep {
    0%, 100% { opacity: 0.2; box-shadow: none; }
    6% { opacity: 1; box-shadow: 0 0 8px #4ade80; }
  }

  .esc-steps { flex: 1; min-width: 240px; margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.82rem; opacity: 0.9; }
  .esc-steps li { line-height: 1.35; }

  @media (prefers-reduced-motion: reduce) {
    .blade, .throttle-fill, .beeps span, .esc-warn { animation: none; }
    .throttle-fill { height: 60%; }
    .beeps span { opacity: 0.8; }
  }
</style>
