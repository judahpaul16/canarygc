<script lang="ts">
  import { onMount } from 'svelte';
  import { notify, showModal } from '../../lib/overlays';
  import { m } from '$lib/paraglide/messages';
  import Select from '../../components/Select.svelte';

  interface FcIdentity { variant: string; firmware: string; version: string; apiVersion: string; boardIdentifier: string; targetName: string; boardName: string; }
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
    // Auto-detect a connected board so it shows on load without a manual click.
    if (configured) detect();

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
      if (res.ok) {
        identity = data;
        autoSelectTarget(data);
      }
      else notify({ title: m.fw_no_fc_title(), content: data.error ?? m.fw_no_fc_body(), type: 'warning' });
    } catch {
      notify({ title: m.fw_detect_failed_title(), content: m.fw_detect_failed_body(), type: 'warning' });
    } finally {
      detecting = false;
    }
  }

  // Matches the detected board's target name (falling back to its board name
  // and 4-char identifier) against the loaded catalog and selects it, so a
  // detected Betaflight or INAV board fills its own target.
  function autoSelectTarget(id: FcIdentity) {
    const candidates = [id.targetName, id.boardName, id.boardIdentifier]
      .map((s) => (s ?? '').trim())
      .filter(Boolean);
    if (candidates.length === 0) return;
    const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

    if (id.firmware === 'INAV') {
      const match = inavTargets.find((t) => candidates.some((c) => eq(t, c)));
      if (match) { inavTarget = match; notify({ title: 'Target detected', content: `Selected INAV target ${match}.`, duration: 4000 }); }
      else notify({ title: 'Board detected', content: `${candidates[0]} has no match in this release. Search and pick the target.`, type: 'info', duration: 5000 });
    } else if (id.firmware === 'Betaflight') {
      const match = (betaflight?.targets ?? []).find((t) => candidates.some((c) => eq(t.target, c)));
      if (match) { bfTarget = match.target; notify({ title: 'Target detected', content: `Selected Betaflight target ${match.target}.`, duration: 4000 }); }
      else notify({ title: 'Board detected', content: `${candidates[0]} has no cloud target match. Search and pick the target.`, type: 'info', duration: 5000 });
    }
  }

  function rebootToBootloader() {
    showModal({
      title: m.fw_reboot_title(),
      content: m.fw_reboot_body(),
      confirmation: true,
      confirmLabel: 'Reboot',
      onConfirm: async () => {
        try {
          await fetch('/api/msp/reboot-bootloader', { method: 'POST' });
          identity = null;
          notify({ title: m.fw_rebooting_title(), content: m.fw_rebooting_body(), duration: 4000 });
        } catch {
          notify({ title: m.fw_reboot_failed_title(), content: m.fw_reboot_failed_body(), type: 'warning' });
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
      title: m.fw_flash_title(),
      content: m.fw_flash_confirm({ label, note: note ? ` ${note}` : '' }),
      confirmation: true,
      confirmLabel: m.fw_flash_btn(),
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
      flashLog = data.output ?? data.error ?? (flashOk ? m.fw_flash_complete_log() : m.fw_flash_failed_log());
      notify({
        title: flashOk ? m.fw_flash_complete_title() : m.fw_flash_failed_title(),
        content: flashOk ? m.fw_flashed({ label }) : m.fw_see_log(),
        type: flashOk ? 'success' : 'warning'
      });
    } catch {
      flashOk = false;
      flashLog = m.fw_flash_network_error();
    } finally {
      flashing = false;
    }
  }
</script>

<svelte:head>
  <title>{m.fw_page_title()}</title>
</svelte:head>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
  <div class="dashboard w-full p-5 rounded-3xl rounded-l-none overflow-auto overflow-x-hidden h-[90vh] max-h-[90vh]">
    <div class="settings rounded-2xl h-full overflow-y-auto">
      <div class="content">
        <header class="head">
          <h1><i class="fas fa-microchip"></i> {m.nav_firmware()}</h1>
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- static app copy with inline markup -->
          <p>{@html m.fw_intro()}</p>
        </header>

        <section class="panel fc-panel">
          <div class="fc-row">
            <span class="icon-chip small"><i class="fas fa-plug"></i></span>
            <div class="fc-text">
              <h2>{m.fw_fc_msp_title()}</h2>
              {#if !configured}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- static app copy with inline markup -->
                <p class="muted">{@html m.fw_fc_not_configured()}</p>
              {:else if identity}
                <p class="muted">{m.fw_fc_identity({ firmware: identity.firmware, version: identity.version, variant: identity.variant, api: identity.apiVersion })}{#if identity.targetName || identity.boardName}{m.fw_fc_board_suffix({ board: identity.boardName || identity.targetName })}{/if}</p>
              {:else}
                <p class="muted">{m.fw_fc_reads()}</p>
              {/if}
            </div>
            {#if configured}
              <div class="fc-actions">
                <button class="ghost" onclick={detect} disabled={detecting}>
                  <i class="fas fa-magnifying-glass"></i> {detecting ? m.fw_detecting() : m.fw_detect()}
                </button>
                <button class="ghost warn" onclick={rebootToBootloader}>
                  <i class="fas fa-power-off"></i> {m.fw_bootloader()}
                </button>
              </div>
            {/if}
          </div>
        </section>

        {#if catalogsLoading}
          <section class="panel"><p class="muted">{m.fw_catalogs_loading()}</p></section>
        {:else}
          <div class="catalog-grid">
            <section class="panel">
              <div class="panel-head">
                <span class="icon-chip"><i class="fas fa-paper-plane"></i></span>
                <div>
                  <h2>INAV</h2>
                  <p class="muted">{m.fw_inav_desc()}</p>
                </div>
              </div>
              {#if inavReleases.length === 0}
                <p class="muted">{m.fw_inav_unreachable()}</p>
              {:else}
                <div class="fields">
                  <div class="field">
                    <span>{m.fw_release()}</span>
                    <Select
                      bind:value={inavTag}
                      options={inavReleases.map((r) => ({ value: r.tag, label: `${r.release} (${r.date})` }))}
                    />
                  </div>
                  <div class="field">
                    <span>{m.fw_target()}</span>
                    <Select
                      bind:value={inavTarget}
                      searchable
                      placeholder={m.fw_search_targets({ count: inavTargets.length })}
                      options={inavTargets.map((t) => ({ value: t, label: t }))}
                    />
                  </div>
                </div>
                <div class="panel-actions">
                  <button
                    class="cta"
                    disabled={flashing || !inavTag || !inavTargets.includes(inavTarget)}
                    onclick={() => confirmFlash(m.fw_flash_label({ name: `INAV ${inavTag}`, target: inavTarget }), { source: 'inav', tag: inavTag, target: inavTarget }, m.fw_note_dfu())}
                  >
                    <i class="fas fa-bolt"></i> {m.fw_flash_btn()}
                  </button>
                </div>
              {/if}
            </section>

            <section class="panel">
              <div class="panel-head">
                <span class="icon-chip"><i class="fas fa-cubes"></i></span>
                <div>
                  <h2>Betaflight</h2>
                  <p class="muted">{m.fw_betaflight_desc()}</p>
                </div>
              </div>
              {#if !betaflight}
                <p class="muted">{m.fw_betaflight_unreachable()}</p>
              {:else}
                <div class="fields">
                  <div class="field">
                    <span>{m.fw_release()}</span>
                    <Select bind:value={bfRelease} options={bfReleaseOptions} />
                  </div>
                  <div class="field">
                    <span>{m.fw_target()}</span>
                    <Select
                      bind:value={bfTarget}
                      searchable
                      placeholder={m.fw_search_targets({ count: betaflight.targets.length })}
                      options={bfTargetOptions}
                    />
                  </div>
                </div>
                <div class="panel-actions">
                  <a class="side-link" href="https://build.betaflight.com" target="_blank" rel="noreferrer">
                    <i class="fas fa-up-right-from-square"></i> {m.fw_custom_builds()}
                  </a>
                  <button
                    class="cta"
                    disabled={flashing || !bfRelease || !bfTargetValid}
                    onclick={() => confirmFlash(m.fw_flash_label({ name: `Betaflight ${bfRelease}`, target: bfTarget }), { source: 'betaflight', release: bfRelease, target: bfTarget }, m.fw_note_betaflight())}
                  >
                    <i class="fas fa-bolt"></i> {m.fw_build_flash()}
                  </button>
                </div>
              {/if}
            </section>

            <section class="panel">
              <div class="panel-head">
                <span class="icon-chip"><i class="fas fa-helicopter"></i></span>
                <div>
                  <h2>ArduPilot</h2>
                  <p class="muted">{m.fw_ardupilot_desc()}</p>
                </div>
              </div>
              {#if !ardupilot}
                <p class="muted">{m.fw_ardupilot_unreachable()}</p>
              {:else}
                <div class="fields">
                  <div class="field">
                    <span>{m.fw_vehicle()}</span>
                    <Select
                      bind:value={apVehicle}
                      options={Object.keys(ardupilot).map((v) => ({ value: v, label: v }))}
                      onchange={() => (apBoard = '')}
                    />
                  </div>
                  <div class="field">
                    <span>{m.fw_board()}</span>
                    <Select
                      bind:value={apBoard}
                      searchable
                      placeholder={m.fw_search_boards({ count: apBoards.length })}
                      options={apBoards.map((b) => ({ value: b.platform, label: b.brand || b.platform }))}
                    />
                  </div>
                </div>
                <div class="panel-actions">
                  {#if apSelected}<span class="version-tag">{apSelected.version}</span>{/if}
                  <button
                    class="cta"
                    disabled={flashing || !apSelected}
                    onclick={() => apSelected && confirmFlash(m.fw_flash_label({ name: `ArduPilot ${apVehicle} ${apSelected.version}`, target: apBoard }), { source: 'ardupilot', url: apSelected.url }, m.fw_note_autopilot())}
                  >
                    <i class="fas fa-bolt"></i> {m.fw_flash_btn()}
                  </button>
                </div>
              {/if}
            </section>

            <section class="panel">
              <div class="panel-head">
                <span class="icon-chip"><i class="fas fa-jet-fighter-up"></i></span>
                <div>
                  <h2>PX4</h2>
                  <p class="muted">{m.fw_px4_desc()}</p>
                </div>
              </div>
              {#if px4Releases.length === 0}
                <p class="muted">{m.fw_px4_unreachable()}</p>
              {:else}
                <div class="fields">
                  <div class="field">
                    <span>{m.fw_release()}</span>
                    <Select
                      bind:value={px4Tag}
                      options={px4Releases.map((r) => ({ value: r.tag, label: `${r.release} (${r.date})` }))}
                      onchange={() => (px4Board = '')}
                    />
                  </div>
                  <div class="field">
                    <span>{m.fw_board()}</span>
                    <Select
                      bind:value={px4Board}
                      searchable
                      placeholder={m.fw_search_boards({ count: px4Boards.length })}
                      options={px4Boards.map((b) => ({ value: b.board, label: b.board }))}
                    />
                  </div>
                </div>
                <div class="panel-actions">
                  <button
                    class="cta"
                    disabled={flashing || !px4Selected}
                    onclick={() => px4Selected && confirmFlash(m.fw_flash_label({ name: `PX4 ${px4Tag}`, target: px4Board }), { source: 'px4', url: px4Selected.url }, m.fw_note_autopilot())}
                  >
                    <i class="fas fa-bolt"></i> {m.fw_flash_btn()}
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
              <h2>{m.fw_hex_title()}</h2>
              <p class="muted">{m.fw_hex_desc()}</p>
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
              onclick={() => confirmFlash(hexName, { source: 'hex', hex: hexContent }, m.fw_note_dfu())}
            >
              <i class="fas fa-bolt"></i> {m.fw_flash_btn()}
            </button>
          </div>
        </section>

        {#if flashing || flashLog}
          <section class="panel">
            <div class="panel-head">
              <span class="icon-chip"><i class="fas fa-terminal"></i></span>
              <div>
                <h2>
                  {m.fw_flash_log()}
                  {#if flashing}<span class="running">{flashLabel}...</span>
                  {:else if flashOk === true}<span class="ok">{m.fw_success()}</span>
                  {:else if flashOk === false}<span class="fail">{m.fw_failed_lower()}</span>{/if}
                </h2>
              </div>
            </div>
            <pre class="log">{flashing ? m.fw_flashing({ label: flashLabel }) : flashLog}</pre>
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
  .content { max-width: 1080px; margin: 0 auto; padding-bottom: 2.5rem; }

  .head { margin-bottom: 1.35rem; padding-bottom: 1.1rem; border-bottom: 1px solid rgb(from var(--fontColor) r g b / 0.08); }
  .head h1 { font-size: 1.6rem; font-weight: 800; display: flex; align-items: center; gap: 0.6rem; }
  .head h1 i { color: #f5c518; }
  .head p { opacity: 0.7; font-size: 0.9rem; margin-top: 0.35rem; max-width: 62rem; }
  .head :global(strong) { color: #f5c518; font-weight: 600; }

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
  .content :global(code) { font-family: ui-monospace, monospace; background: rgb(from var(--fontColor) r g b / 0.1); padding: 0.05rem 0.3rem; border-radius: 4px; }

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
    gap: 1.25rem;
    margin-bottom: 1.25rem;
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
