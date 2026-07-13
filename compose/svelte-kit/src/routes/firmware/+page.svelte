<script lang="ts">
  import { onMount } from 'svelte';
  import { notify, showModal } from '../../lib/overlays';
  import Select from '../../components/Select.svelte';

  interface FcIdentity { variant: string; firmware: string; version: string; apiVersion: string; }
  interface BetaflightTarget { target: string; manufacturer: string; mcu: string; }
  interface FirmwareRelease { release: string; type: string; date: string; url: string; }
  interface InavRelease { release: string; tag: string; date: string; url: string; targets: string[]; }
  interface ArduPilotBoard { platform: string; version: string; url: string; boardId: number; brand: string; }
  interface Px4Release { release: string; tag: string; date: string; url: string; boards: Array<{ board: string; url: string }>; }

  let configured = $state(false);
  let detecting = $state(false);
  let identity = $state<FcIdentity | null>(null);

  let catalogsLoading = $state(true);
  let inavReleases = $state<InavRelease[]>([]);
  let inavTag = $state('');
  let inavTarget = $state('');
  let betaflight = $state<{ targets: BetaflightTarget[]; releases: FirmwareRelease[] } | null>(null);
  let bfRelease = $state('');
  let bfTarget = $state('');
  let ardupilot = $state<Record<string, ArduPilotBoard[]> | null>(null);
  let apVehicle = $state('Copter');
  let apBoard = $state('');
  let px4Releases = $state<Px4Release[]>([]);
  let px4Tag = $state('');
  let px4Board = $state('');

  let hexName = $state('');
  let hexContent = $state('');
  let flashing = $state(false);
  let flashLabel = $state('');
  let flashLog = $state('');
  let flashOk = $state<boolean | null>(null);

  let inavTargets = $derived(inavReleases.find((r) => r.tag === inavTag)?.targets ?? []);
  let bfReleaseOptions = $derived(
    (betaflight?.releases ?? []).slice(0, 12).map((r) => ({ value: r.release, label: `${r.release} · ${r.type}` }))
  );
  let bfTargetOptions = $derived(
    (betaflight?.targets ?? []).map((t) => ({ value: t.target, label: `${t.manufacturer} · ${t.mcu}` }))
  );
  let bfTargetValid = $derived((betaflight?.targets ?? []).some((t) => t.target === bfTarget));
  let apBoards = $derived(ardupilot?.[apVehicle] ?? []);
  let apSelected = $derived(apBoards.find((b) => b.platform === apBoard));
  let px4Boards = $derived(px4Releases.find((r) => r.tag === px4Tag)?.boards ?? []);
  let px4Selected = $derived(px4Boards.find((b) => b.board === px4Board));

  onMount(async () => {
    try {
      const res = await fetch('/api/msp/status');
      configured = (await res.json()).configured;
    } catch { configured = false; }

    const results = await Promise.allSettled([
      fetch('/api/firmware/inav'),
      fetch('/api/firmware/betaflight'),
      fetch('/api/firmware/ardupilot'),
      fetch('/api/firmware/px4')
    ]);
    const [inavRes, bfRes, apRes, px4Res] = results;
    if (inavRes.status === 'fulfilled' && inavRes.value.ok) {
      inavReleases = await inavRes.value.json();
      inavTag = inavReleases[0]?.tag ?? '';
    }
    if (bfRes.status === 'fulfilled' && bfRes.value.ok) {
      betaflight = await bfRes.value.json();
      bfRelease = betaflight?.releases.find((r) => r.type === 'Stable')?.release ?? '';
    }
    if (apRes.status === 'fulfilled' && apRes.value.ok) ardupilot = await apRes.value.json();
    if (px4Res.status === 'fulfilled' && px4Res.value.ok) {
      px4Releases = await px4Res.value.json();
      px4Tag = px4Releases[0]?.tag ?? '';
    }
    catalogsLoading = false;
  });

  async function detect() {
    detecting = true;
    identity = null;
    try {
      const res = await fetch('/api/msp/detect');
      const data = await res.json();
      if (res.ok) identity = data;
      else notify({ title: 'No flight controller', content: data.error ?? 'Could not reach the FC.', type: 'warning' });
    } catch {
      notify({ title: 'Detect failed', content: 'Could not reach the flight controller.', type: 'warning' });
    } finally {
      detecting = false;
    }
  }

  function rebootToBootloader() {
    showModal({
      title: 'Reboot to bootloader',
      content: 'This restarts the connected flight controller into its DFU bootloader so it can be flashed. It will disconnect from telemetry until it is flashed or power-cycled. Continue?',
      confirmation: true,
      confirmLabel: 'Reboot',
      onConfirm: async () => {
        try {
          await fetch('/api/msp/reboot-bootloader', { method: 'POST' });
          identity = null;
          notify({ title: 'Rebooting', content: 'The flight controller is entering DFU mode.', duration: 4000 });
        } catch {
          notify({ title: 'Reboot failed', content: 'Could not send the reboot command.', type: 'warning' });
        }
      }
    });
  }

  function onHexPick(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      hexContent = String(reader.result ?? '');
      hexName = file.name;
    };
    reader.readAsText(file);
  }

  function confirmFlash(label: string, body: Record<string, unknown>, note = '') {
    showModal({
      title: 'Flash firmware',
      content: `About to flash ${label}.${note ? ` ${note}` : ''} Do not disconnect power during the flash. Continue?`,
      confirmation: true,
      confirmLabel: 'Flash',
      onConfirm: () => runFlash(label, body)
    });
  }

  async function runFlash(label: string, body: Record<string, unknown>) {
    flashing = true;
    flashLabel = label;
    flashLog = '';
    flashOk = null;
    try {
      const res = await fetch('/api/firmware/flash', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      flashOk = res.ok && data.success;
      flashLog = data.output ?? data.error ?? (flashOk ? 'Flash complete.' : 'Flash failed.');
      notify({
        title: flashOk ? 'Flash complete' : 'Flash failed',
        content: flashOk ? `${label} was flashed.` : 'See the flash log for details.',
        type: flashOk ? 'success' : 'warning'
      });
    } catch {
      flashOk = false;
      flashLog = 'Network error while flashing.';
    } finally {
      flashing = false;
    }
  }
</script>

<svelte:head>
  <title>Canary Ground Control - Firmware</title>
</svelte:head>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
  <div class="dashboard w-full p-5 rounded-3xl rounded-l-none overflow-auto overflow-x-hidden h-[90vh] max-h-[90vh]">
    <div class="settings rounded-2xl h-full overflow-y-auto">
      <div class="content">
        <header class="head">
          <h1><i class="fas fa-microchip"></i> Firmware</h1>
          <p>
            Flash the firmware of a connected flight controller. A <strong>release</strong> is a firmware
            version; a <strong>target</strong> (or board) is the exact flight controller model it is built
            for, so pick both. Betaflight and INAV flash over USB DFU; ArduPilot and PX4 upload over the
            autopilot's own bootloader through its serial link.
          </p>
        </header>

        <section class="panel fc-panel">
          <div class="fc-row">
            <span class="icon-chip small"><i class="fas fa-plug"></i></span>
            <div class="fc-text">
              <h2>Flight controller (MSP)</h2>
              {#if !configured}
                <p class="muted">Set <code>MSP_SERIAL_PATH</code> to a Betaflight or INAV board's serial device to enable detection.</p>
              {:else if identity}
                <p class="muted">{identity.firmware} {identity.version} · variant {identity.variant} · MSP API {identity.apiVersion}</p>
              {:else}
                <p class="muted">Reads the firmware name and version over the MultiWii Serial Protocol.</p>
              {/if}
            </div>
            {#if configured}
              <div class="fc-actions">
                <button class="ghost" onclick={detect} disabled={detecting}>
                  <i class="fas fa-magnifying-glass"></i> {detecting ? 'Detecting...' : 'Detect'}
                </button>
                <button class="ghost warn" onclick={rebootToBootloader}>
                  <i class="fas fa-power-off"></i> Bootloader
                </button>
              </div>
            {/if}
          </div>
        </section>

        {#if catalogsLoading}
          <section class="panel"><p class="muted">Loading firmware catalogs...</p></section>
        {:else}
          <div class="catalog-grid">
            <section class="panel">
              <div class="panel-head">
                <span class="icon-chip"><i class="fas fa-paper-plane"></i></span>
                <div>
                  <h2>INAV</h2>
                  <p class="muted">Official per-target hex from the INAV release, flashed over DFU.</p>
                </div>
              </div>
              {#if inavReleases.length === 0}
                <p class="muted">The INAV release catalog is unreachable right now.</p>
              {:else}
                <div class="fields">
                  <div class="field">
                    <span>Release</span>
                    <Select
                      bind:value={inavTag}
                      options={inavReleases.map((r) => ({ value: r.tag, label: `${r.release} (${r.date})` }))}
                    />
                  </div>
                  <div class="field">
                    <span>Target</span>
                    <Select
                      bind:value={inavTarget}
                      searchable
                      placeholder="Search {inavTargets.length} targets"
                      options={inavTargets.map((t) => ({ value: t, label: t }))}
                    />
                  </div>
                </div>
                <div class="panel-actions">
                  <button
                    class="cta"
                    disabled={flashing || !inavTag || !inavTargets.includes(inavTarget)}
                    onclick={() => confirmFlash(`INAV ${inavTag} for ${inavTarget}`, { source: 'inav', tag: inavTag, target: inavTarget }, 'The board must be in DFU bootloader mode.')}
                  >
                    <i class="fas fa-bolt"></i> Flash
                  </button>
                </div>
              {/if}
            </section>

            <section class="panel">
              <div class="panel-head">
                <span class="icon-chip"><i class="fas fa-cubes"></i></span>
                <div>
                  <h2>Betaflight</h2>
                  <p class="muted">Built on demand by the Betaflight cloud, then flashed over DFU. A fresh build takes about a minute.</p>
                </div>
              </div>
              {#if !betaflight}
                <p class="muted">The Betaflight catalog is unreachable right now.</p>
              {:else}
                <div class="fields">
                  <div class="field">
                    <span>Release</span>
                    <Select bind:value={bfRelease} options={bfReleaseOptions} />
                  </div>
                  <div class="field">
                    <span>Target</span>
                    <Select
                      bind:value={bfTarget}
                      searchable
                      placeholder="Search {betaflight.targets.length} targets"
                      options={bfTargetOptions}
                    />
                  </div>
                </div>
                <div class="panel-actions">
                  <a class="side-link" href="https://build.betaflight.com" target="_blank" rel="noreferrer">
                    <i class="fas fa-up-right-from-square"></i> Custom builds
                  </a>
                  <button
                    class="cta"
                    disabled={flashing || !bfRelease || !bfTargetValid}
                    onclick={() => confirmFlash(`Betaflight ${bfRelease} for ${bfTarget}`, { source: 'betaflight', release: bfRelease, target: bfTarget }, 'The firmware builds in the Betaflight cloud first, then the board must be in DFU bootloader mode.')}
                  >
                    <i class="fas fa-bolt"></i> Build & Flash
                  </button>
                </div>
              {/if}
            </section>

            <section class="panel">
              <div class="panel-head">
                <span class="icon-chip"><i class="fas fa-helicopter"></i></span>
                <div>
                  <h2>ArduPilot</h2>
                  <p class="muted">Latest stable per board, uploaded over the autopilot's serial bootloader.</p>
                </div>
              </div>
              {#if !ardupilot}
                <p class="muted">The ArduPilot manifest is unreachable right now.</p>
              {:else}
                <div class="fields">
                  <div class="field">
                    <span>Vehicle</span>
                    <Select
                      bind:value={apVehicle}
                      options={Object.keys(ardupilot).map((v) => ({ value: v, label: v }))}
                      onchange={() => (apBoard = '')}
                    />
                  </div>
                  <div class="field">
                    <span>Board</span>
                    <Select
                      bind:value={apBoard}
                      searchable
                      placeholder="Search {apBoards.length} boards"
                      options={apBoards.map((b) => ({ value: b.platform, label: b.brand || b.platform }))}
                    />
                  </div>
                </div>
                <div class="panel-actions">
                  {#if apSelected}<span class="version-tag">{apSelected.version}</span>{/if}
                  <button
                    class="cta"
                    disabled={flashing || !apSelected}
                    onclick={() => apSelected && confirmFlash(`ArduPilot ${apVehicle} ${apSelected.version} for ${apBoard}`, { source: 'ardupilot', url: apSelected.url }, 'The autopilot reboots into its bootloader and reconnects after the upload.')}
                  >
                    <i class="fas fa-bolt"></i> Flash
                  </button>
                </div>
              {/if}
            </section>

            <section class="panel">
              <div class="panel-head">
                <span class="icon-chip"><i class="fas fa-jet-fighter-up"></i></span>
                <div>
                  <h2>PX4</h2>
                  <p class="muted">Release .px4 images per board, uploaded over the autopilot's serial bootloader.</p>
                </div>
              </div>
              {#if px4Releases.length === 0}
                <p class="muted">The PX4 release catalog is unreachable right now.</p>
              {:else}
                <div class="fields">
                  <div class="field">
                    <span>Release</span>
                    <Select
                      bind:value={px4Tag}
                      options={px4Releases.map((r) => ({ value: r.tag, label: `${r.release} (${r.date})` }))}
                      onchange={() => (px4Board = '')}
                    />
                  </div>
                  <div class="field">
                    <span>Board</span>
                    <Select
                      bind:value={px4Board}
                      searchable
                      placeholder="Search {px4Boards.length} boards"
                      options={px4Boards.map((b) => ({ value: b.board, label: b.board }))}
                    />
                  </div>
                </div>
                <div class="panel-actions">
                  <button
                    class="cta"
                    disabled={flashing || !px4Selected}
                    onclick={() => px4Selected && confirmFlash(`PX4 ${px4Tag} for ${px4Board}`, { source: 'px4', url: px4Selected.url }, 'The autopilot reboots into its bootloader and reconnects after the upload.')}
                  >
                    <i class="fas fa-bolt"></i> Flash
                  </button>
                </div>
              {/if}
            </section>
          </div>
        {/if}

        <section class="panel">
          <div class="panel-head">
            <span class="icon-chip"><i class="fas fa-file-arrow-up"></i></span>
            <div>
              <h2>Flash a HEX file</h2>
              <p class="muted">Any Intel HEX, including a custom Betaflight cloud build, flashed over DFU.</p>
            </div>
          </div>
          <div class="hex-row">
            <label class="file-field">
              <input type="file" accept=".hex" onchange={onHexPick} />
              {#if hexName}<span class="file-name">{hexName}</span>{/if}
            </label>
            <button
              class="cta"
              disabled={flashing || !hexContent}
              onclick={() => confirmFlash(hexName, { source: 'hex', hex: hexContent }, 'The board must be in DFU bootloader mode.')}
            >
              <i class="fas fa-bolt"></i> Flash
            </button>
          </div>
        </section>

        {#if flashing || flashLog}
          <section class="panel">
            <div class="panel-head">
              <span class="icon-chip"><i class="fas fa-terminal"></i></span>
              <div>
                <h2>
                  Flash log
                  {#if flashing}<span class="running">{flashLabel}...</span>
                  {:else if flashOk === true}<span class="ok">success</span>
                  {:else if flashOk === false}<span class="fail">failed</span>{/if}
                </h2>
              </div>
            </div>
            <pre class="log">{flashing ? `Flashing ${flashLabel}...` : flashLog}</pre>
          </section>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .dashboard { background-color: var(--secondaryColor); }
  /* The scroll container owns the padding, so its own bottom padding is always
     honored below the last panel where a scrolled child margin can collapse. */
  .settings { background: var(--primaryColor); color: var(--fontColor); padding: 1.5rem 1.5rem 2.5rem; }
  .content { max-width: 1080px; margin: 0 auto; }

  .head { margin-bottom: 1.35rem; padding-bottom: 1.1rem; border-bottom: 1px solid rgb(from var(--fontColor) r g b / 0.08); }
  .head h1 { font-size: 1.6rem; font-weight: 800; display: flex; align-items: center; gap: 0.6rem; }
  .head h1 i { color: #f5c518; }
  .head p { opacity: 0.7; font-size: 0.9rem; margin-top: 0.35rem; max-width: 62rem; }
  .head strong { color: #f5c518; font-weight: 600; }

  .panel {
    background-color: rgb(from var(--tertiaryColor) r g b / 0.32);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.08);
    border-radius: var(--radius-surface);
    padding: 1.1rem 1.25rem;
    margin-bottom: 1rem;
  }
  .panel-head {
    display: flex; align-items: flex-start; gap: 0.8rem;
    padding-bottom: 0.85rem; margin-bottom: 0.95rem;
    border-bottom: 1px solid rgb(from var(--fontColor) r g b / 0.08);
  }
  .icon-chip {
    width: 38px; height: 38px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border-radius: var(--radius-control);
    background: rgba(245, 197, 24, 0.12); border: 1px solid rgba(245, 197, 24, 0.28);
    color: #f5c518; font-size: 0.95rem;
  }
  .icon-chip.small { width: 32px; height: 32px; font-size: 0.85rem; }
  .panel h2 { font-size: 0.95rem; font-weight: 700; line-height: 1.2; display: flex; align-items: center; gap: 0.5rem; }
  .muted { opacity: 0.65; font-size: 0.8rem; margin-top: 0.2rem; }
  code { font-family: ui-monospace, monospace; background: rgb(from var(--fontColor) r g b / 0.1); padding: 0.05rem 0.3rem; border-radius: 4px; }

  .fc-panel { padding: 0.85rem 1.25rem; }
  .fc-row { display: flex; align-items: center; gap: 0.8rem; }
  .fc-text { flex: 1; min-width: 0; }
  .fc-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }
  .ghost {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.45rem 0.8rem; font-size: 0.8rem;
    color: var(--fontColor); background: rgb(from var(--tertiaryColor) r g b / 0.7);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.15); border-radius: var(--radius-control);
    cursor: pointer; transition: border-color 0.15s ease;
  }
  .ghost:hover { border-color: #f5c518; }
  .ghost.warn:hover { border-color: #f87171; }
  .ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .catalog-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .catalog-grid .panel { margin-bottom: 0; display: flex; flex-direction: column; }
  .catalog-grid .fields { flex: 1; }

  .fields { display: flex; flex-direction: column; gap: 0.75rem; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.78rem; }
  .field > span { opacity: 0.7; }

  .panel-actions {
    display: flex; align-items: center; justify-content: flex-end; gap: 0.8rem;
    padding-top: 0.9rem; margin-top: 0.9rem;
    border-top: 1px solid rgb(from var(--fontColor) r g b / 0.08);
  }
  .side-link { margin-right: auto; display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: #f5c518; text-decoration: none; opacity: 0.85; }
  .side-link:hover { opacity: 1; text-decoration: underline; }
  .version-tag {
    margin-right: auto; font-size: 0.72rem; font-weight: 700;
    color: #61cd89; background: rgba(97, 205, 137, 0.15);
    border: 1px solid rgba(97, 205, 137, 0.4); border-radius: 9999px; padding: 0.15rem 0.55rem;
  }

  .cta {
    display: inline-flex; align-items: center; gap: 0.45rem;
    padding: 0.5rem 1.1rem; font-size: 0.85rem; font-weight: 600;
    color: #1c1c1e; background: #f5c518; border: none; border-radius: var(--radius-control); cursor: pointer;
  }
  .cta:hover { background: #ffd23f; }
  .cta:disabled { opacity: 0.5; cursor: not-allowed; }

  .hex-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .file-field { display: flex; align-items: center; gap: 0.7rem; font-size: 0.8rem; min-width: 0; }
  .file-field input[type='file'] { font-size: 0.8rem; color: var(--fontColor); }
  .file-name { font-size: 0.75rem; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .running { font-size: 0.7rem; color: #f5c518; font-weight: 700; }
  .ok { font-size: 0.7rem; color: #61cd89; font-weight: 700; }
  .fail { font-size: 0.7rem; color: #f87171; font-weight: 700; }
  .log {
    font-family: ui-monospace, monospace; font-size: 0.75rem; line-height: 1.4;
    white-space: pre-wrap; word-break: break-word; max-height: 16rem; overflow-y: auto;
    padding: 0.8rem; border-radius: var(--radius-control);
    background: rgb(from var(--secondaryColor) r g b / 0.7);
  }

  @media (max-width: 990px) {
    .catalog-grid { grid-template-columns: 1fr; }
    .fc-row { flex-wrap: wrap; }
    .hex-row { flex-direction: column; align-items: stretch; }
  }
</style>
