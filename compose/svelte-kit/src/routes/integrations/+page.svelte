<script lang="ts">
  import { onMount } from 'svelte';
  import { notify } from '../../lib/overlays';
  import { resolveTiles, TILE_PRESETS, MAPTILER_PRESETS, maptilerTileUrl } from '../../lib/tiles';
  import Select from '../../components/Select.svelte';
  import { mavVideoStreamStore } from '../../stores/mavlinkStore';
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
    { value: 'pi', label: 'Raspberry Pi camera' },
    { value: 'url', label: 'RTSP / RTMP / SRT URL' },
    { value: 'usb', label: 'USB / V4L2 capture device' }
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
    mavlink: 'mavlink signing security authentication key passphrase sign verify replay tamper link id strict command injection'
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
    } catch {
      notify({ title: 'Load failed', content: 'Could not load integration settings.', type: 'warning' });
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
        body: JSON.stringify({ email, smtp, openaip, altitudeAngel, maptiler, tiles: tileOverrides(), camera, ai, mavlink })
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
        notify({ title: 'Integrations saved', content: 'Your integration settings have been updated.', duration: 3000 });
        if (data.signingPushed && !data.signingPushed.ok) {
          notify({ title: 'Vehicle not keyed yet', content: data.signingPushed.message, type: 'warning', duration: 5000 });
        } else if (data.signingPushed) {
          notify({ title: 'Vehicle keyed', content: data.signingPushed.message, duration: 4000 });
        }
      } else {
        const data = await res.json();
        notify({ title: 'Save failed', content: data.message ?? 'Could not save settings.', type: 'warning' });
      }
    } catch {
      notify({ title: 'Save failed', content: 'Network error while saving.', type: 'warning' });
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
        notify({ title: 'Signing disabled', content: 'MAVLink messages are sent and accepted unsigned.', duration: 3000 });
      } else {
        notify({ title: 'Save failed', content: 'Could not disable signing.', type: 'warning' });
      }
    } catch {
      notify({ title: 'Save failed', content: 'Network error while saving.', type: 'warning' });
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Canary Ground Control - Integrations</title>
</svelte:head>

<div
  class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0"
>
  <div class="dashboard w-full p-5 rounded-3xl rounded-l-none overflow-auto overflow-x-hidden h-[90vh] max-h-[90vh]">
    <div class="settings rounded-2xl h-full p-6 overflow-y-auto">
      <div class="content">
  <header class="head">
    <div class="head-row">
      <h1><i class="fas fa-plug"></i> Integrations</h1>
      <div class="search">
        <i class="fas fa-magnifying-glass"></i>
        <input bind:value={filter} placeholder="Search settings" aria-label="Search settings" />
      </div>
    </div>
    <p>Connect external services. Secrets are stored on this station and never shown again after saving.</p>
  </header>

  {#if loading}
    <div class="panel"><p class="muted">Loading...</p></div>
  {:else}
    <form onsubmit={(e) => { e.preventDefault(); save(); }}>
      {#if filter.trim() && !panelVisible('operator') && !panelVisible('smtp') && !panelVisible('airspace') && !panelVisible('tiles') && !panelVisible('camera') && !panelVisible('ai') && !panelVisible('mavlink')}
        <div class="panel"><p class="muted">No settings match "{filter}".</p></div>
      {/if}
      <div class="settings-grid">
      <div class="col-main">
      {#if panelVisible('smtp')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-envelope"></i></span>
          <div>
            <h2>Email (SMTP)</h2>
            <p class="muted">Regular SMTP to your own mail server. Powers password resets and alert emails.</p>
          </div>
        </div>
        <div class="grid">
          <div class="field">
            <label for="smtp-host">Host</label>
            <input id="smtp-host" bind:value={smtp.host} placeholder="mail.example.com" />
          </div>
          <div class="field narrow">
            <label for="smtp-port">Port</label>
            <input id="smtp-port" bind:value={smtp.port} placeholder="587" inputmode="numeric" />
          </div>
        </div>
        <div class="grid">
          <div class="field">
            <label for="smtp-user">Username</label>
            <input id="smtp-user" bind:value={smtp.user} autocomplete="off" placeholder="alerts@example.com" />
          </div>
          <div class="field">
            <label for="smtp-pass">Password</label>
            <input
              id="smtp-pass"
              type="password"
              bind:value={smtp.pass}
              autocomplete="new-password"
              placeholder={passSet ? '•••••••• (saved)' : 'SMTP password'}
            />
          </div>
        </div>
        <div class="grid">
          <div class="field">
            <label for="smtp-from">From address</label>
            <input id="smtp-from" bind:value={smtp.from} placeholder="canary@example.com" />
          </div>
          <div class="field toggle-field">
            <span class="toggle-label">TLS (port 465)</span>
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
            <h2>Map tiles</h2>
            <p class="muted">A MapTiler key gives a rich dark basemap and a labeled hybrid satellite. Leave blank for keyless tiles. Each mode accepts a custom XYZ tile URL to override the default.</p>
          </div>
        </div>
        <div class="field">
          <label for="maptiler">MapTiler API key<a class="key-link" href="https://cloud.maptiler.com/account/keys/" target="_blank" rel="noopener">Get key <i class="fa-solid fa-square-arrow-up-right"></i></a></label>
          <input id="maptiler" bind:value={maptiler} autocomplete="off" placeholder="MapTiler key (optional)" />
        </div>
        {#each ['light', 'dark', 'satellite'] as const as mode (mode)}
          <div class="field">
            <label for="tiles-{mode}">{mode[0].toUpperCase() + mode.slice(1)} basemap URL</label>
            <div class="tile-row">
              <div class="preset">
                <Select
                  bind:value={presetPick[mode]}
                  placeholder="Preset..."
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
            <h2>Camera source</h2>
            <p class="muted">The live feed serves one WebRTC stream; pick what feeds it. Applied to the running feed when you save.</p>
          </div>
        </div>
        {#if detectedStream}
          <div class="detected">
            <div>
              <span class="badge">detected</span>
              The vehicle advertises a camera stream{detectedStream.name ? ` (${detectedStream.name})` : ''}:
              <code class="uri">{detectedStream.uri}</code>
            </div>
            <button type="button" class="mini" onclick={useDetectedStream}>Use this URL</button>
          </div>
        {/if}
        <div class="field">
          <label for="camera-kind">Source type</label>
          <Select id="camera-kind" bind:value={camera.kind} options={CAMERA_KINDS} />
        </div>
        {#if camera.kind === 'url'}
          <div class="field">
            <label for="camera-url">Stream URL</label>
            <input id="camera-url" bind:value={camera.url} autocomplete="off" placeholder="rtsp://user:pass@192.168.1.50:554/stream" />
            <p class="hint">An IP camera, a companion computer, or a flight controller camera that advertises RTSP. MediaMTX transcodes it to WebRTC.</p>
          </div>
        {:else if camera.kind === 'usb'}
          <div class="field">
            <label for="camera-device">Capture device</label>
            <input id="camera-device" bind:value={camera.device} autocomplete="off" placeholder="/dev/video0" />
            <p class="hint">A USB analog capture dongle (analog FPV) or an HDMI grabber (HDZero, DJI, or Walksnail digital FPV, including a Betaflight board's FPV feed). MediaMTX captures it with FFmpeg.</p>
          </div>
        {:else}
          <p class="hint">The Raspberry Pi CSI camera on the companion computer. No extra hardware.</p>
        {/if}
        {#if cameraApplied !== null}
          <p class="hint">{cameraApplied ? 'Applied to the live feed.' : 'Saved. It applies once the camera bridge is reachable.'}</p>
        {/if}
      </section>
      {/if}

      {#if panelVisible('ai')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-robot"></i></span>
          <div>
            <h2>AI assistant</h2>
            <p class="muted">Powers the PID tuning assistant on the Vehicle Parameters page. Any OpenAI-compatible endpoint works (OpenAI, LiteLLM, Ollama).</p>
          </div>
        </div>
        <div class="field">
          <label for="ai-key">API key {#if aiKeySet}<span class="badge">saved</span>{/if}</label>
          <input id="ai-key" type="password" bind:value={ai.apiKey} autocomplete="off" placeholder={aiKeySet ? 'Leave blank to keep the saved key' : 'sk-...'} />
        </div>
        <div class="field">
          <label for="ai-base">Base URL</label>
          <input id="ai-base" bind:value={ai.baseUrl} autocomplete="off" placeholder="https://api.openai.com/v1" />
          <p class="hint">The OpenAI-compatible base URL. Point it at a LiteLLM proxy or a local Ollama server to use another model.</p>
        </div>
        <div class="field">
          <label for="ai-model">Model</label>
          <input id="ai-model" bind:value={ai.model} autocomplete="off" placeholder="gpt-4o-mini" />
        </div>
      </section>
      {/if}

      {#if panelVisible('mavlink')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-shield-halved"></i></span>
          <div>
            <h2>MAVLink signing</h2>
            <p class="muted">Authenticates the link with a shared passphrase so only a party that holds it can command the vehicle, and forged or replayed messages are rejected. Saving pushes the key to the connected vehicle, so one passphrase secures both ends.</p>
          </div>
        </div>
        <div class="field">
          <label for="mav-key">Signing passphrase {#if mavlinkKeySet}<span class="badge">active</span>{/if}<button type="button" class="key-link" onclick={generateSigningPassphrase}>Generate <i class="fa-solid fa-key"></i></button></label>
          <input id="mav-key" type={mavKeyVisible ? 'text' : 'password'} bind:value={mavlink.signingKey} autocomplete="off" placeholder={mavlinkKeySet ? 'Leave blank to keep the active key' : 'Shared secret passphrase'} />
          <p class="hint">Hashed to the 32-byte key with SHA-256, the same way QGroundControl and Mission Planner derive it.</p>
        </div>
        <div class="field">
          <label for="mav-link">Link ID</label>
          <input id="mav-link" type="number" min="0" max="255" bind:value={mavlink.signingLinkId} autocomplete="off" placeholder="1" />
          <p class="hint">Identifies this ground station's channel to the vehicle. Leave at 1 unless another link already uses it.</p>
        </div>
        <div class="field toggle-field">
          <span class="toggle-label">Reject unsigned messages (strict)</span>
          <label class="switch">
            <input type="checkbox" bind:checked={mavlink.signingStrict} />
            <span class="slider"></span>
          </label>
        </div>
        <p class="hint">On: any unsigned message is dropped. Off: unsigned messages still pass, which keeps the link up while the autopilot is being set up.</p>
        {#if mavlinkKeySet}
          <button type="button" class="mini" onclick={disableSigning} disabled={saving}>Turn off signing</button>
        {/if}
      </section>
      {/if}
      </div>

      <div class="col-side">
      {#if panelVisible('operator')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-user-gear"></i></span>
          <div>
            <h2>Operator</h2>
            <p class="muted">Used for password resets and as the alert recipient.</p>
          </div>
        </div>
        <div class="field">
          <label for="email">Operator email</label>
          <input type="email" id="email" bind:value={email} autocomplete="email" placeholder="operator@example.com" />
        </div>
      </section>
      {/if}

      {#if panelVisible('airspace')}
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-tower-broadcast"></i></span>
          <div>
            <h2>Airspace data</h2>
            <p class="muted">Optional keys for worldwide airspace. Leave blank to use the keyless FAA fallback.</p>
          </div>
        </div>
        <div class="field">
          <label for="openaip">OpenAIP API key {#if openaipSet}<span class="badge">configured</span>{/if}<a class="key-link" href="https://www.openaip.net/" target="_blank" rel="noopener">Get key <i class="fa-solid fa-square-arrow-up-right"></i></a></label>
          <input id="openaip" bind:value={openaip} autocomplete="off" placeholder={openaipSet ? '•••••••• (saved)' : 'OpenAIP key'} />
        </div>
        <div class="field">
          <label for="altitude-angel">Altitude Angel API key {#if altitudeAngelSet}<span class="badge">configured</span>{/if}<a class="key-link" href="https://developers.altitudeangel.com" target="_blank" rel="noopener">Get key <i class="fa-solid fa-square-arrow-up-right"></i></a></label>
          <input id="altitude-angel" bind:value={altitudeAngel} autocomplete="off" placeholder={altitudeAngelSet ? '•••••••• (saved)' : 'Altitude Angel key'} />
        </div>
      </section>
      {/if}
      <div class="actions">
        <button type="submit" class="cta" disabled={saving}>
          <i class="fas fa-floppy-disk"></i> {saving ? 'Saving...' : 'Save integrations'}
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
