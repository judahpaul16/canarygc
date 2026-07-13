<script lang="ts">
  import { onMount } from 'svelte';
  import { notify, showModal } from '../../lib/overlays';

  interface FcIdentity { variant: string; firmware: string; version: string; apiVersion: string; }
  interface BetaflightTarget { target: string; manufacturer: string; mcu: string; }
  interface FirmwareRelease { release: string; type: string; date: string; url: string; }
  interface InavRelease { release: string; tag: string; date: string; url: string; targets: string[]; }

  let configured = $state(false);
  let detecting = $state(false);
  let identity = $state<FcIdentity | null>(null);

  let inavReleases = $state<InavRelease[]>([]);
  let inavTag = $state('');
  let inavTarget = $state('');
  let betaflight = $state<{ targets: BetaflightTarget[]; releases: FirmwareRelease[] } | null>(null);
  let betaflightFilter = $state('');
  let catalogsLoading = $state(true);
  let catalogError = $state('');

  let hexName = $state('');
  let hexContent = $state('');
  let flashing = $state(false);
  let flashLog = $state('');
  let flashOk = $state<boolean | null>(null);

  let inavTargets = $derived(inavReleases.find((r) => r.tag === inavTag)?.targets ?? []);
  let betaflightMatches = $derived(
    (betaflight?.targets ?? [])
      .filter((t) => {
        const q = betaflightFilter.trim().toUpperCase();
        return !q || t.target.includes(q) || t.manufacturer.toUpperCase().includes(q);
      })
      .slice(0, 40)
  );

  onMount(async () => {
    try {
      const res = await fetch('/api/msp/status');
      configured = (await res.json()).configured;
    } catch { configured = false; }

    try {
      const [inavRes, bfRes] = await Promise.all([
        fetch('/api/firmware/inav'),
        fetch('/api/firmware/betaflight')
      ]);
      if (inavRes.ok) {
        inavReleases = await inavRes.json();
        inavTag = inavReleases[0]?.tag ?? '';
      }
      if (bfRes.ok) betaflight = await bfRes.json();
      if (!inavRes.ok && !bfRes.ok) catalogError = 'Firmware catalogs are unreachable right now.';
    } catch {
      catalogError = 'Firmware catalogs are unreachable right now.';
    } finally {
      catalogsLoading = false;
    }
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

  function confirmFlash(label: string, body: Record<string, unknown>) {
    showModal({
      title: 'Flash firmware',
      content: `About to flash ${label} to the flight controller in DFU mode. Do not disconnect power during the flash. Continue?`,
      confirmation: true,
      confirmLabel: 'Flash',
      onConfirm: () => runFlash(body)
    });
  }

  async function runFlash(body: Record<string, unknown>) {
    flashing = true;
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
        content: flashOk ? 'The flight controller was flashed.' : 'See the flash log for details.',
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
    <div class="settings rounded-2xl h-full p-6 overflow-y-auto">
      <div class="content">
        <header class="head">
          <h1><i class="fas fa-microchip"></i> Firmware</h1>
          <p>Detect a connected Betaflight or INAV flight controller over MSP and flash it over USB DFU. Put the board in bootloader mode first, using the reboot action below or its boot button.</p>
        </header>

        <section class="panel">
          <div class="panel-head">
            <span class="icon-chip"><i class="fas fa-plug"></i></span>
            <div>
              <h2>Flight controller</h2>
              <p class="muted">Reads firmware and version over the MultiWii Serial Protocol.</p>
            </div>
          </div>
          {#if !configured}
            <p class="muted">No flight controller serial link is configured. Set <code>MSP_SERIAL_PATH</code> to the board's serial device to enable detection and telemetry.</p>
          {:else}
            <div class="fc-actions">
              <button class="ghost" onclick={detect} disabled={detecting}>
                <i class="fas fa-magnifying-glass"></i> {detecting ? 'Detecting...' : 'Detect FC'}
              </button>
              <button class="ghost warn" onclick={rebootToBootloader}>
                <i class="fas fa-power-off"></i> Reboot to bootloader
              </button>
            </div>
            {#if identity}
              <div class="identity">
                <div><span>Firmware</span><strong>{identity.firmware}</strong></div>
                <div><span>Variant</span><strong>{identity.variant}</strong></div>
                <div><span>Version</span><strong>{identity.version}</strong></div>
                <div><span>MSP API</span><strong>{identity.apiVersion}</strong></div>
              </div>
            {/if}
          {/if}
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="icon-chip"><i class="fas fa-download"></i></span>
            <div>
              <h2>INAV firmware</h2>
              <p class="muted">Pick a release and target; the hex downloads and flashes here.</p>
            </div>
          </div>
          {#if catalogsLoading}
            <p class="muted">Loading catalogs...</p>
          {:else if inavReleases.length === 0}
            <p class="muted">{catalogError || 'No INAV releases available.'}</p>
          {:else}
            <div class="fields">
              <label>
                <span>Release</span>
                <select bind:value={inavTag}>
                  {#each inavReleases as r (r.tag)}
                    <option value={r.tag}>{r.release} ({r.date})</option>
                  {/each}
                </select>
              </label>
              <label>
                <span>Target</span>
                <input list="inav-targets" bind:value={inavTarget} placeholder="Type to filter {inavTargets.length} targets" />
                <datalist id="inav-targets">
                  {#each inavTargets as t (t)}<option value={t}></option>{/each}
                </datalist>
              </label>
            </div>
            <div class="actions">
              <button
                class="cta"
                disabled={flashing || !inavTag || !inavTargets.includes(inavTarget)}
                onclick={() => confirmFlash(`INAV ${inavTag} ${inavTarget}`, { source: 'inav', tag: inavTag, target: inavTarget })}
              >
                <i class="fas fa-bolt"></i> Flash INAV
              </button>
            </div>
          {/if}
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="icon-chip"><i class="fas fa-cubes"></i></span>
            <div>
              <h2>Betaflight firmware</h2>
              <p class="muted">Betaflight builds firmware in the cloud; build a hex on their site, then flash it below.</p>
            </div>
          </div>
          {#if catalogsLoading}
            <p class="muted">Loading catalogs...</p>
          {:else if !betaflight}
            <p class="muted">{catalogError || 'No Betaflight catalog available.'}</p>
          {:else}
            <div class="fields">
              <div class="field">
                <span>Latest releases</span>
                <div class="chips">
                  {#each betaflight.releases.slice(0, 5) as r (r.release)}
                    <a class="chip" href={r.url} target="_blank" rel="noreferrer">{r.release} <em>{r.type}</em></a>
                  {/each}
                </div>
              </div>
              <label>
                <span>Find a target ({betaflight.targets.length})</span>
                <input bind:value={betaflightFilter} placeholder="Filter by target or manufacturer" />
              </label>
            </div>
            {#if betaflightFilter.trim()}
              <ul class="target-list">
                {#each betaflightMatches as t (t.target)}
                  <li><strong>{t.target}</strong><span>{t.manufacturer} · {t.mcu}</span></li>
                {/each}
                {#if betaflightMatches.length === 0}<li class="muted">No matching targets.</li>{/if}
              </ul>
            {/if}
            <a class="build-link" href="https://build.betaflight.com" target="_blank" rel="noreferrer">
              <i class="fas fa-up-right-from-square"></i> Open the Betaflight cloud builder
            </a>
          {/if}
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="icon-chip"><i class="fas fa-file-arrow-up"></i></span>
            <div>
              <h2>Flash a HEX file</h2>
              <p class="muted">Flash any Intel HEX, including a cloud-built Betaflight or a custom build.</p>
            </div>
          </div>
          <div class="fields">
            <label class="file-field">
              <span>Firmware file</span>
              <input type="file" accept=".hex" onchange={onHexPick} />
              {#if hexName}<span class="file-name">{hexName}</span>{/if}
            </label>
          </div>
          <div class="actions">
            <button
              class="cta"
              disabled={flashing || !hexContent}
              onclick={() => confirmFlash(hexName, { source: 'hex', hex: hexContent })}
            >
              <i class="fas fa-bolt"></i> Flash HEX
            </button>
          </div>
        </section>

        {#if flashing || flashLog}
          <section class="panel">
            <div class="panel-head">
              <span class="icon-chip"><i class="fas fa-terminal"></i></span>
              <div>
                <h2>Flash log {#if flashOk === true}<span class="ok">success</span>{:else if flashOk === false}<span class="fail">failed</span>{/if}</h2>
                <p class="muted">Output from objcopy and dfu-util.</p>
              </div>
            </div>
            <pre class="log">{flashing ? 'Flashing...' : flashLog}</pre>
          </section>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .dashboard { background-color: var(--secondaryColor); }
  .settings { background: var(--primaryColor); color: var(--fontColor); }
  .content { max-width: 860px; margin: 0 auto; }

  .head { margin-bottom: 1.5rem; padding-bottom: 1.25rem; border-bottom: 1px solid rgb(from var(--fontColor) r g b / 0.08); }
  .head h1 { font-size: 1.6rem; font-weight: 800; display: flex; align-items: center; gap: 0.6rem; }
  .head h1 i { color: #f5c518; }
  .head p { opacity: 0.7; font-size: 0.9rem; margin-top: 0.35rem; }

  .panel {
    background-color: rgb(from var(--tertiaryColor) r g b / 0.32);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.08);
    border-radius: var(--radius-surface);
    padding: 1.35rem 1.5rem;
    margin-bottom: 1.2rem;
  }
  .panel-head {
    display: flex; align-items: flex-start; gap: 0.9rem;
    padding-bottom: 1.1rem; margin-bottom: 1.2rem;
    border-bottom: 1px solid rgb(from var(--fontColor) r g b / 0.08);
  }
  .icon-chip {
    width: 40px; height: 40px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border-radius: var(--radius-control);
    background: rgba(245, 197, 24, 0.12); border: 1px solid rgba(245, 197, 24, 0.28);
    color: #f5c518; font-size: 1rem;
  }
  .panel h2 { font-size: 1rem; font-weight: 700; line-height: 1.2; display: flex; align-items: center; gap: 0.5rem; }
  .muted { opacity: 0.65; font-size: 0.82rem; margin-top: 0.25rem; }
  code { font-family: ui-monospace, monospace; background: rgb(from var(--fontColor) r g b / 0.1); padding: 0.05rem 0.3rem; border-radius: 4px; }

  .fc-actions { display: flex; flex-wrap: wrap; gap: 0.7rem; }
  .ghost {
    display: inline-flex; align-items: center; gap: 0.45rem;
    padding: 0.5rem 0.9rem; font-size: 0.85rem;
    color: var(--fontColor); background: rgb(from var(--tertiaryColor) r g b / 0.7);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.15); border-radius: var(--radius-control);
    cursor: pointer; transition: border-color 0.15s ease;
  }
  .ghost:hover { border-color: #f5c518; }
  .ghost.warn:hover { border-color: #f87171; }
  .ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .identity {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.7rem; margin-top: 1.1rem;
  }
  .identity div { display: flex; flex-direction: column; gap: 0.15rem; }
  .identity span { font-size: 0.7rem; opacity: 0.6; }
  .identity strong { font-size: 0.95rem; }

  .fields { display: flex; flex-direction: column; gap: 0.9rem; }
  .fields label, .fields .field { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.8rem; }
  .fields label > span, .fields .field > span { opacity: 0.7; }
  select, .fields input {
    padding: 0.5rem 0.7rem; font-size: 0.85rem;
    color: var(--fontColor); background: rgb(from var(--tertiaryColor) r g b / 0.7);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.15); border-radius: var(--radius-control);
  }
  .fields input:focus, select:focus { outline: none; border-color: #66e1ff; }
  .file-field input[type='file'] { padding: 0.4rem; }
  .file-name { font-size: 0.75rem; opacity: 0.7; }

  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.35rem;
    padding: 0.3rem 0.6rem; font-size: 0.8rem; border-radius: 9999px;
    background: rgb(from var(--tertiaryColor) r g b / 0.7);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.15); color: var(--fontColor);
  }
  .chip em { font-style: normal; opacity: 0.55; font-size: 0.7rem; }
  .chip:hover { border-color: #f5c518; }

  .target-list { margin-top: 0.9rem; display: flex; flex-direction: column; gap: 0.35rem; max-height: 12rem; overflow-y: auto; }
  .target-list li { display: flex; justify-content: space-between; gap: 1rem; font-size: 0.82rem; padding: 0.35rem 0.6rem; border-radius: var(--radius-control); background: rgb(from var(--tertiaryColor) r g b / 0.5); }
  .target-list li span { opacity: 0.6; }

  .build-link { display: inline-flex; align-items: center; gap: 0.45rem; margin-top: 1rem; font-size: 0.85rem; color: #f5c518; text-decoration: none; }
  .build-link:hover { text-decoration: underline; }

  .actions { display: flex; justify-content: flex-end; padding-top: 1.1rem; margin-top: 1.1rem; border-top: 1px solid rgb(from var(--fontColor) r g b / 0.08); }
  .cta {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.55rem 1.2rem; font-size: 0.9rem; font-weight: 600;
    color: #1c1c1e; background: #f5c518; border: none; border-radius: var(--radius-control); cursor: pointer;
  }
  .cta:hover { background: #ffd23f; }
  .cta:disabled { opacity: 0.5; cursor: not-allowed; }

  .ok { font-size: 0.7rem; color: #61cd89; font-weight: 700; }
  .fail { font-size: 0.7rem; color: #f87171; font-weight: 700; }
  .log {
    font-family: ui-monospace, monospace; font-size: 0.75rem; line-height: 1.4;
    white-space: pre-wrap; word-break: break-word; max-height: 16rem; overflow-y: auto;
    padding: 0.8rem; border-radius: var(--radius-control);
    background: rgb(from var(--secondaryColor) r g b / 0.7);
  }

  @media (max-width: 990px) {
    .identity { grid-template-columns: 1fr 1fr; }
  }
</style>
