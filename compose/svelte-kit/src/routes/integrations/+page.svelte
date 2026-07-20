<script lang="ts">
  import { onMount } from 'svelte';
  import { notify } from '../../lib/overlays';
  import { resolveTiles, TILE_PRESETS, MAPTILER_PRESETS, maptilerTileUrl } from '../../lib/tiles';
  import Select from '../../components/Select.svelte';
  import { mavVideoStreamStore } from '../../stores/mavlinkStore';
  import { safetyLimitsStore } from '../../stores/safetyStore';
  import { m } from '$lib/paraglide/messages';
  let loading = $state(true);
  let saving = $state(false);
  let filter = $state('');

  let email = $state('');
  let smtp = $state({ host: '', port: '587', secure: false, user: '', from: '', pass: '' });
  let passSet = $state(false);
  let openaip = $state('');
  let openaipSet = $state(false);
  let altitudeAngel = $state('');
  let altitudeAngelSet = $state(false);
  let maptiler = $state('');
  let tiles = $state({ light: '', dark: '', satellite: '' });
  let presetPick = $state({ light: '', dark: '', satellite: '' });
  let camera = $state<{ kind: string; url: string; device: string }>({
    kind: 'pi',
    url: '',
    device: '/dev/video0'
  });
  let cameraApplied = $state<boolean | null>(null);
  let ai = $state<{ baseUrl: string; model: string; apiKey: string }>({ baseUrl: '', model: '', apiKey: '' });
  let aiKeySet = $state(false);
  let mavlink = $state<{ signingKey: string; signingLinkId: string; signingStrict: boolean }>({ signingKey: '', signingLinkId: '1', signingStrict: false });
  let failsafe = $state<{ lostOperatorMinutes: string }>({ lostOperatorMinutes: '0' });
  let safety = $state<{ maxAltitudeM: string; minAltitudeM: string; geofenceRadiusM: string }>({
    maxAltitudeM: '120',
    minAltitudeM: '0',
    geofenceRadiusM: '1000'
  });
  let mavKeyVisible = $state(false);
  // Fills a strong random passphrase and reveals it so the operator can copy the
  // same value onto the autopilot; both ends must share it for signing to secure
  // the link.
  function generateSigningPassphrase() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    mavlink.signingKey = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    mavKeyVisible = true;
  }
  let mavlinkKeySet = $state(false);

  const CAMERA_KINDS = [
    { value: 'pi', label: m.int_cam_pi() },
    { value: 'url', label: m.int_cam_url() },
    { value: 'usb', label: m.int_cam_usb() }
  ];

  const detectedStream = $derived($mavVideoStreamStore);

  function useDetectedStream() {
    if (!detectedStream) return;
    camera.kind = 'url';
    camera.url = detectedStream.uri;
  }

  const TILE_PLACEHOLDER = {
    light: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
  };

  // The page search hides panels whose title and field words miss the query,
  // so a long settings page narrows to the one being looked for.
  const PANEL_KEYWORDS = {
    operator: 'operator email password reset alert recipient account',
    smtp: 'email smtp mail server host port username password from tls alerts',
    airspace: 'airspace openaip altitude angel api key faa zones no-fly',
    tiles: 'map tiles basemap maptiler key light dark satellite url preset xyz',
    camera: 'camera video feed source stream live rtsp rtmp srt usb v4l2 capture fpv betaflight mediamtx pi',
    ai: 'ai assistant pid tuning llm openai litellm ollama api key model base url gpt tune',
    mavlink: 'mavlink signing security authentication key passphrase sign verify replay tamper link id strict command injection',
    failsafe: 'failsafe lost operator link loss rtl return autoland recovery timeout minutes unattended',
    safety: 'safety limits maximum altitude ceiling floor geofence radius preflight takeoff meters 400 ft'
  };

  function panelVisible(panel: keyof typeof PANEL_KEYWORDS): boolean {
    const q = filter.trim().toLowerCase();
    return !q || PANEL_KEYWORDS[panel].includes(q);
  }

  function tilePresetGroups(mode: 'light' | 'dark' | 'satellite') {
    const groups = [];
    if (maptiler.trim()) {
      groups.push({
        label: 'MapTiler (your key)',
        options: MAPTILER_PRESETS[mode].map((p) => ({
          value: maptilerTileUrl(p.style, maptiler.trim(), p.ext),
          label: p.label
        }))
      });
    }
    groups.push({ label: 'Keyless', options: TILE_PRESETS[mode].map((p) => ({ value: p.url, label: p.label })) });
    return groups;
  }

  function applyPreset(mode: 'light' | 'dark' | 'satellite', value: string) {
    if (value) tiles[mode] = value;
    presetPick[mode] = '';
  }

  // Save a tile URL only when it differs from the current default, so an
  // autofilled default stays as "use default" rather than a frozen override.
  function tileOverrides() {
    const def = resolveTiles({ maptilerKey: maptiler });
    return {
      light: tiles.light === def.light ? '' : tiles.light,
      dark: tiles.dark === def.dark ? '' : tiles.dark,
      satellite: tiles.satellite === def.satellite ? '' : tiles.satellite
    };
  }

  onMount(async () => {
    try {
      const res = await fetch('/api/integrations');
      const data = await res.json();
      email = data.email ?? '';
      smtp = { host: data.smtp.host, port: String(data.smtp.port), secure: data.smtp.secure, user: data.smtp.user, from: data.smtp.from, pass: '' };
      passSet = data.smtp.passSet;
      openaipSet = data.openaipSet;
      altitudeAngelSet = data.altitudeAngelSet;
      maptiler = data.maptiler ?? '';
      // Autofill with the effective URLs (saved override, else the resolved
      // default) so the fields show what the map is actually using.
      const eff = resolveTiles({
        maptilerKey: maptiler,
        lightUrl: data.tiles?.light,
        darkUrl: data.tiles?.dark,
        satelliteUrl: data.tiles?.satellite
      });
      tiles = { light: eff.light, dark: eff.dark, satellite: eff.satellite };
      if (data.camera) camera = { kind: data.camera.kind ?? 'pi', url: data.camera.url ?? '', device: data.camera.device ?? '/dev/video0' };
      if (data.ai) { ai = { baseUrl: data.ai.baseUrl ?? '', model: data.ai.model ?? '', apiKey: '' }; aiKeySet = data.ai.keySet ?? false; }
      if (data.mavlink) { mavlink = { signingKey: '', signingLinkId: String(data.mavlink.signingLinkId ?? '1'), signingStrict: Boolean(data.mavlink.signingStrict) }; mavlinkKeySet = data.mavlink.signingKeySet ?? false; }
      if (data.failsafe) failsafe = { lostOperatorMinutes: String(data.failsafe.lostOperatorMinutes ?? 0) };
      if (data.safety)
        safety = {
          maxAltitudeM: String(data.safety.maxAltitudeM ?? 120),
          minAltitudeM: String(data.safety.minAltitudeM ?? 0),
          geofenceRadiusM: String(data.safety.geofenceRadiusM ?? 1000)
        };
    } catch {
      notify({ title: m.int_load_failed_title(), content: m.int_load_failed_body(), type: 'warning' });
    } finally {
      loading = false;
    }
  });

  async function save() {
    saving = true;
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          smtp,
          openaip,
          altitudeAngel,
          maptiler,
          tiles: tileOverrides(),
          camera,
          ai,
          mavlink,
          failsafe: { lostOperatorMinutes: Number(failsafe.lostOperatorMinutes) || 0 },
          safety: {
            maxAltitudeM: Number(safety.maxAltitudeM) || 120,
            minAltitudeM: Number(safety.minAltitudeM) || 0,
            geofenceRadiusM: Number(safety.geofenceRadiusM) || 1000
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (smtp.pass) passSet = true;
        if (openaip) openaipSet = true;
        if (altitudeAngel) altitudeAngelSet = true;
        if (ai.apiKey) aiKeySet = true;
        ai.apiKey = '';
        if (mavlink.signingKey) mavlinkKeySet = true;
        mavlink.signingKey = '';
        mavKeyVisible = false;
        smtp.pass = '';
        openaip = '';
        altitudeAngel = '';
        cameraApplied = data.cameraApplied ?? null;
        safetyLimitsStore.update((cur) => ({
          ...cur,
          maxAltitudeM: Number(safety.maxAltitudeM) || 120,
          minAltitudeM: Number(safety.minAltitudeM) || 0,
          geofenceRadiusM: Number(safety.geofenceRadiusM) || 1000
        }));
        notify({ title: m.int_saved_title(), content: m.int_saved_body(), duration: 3000 });
        if (data.signingPushed && !data.signingPushed.ok) {
          notify({ title: m.int_not_keyed_title(), content: data.signingPushed.message, type: 'warning', duration: 5000 });
        } else if (data.signingPushed) {
          notify({ title: m.int_keyed_title(), content: data.signingPushed.message, duration: 4000 });
        }
      } else {
        const data = await res.json();
        notify({ title: m.int_save_failed_title(), content: data.message ?? m.int_save_failed_body(), type: 'warning' });
      }
    } catch {
      notify({ title: m.int_save_failed_title(), content: m.int_network_error(), type: 'warning' });
    } finally {
      saving = false;
    }
  }

  async function disableSigning() {
    saving = true;
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mavlink: { clearSigningKey: true, signingStrict: false } })
      });
      if (res.ok) {
        mavlinkKeySet = false;
        mavlink = { signingKey: '', signingLinkId: mavlink.signingLinkId, signingStrict: false };
        notify({ title: m.int_signing_disabled_title(), content: m.int_signing_disabled_body(), duration: 3000 });
      } else {
        notify({ title: m.int_save_failed_title(), content: m.int_disable_failed(), type: 'warning' });
      }
    } catch {
      notify({ title: m.int_save_failed_title(), content: m.int_network_error(), type: 'warning' });
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>{m.int_page_title()}</title>
</svelte:head>

<div
  class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0"
>
  <div class="dashboard w-full p-5 rounded-3xl rounded-l-none overflow-auto overflow-x-hidden h-[90vh] max-h-[90vh]">
    <div class="settings rounded-2xl h-full p-6 overflow-y-auto">
      <div class="content">
  <header class="head">
    <div class="head-row">
      <h1><i class="fas fa-plug"></i> {m.nav_integrations()}</h1>
      <div class="search">
        <i class="fas fa-magnifying-glass"></i>
        <input bind:value={filter} placeholder={m.int_search()} aria-label={m.int_search()} />
      </div>
    </div>
    <p>{m.int_intro()}</p>
  </header>

  {#if loading}
    <div class="panel"><p class="muted">{m.common_loading()}</p></div>
  {:else}
    <form onsubmit={(e) => { e.preventDefault(); save(); }}>
      {#if filter.trim() && !panelVisible('operator') && !panelVisible('smtp') && !panelVisible('airspace') && !panelVisible('tiles') && !panelVisible('camera') && !panelVisible('ai') && !panelVisible('mavlink') && !panelVisible('failsafe') && !panelVisible('safety')}
        <div class="panel"><p class="muted">{m.int_no_match({ filter })}</p></div>
      {/if}
      <div class="settings-grid">
      <div class="col-main">
      {#if panelVisible('smtp')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-envelope"></i></span>
          <div>
            <h2>{m.int_smtp_title()}</h2>
            <p class="muted">{m.int_smtp_desc()}</p>
          </div>
        </div>
        <div class="grid">
          <div class="field">
            <label for="smtp-host">{m.int_host()}</label>
            <input id="smtp-host" bind:value={smtp.host} placeholder="mail.example.com" />
          </div>
          <div class="field narrow">
            <label for="smtp-port">{m.int_port()}</label>
            <input id="smtp-port" bind:value={smtp.port} placeholder="587" inputmode="numeric" />
          </div>
        </div>
        <div class="grid">
          <div class="field">
            <label for="smtp-user">{m.int_username()}</label>
            <input id="smtp-user" bind:value={smtp.user} autocomplete="off" placeholder="alerts@example.com" />
          </div>
          <div class="field">
            <label for="smtp-pass">{m.int_password()}</label>
            <input
              id="smtp-pass"
              type="password"
              bind:value={smtp.pass}
              autocomplete="new-password"
              placeholder={passSet ? m.int_saved_placeholder() : m.int_smtp_pass_placeholder()}
            />
          </div>
        </div>
        <div class="grid">
          <div class="field">
            <label for="smtp-from">{m.int_from()}</label>
            <input id="smtp-from" bind:value={smtp.from} placeholder="canary@example.com" />
          </div>
          <div class="field toggle-field">
            <span class="toggle-label">{m.int_tls()}</span>
            <label class="switch">
              <input type="checkbox" bind:checked={smtp.secure} />
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </section>
      {/if}

      {#if panelVisible('tiles')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-map"></i></span>
          <div>
            <h2>{m.int_tiles_title()}</h2>
            <p class="muted">{m.int_tiles_desc()}</p>
          </div>
        </div>
        <div class="field">
          <label for="maptiler">{m.int_maptiler_key()}<a class="key-link" href="https://cloud.maptiler.com/account/keys/" target="_blank" rel="noopener">{m.int_get_key()} <i class="fa-solid fa-square-arrow-up-right"></i></a></label>
          <input id="maptiler" bind:value={maptiler} autocomplete="off" placeholder={m.int_maptiler_placeholder()} />
        </div>
        {#each ['light', 'dark', 'satellite'] as const as mode (mode)}
          <div class="field">
            <label for="tiles-{mode}">{mode === 'light' ? m.int_basemap_light() : mode === 'dark' ? m.int_basemap_dark() : m.int_basemap_satellite()}</label>
            <div class="tile-row">
              <div class="preset">
                <Select
                  bind:value={presetPick[mode]}
                  placeholder={m.int_preset()}
                  groups={tilePresetGroups(mode)}
                  onchange={(v) => applyPreset(mode, v)}
                />
              </div>
              <input id="tiles-{mode}" bind:value={tiles[mode]} autocomplete="off" placeholder={TILE_PLACEHOLDER[mode]} />
            </div>
          </div>
        {/each}
      </section>
      {/if}

      {#if panelVisible('camera')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-video"></i></span>
          <div>
            <h2>{m.int_camera_title()}</h2>
            <p class="muted">{m.int_camera_desc()}</p>
          </div>
        </div>
        {#if detectedStream}
          <div class="detected">
            <div>
              <span class="badge">{m.int_detected()}</span>
              {m.int_camera_advertises({ suffix: detectedStream.name ? ` (${detectedStream.name})` : '' })}
              <code class="uri">{detectedStream.uri}</code>
            </div>
            <button type="button" class="mini" onclick={useDetectedStream}>{m.int_use_url()}</button>
          </div>
        {/if}
        <div class="field">
          <label for="camera-kind">{m.int_source_type()}</label>
          <Select id="camera-kind" bind:value={camera.kind} options={CAMERA_KINDS} />
        </div>
        {#if camera.kind === 'url'}
          <div class="field">
            <label for="camera-url">{m.int_stream_url()}</label>
            <input id="camera-url" bind:value={camera.url} autocomplete="off" placeholder="rtsp://user:pass@192.168.1.50:554/stream" />
            <p class="hint">{m.int_stream_hint()}</p>
          </div>
        {:else if camera.kind === 'usb'}
          <div class="field">
            <label for="camera-device">{m.int_capture_device()}</label>
            <input id="camera-device" bind:value={camera.device} autocomplete="off" placeholder="/dev/video0" />
            <p class="hint">{m.int_capture_hint()}</p>
          </div>
        {:else}
          <p class="hint">{m.int_pi_hint()}</p>
        {/if}
        {#if cameraApplied !== null}
          <p class="hint">{cameraApplied ? m.int_cam_applied() : m.int_cam_saved()}</p>
        {/if}
      </section>
      {/if}

      {#if panelVisible('ai')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-robot"></i></span>
          <div>
            <h2>{m.int_ai_title()}</h2>
            <p class="muted">{m.int_ai_desc()}</p>
          </div>
        </div>
        <div class="field">
          <label for="ai-key">{m.int_api_key()} {#if aiKeySet}<span class="badge">{m.int_badge_saved()}</span>{/if}</label>
          <input id="ai-key" type="password" bind:value={ai.apiKey} autocomplete="off" placeholder={aiKeySet ? m.int_ai_key_set() : 'sk-...'} />
        </div>
        <div class="field">
          <label for="ai-base">{m.int_base_url()}</label>
          <input id="ai-base" bind:value={ai.baseUrl} autocomplete="off" placeholder="https://api.openai.com/v1" />
          <p class="hint">{m.int_ai_base_hint()}</p>
        </div>
        <div class="field">
          <label for="ai-model">{m.int_model()}</label>
          <input id="ai-model" bind:value={ai.model} autocomplete="off" placeholder="gpt-4o-mini" />
        </div>
      </section>
      {/if}

      {#if panelVisible('mavlink')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-shield-halved"></i></span>
          <div>
            <h2>{m.int_mav_title()}</h2>
            <p class="muted">{m.int_mav_desc()}</p>
          </div>
        </div>
        <div class="field">
          <label for="mav-key">{m.int_signing_passphrase()} {#if mavlinkKeySet}<span class="badge">{m.int_badge_active()}</span>{/if}<button type="button" class="key-link" onclick={generateSigningPassphrase}>{m.int_generate()} <i class="fa-solid fa-key"></i></button></label>
          <input id="mav-key" type={mavKeyVisible ? 'text' : 'password'} bind:value={mavlink.signingKey} autocomplete="off" placeholder={mavlinkKeySet ? m.int_mav_key_set() : m.int_mav_key_placeholder()} />
          <p class="hint">{m.int_mav_key_hint()}</p>
        </div>
        <div class="field">
          <label for="mav-link">{m.int_link_id()}</label>
          <input id="mav-link" type="number" min="0" max="255" bind:value={mavlink.signingLinkId} autocomplete="off" placeholder="1" />
          <p class="hint">{m.int_link_hint()}</p>
        </div>
        <div class="field toggle-field">
          <span class="toggle-label">{m.int_reject_unsigned()}</span>
          <label class="switch">
            <input type="checkbox" bind:checked={mavlink.signingStrict} />
            <span class="slider"></span>
          </label>
        </div>
        <p class="hint">{m.int_strict_hint()}</p>
        {#if mavlinkKeySet}
          <button type="button" class="mini" onclick={disableSigning} disabled={saving}>{m.int_turn_off_signing()}</button>
        {/if}
      </section>
      {/if}

      {#if panelVisible('failsafe')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-life-ring"></i></span>
          <div>
            <h2>{m.int_failsafe_title()}</h2>
            <p class="muted">{m.int_failsafe_desc()}</p>
          </div>
        </div>
        <div class="field">
          <label for="fs-minutes">{m.int_failsafe_minutes()}</label>
          <input id="fs-minutes" type="number" min="0" max="720" step="1" bind:value={failsafe.lostOperatorMinutes} autocomplete="off" placeholder="0" />
          <p class="hint">{m.int_failsafe_hint()}</p>
        </div>
      </section>
      {/if}

      {#if panelVisible('safety')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-shield-halved"></i></span>
          <div>
            <h2>{m.int_safety_title()}</h2>
            <p class="muted">{m.int_safety_desc()}</p>
          </div>
        </div>
        <div class="field">
          <label for="safety-max-alt">{m.int_safety_max_alt()}</label>
          <input id="safety-max-alt" type="number" min="1" step="1" bind:value={safety.maxAltitudeM} autocomplete="off" placeholder="120" />
          <p class="hint">{m.int_safety_max_alt_hint()}</p>
        </div>
        <div class="field">
          <label for="safety-min-alt">{m.int_safety_min_alt()}</label>
          <input id="safety-min-alt" type="number" min="0" step="1" bind:value={safety.minAltitudeM} autocomplete="off" placeholder="0" />
        </div>
        <div class="field">
          <label for="safety-geofence">{m.int_safety_geofence()}</label>
          <input id="safety-geofence" type="number" min="1" step="1" bind:value={safety.geofenceRadiusM} autocomplete="off" placeholder="1000" />
        </div>
      </section>
      {/if}
      </div>

      <div class="col-side">
      {#if panelVisible('operator')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-user-gear"></i></span>
          <div>
            <h2>{m.int_operator_title()}</h2>
            <p class="muted">{m.int_operator_desc()}</p>
          </div>
        </div>
        <div class="field">
          <label for="email">{m.int_operator_email()}</label>
          <input type="email" id="email" bind:value={email} autocomplete="email" placeholder="operator@example.com" />
        </div>
      </section>
      {/if}

      {#if panelVisible('airspace')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-tower-broadcast"></i></span>
          <div>
            <h2>{m.int_airspace_title()}</h2>
            <p class="muted">{m.int_airspace_desc()}</p>
          </div>
        </div>
        <div class="field">
          <label for="openaip">{m.int_openaip_key()} {#if openaipSet}<span class="badge">{m.int_badge_configured()}</span>{/if}<a class="key-link" href="https://www.openaip.net/" target="_blank" rel="noopener">{m.int_get_key()} <i class="fa-solid fa-square-arrow-up-right"></i></a></label>
          <input id="openaip" bind:value={openaip} autocomplete="off" placeholder={openaipSet ? m.int_saved_placeholder() : m.int_openaip_placeholder()} />
        </div>
        <div class="field">
          <label for="altitude-angel">{m.int_altitude_key()} {#if altitudeAngelSet}<span class="badge">{m.int_badge_configured()}</span>{/if}<a class="key-link" href="https://developers.altitudeangel.com" target="_blank" rel="noopener">{m.int_get_key()} <i class="fa-solid fa-square-arrow-up-right"></i></a></label>
          <input id="altitude-angel" bind:value={altitudeAngel} autocomplete="off" placeholder={altitudeAngelSet ? m.int_saved_placeholder() : m.int_altitude_placeholder()} />
        </div>
      </section>
      {/if}
      <div class="actions">
        <button type="submit" class="cta" disabled={saving}>
          <i class="fas fa-floppy-disk"></i> {saving ? m.int_saving() : m.int_save()}
        </button>
      </div>
      </div>
      </div>
    </form>
  {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .dashboard {
    background-color: var(--secondaryColor);
  }

  .settings {
    background: var(--primaryColor);
    color: var(--fontColor);
  }

  .content {
    max-width: 980px;
    margin: 0 auto;
    padding-bottom: 3rem;
  }

  /* Primary sections (SMTP, map tiles) stack in a wider left column; the
     short operator and airspace cards sit in a narrower right column, so the
     page reads as two balanced columns rather than one tall stack. */
  .settings-grid {
    display: grid;
    grid-template-columns: 1.9fr 1fr;
    gap: 1rem;
    align-items: start;
  }

  .col-main,
  .col-side {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  /* The short right column follows the viewport while the settings scroll, so
     Save stays reachable without scrolling back to the bottom. */
  .col-side {
    position: sticky;
    top: 1rem;
    align-self: start;
  }

  .settings-grid .panel {
    margin-bottom: 0;
  }

  @media (max-width: 900px) {
    .settings-grid {
      grid-template-columns: 1fr;
    }
    .col-side {
      position: static;
    }
  }

  .head {
    margin-bottom: 1.35rem;
    padding-bottom: 1.1rem;
    border-bottom: 1px solid rgb(from var(--fontColor) r g b / 0.08);
  }

  .head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .search {
    position: relative;
    width: 16rem;
    max-width: 100%;
  }

  .search i {
    position: absolute;
    left: 0.8rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.75rem;
    opacity: 0.5;
    pointer-events: none;
  }

  .search input {
    width: 100%;
    padding: 0.5rem 0.8rem 0.5rem 2.1rem;
    font-size: 0.85rem;
  }

  .head h1 {
    font-size: 1.6rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .head h1 i {
    color: #f5c518;
  }

  .head p {
    opacity: 0.7;
    font-size: 0.9rem;
    margin-top: 0.35rem;
  }

  .panel {
    background-color: rgb(from var(--tertiaryColor) r g b / 0.32);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.08);
    border-radius: var(--radius-surface);
    padding: 1.1rem 1.3rem;
    margin-bottom: 1rem;
  }

  .panel-head {
    display: flex;
    align-items: flex-start;
    gap: 0.9rem;
    padding-bottom: 0.9rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid rgb(from var(--fontColor) r g b / 0.08);
  }

  .icon-chip {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-control);
    background: rgba(245, 197, 24, 0.12);
    border: 1px solid rgba(245, 197, 24, 0.28);
    color: #f5c518;
    font-size: 1rem;
  }

  .panel h2 {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .muted {
    opacity: 0.65;
    font-size: 0.82rem;
    margin-top: 0.25rem;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.9rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    margin-bottom: 0.75rem;
  }

  .field.narrow {
    max-width: 140px;
  }

  label {
    font-size: 0.8rem;
    font-weight: 600;
    opacity: 0.85;
    margin-bottom: 0.35rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .key-link {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.72rem;
    font-weight: 500;
    color: #f5c518;
    text-decoration: none;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    opacity: 0.8;
    transition: opacity 0.2s;
  }
  .key-link:hover {
    opacity: 1;
    text-decoration: underline;
  }

  input {
    background-color: rgb(from var(--tertiaryColor) r g b / 0.7);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.12);
    color: var(--fontColor);
    border-radius: var(--radius-control);
    padding: 0.55rem 0.8rem;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  }

  .tile-row {
    display: flex;
    gap: 0.5rem;
  }

  .tile-row input {
    flex: 1;
    min-width: 0;
  }

  .preset {
    flex-shrink: 0;
    width: 11.5rem;
  }

  input::placeholder {
    color: rgb(from var(--fontColor) r g b / 0.35);
  }

  input:hover {
    border-color: rgb(from var(--fontColor) r g b / 0.22);
  }

  input:focus {
    border-color: #f5c518;
    background-color: rgb(from var(--tertiaryColor) r g b / 0.9);
    box-shadow: 0 0 0 3px rgba(245, 197, 24, 0.18);
  }

  .badge {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #61cd89;
    background: rgba(97, 205, 137, 0.15);
    border: 1px solid rgba(97, 205, 137, 0.4);
    border-radius: 9999px;
    padding: 0.1rem 0.5rem;
  }

  .hint {
    opacity: 0.6;
    font-size: 0.78rem;
    margin-top: 0.35rem;
    line-height: 1.35;
  }

  code {
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
    background: rgb(from var(--fontColor) r g b / 0.08);
    padding: 0.05rem 0.3rem;
    border-radius: 0.3rem;
  }

  .detected {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    justify-content: space-between;
    background: rgba(97, 205, 137, 0.08);
    border: 1px solid rgba(97, 205, 137, 0.35);
    border-radius: 0.6rem;
    padding: 0.6rem 0.75rem;
    margin-bottom: 0.9rem;
    font-size: 0.82rem;
  }
  .detected .uri {
    display: inline-block;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .mini {
    flex-shrink: 0;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--fontColor);
    background: rgb(from var(--fontColor) r g b / 0.08);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.15);
    border-radius: 0.45rem;
    padding: 0.3rem 0.6rem;
    cursor: pointer;
  }
  .mini:hover {
    background: rgb(from var(--fontColor) r g b / 0.16);
  }

  .toggle-field {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    align-self: end;
    margin-bottom: 0.9rem;
    background-color: rgb(from var(--tertiaryColor) r g b / 0.7);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.12);
    border-radius: var(--radius-control);
    padding: 0.5rem 0.8rem;
  }

  .toggle-label {
    font-size: 0.85rem;
    font-weight: 600;
    opacity: 0.85;
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 42px;
    height: 24px;
    flex-shrink: 0;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: rgb(from var(--secondaryColor) r g b / 90%);
    border-radius: 9999px;
    transition: background 0.2s ease;
  }

  .slider::before {
    content: '';
    position: absolute;
    height: 18px;
    width: 18px;
    left: 3px;
    top: 3px;
    background: #ffffff;
    border-radius: 50%;
    transition: transform 0.2s ease;
  }

  .switch input:checked + .slider {
    background: #f5c518;
  }

  .switch input:checked + .slider::before {
    transform: translateX(18px);
  }

  .actions {
    display: flex;
    margin-top: 0.25rem;
    padding-top: 1rem;
    border-top: 1px solid rgb(from var(--fontColor) r g b / 0.08);
  }

  .cta {
    display: inline-flex;
    width: 100%;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: #f5c518;
    color: #1c1c1e;
    font-weight: 700;
    padding: 0.7rem 1.4rem;
    border: none;
    border-radius: var(--radius-control);
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(245, 197, 24, 0.35);
    background: #ffd23f;
  }

  .cta:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  @media (max-width: 990px) {
    .dashboard {
      border-radius: 0;
      padding: 0.7em;
      height: 100%;
      max-height: 95vh;
    }

    .grid {
      grid-template-columns: 1fr;
    }

    .field.narrow {
      max-width: none;
    }

    .actions {
      justify-content: stretch;
    }

    .cta {
      width: 100%;
      justify-content: center;
    }
  }
</style>
