<script lang="ts">
  import { onMount } from 'svelte';
  import { notify } from '../../lib/overlays';
  import { resolveTiles, TILE_PRESETS, MAPTILER_PRESETS, maptilerTileUrl } from '../../lib/tiles';
  let loading = $state(true);
  let saving = $state(false);

  let email = $state('');
  let smtp = $state({ host: '', port: '587', secure: false, user: '', from: '', pass: '' });
  let passSet = $state(false);
  let openaip = $state('');
  let openaipSet = $state(false);
  let altitudeAngel = $state('');
  let altitudeAngelSet = $state(false);
  let maptiler = $state('');
  let tiles = $state({ light: '', dark: '', satellite: '' });

  const TILE_PLACEHOLDER = {
    light: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
  };

  function pickPreset(event: Event, mode: 'light' | 'dark' | 'satellite') {
    const select = event.currentTarget as HTMLSelectElement;
    if (select.value) tiles[mode] = select.value;
    select.selectedIndex = 0;
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
        body: JSON.stringify({ email, smtp, openaip, altitudeAngel, maptiler, tiles: tileOverrides() })
      });
      if (res.ok) {
        if (smtp.pass) passSet = true;
        if (openaip) openaipSet = true;
        if (altitudeAngel) altitudeAngelSet = true;
        smtp.pass = '';
        openaip = '';
        altitudeAngel = '';
        notify({ title: 'Integrations saved', content: 'Your integration settings have been updated.', duration: 3000 });
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
    <h1><i class="fas fa-plug"></i> Integrations</h1>
    <p>Connect external services. Secrets are stored on this station and never shown again after saving.</p>
  </header>

  {#if loading}
    <div class="panel"><p class="muted">Loading...</p></div>
  {:else}
    <form onsubmit={(e) => { e.preventDefault(); save(); }}>
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
        <div class="field">
          <label for="tiles-light">Light basemap URL</label>
          <div class="tile-row">
            <select class="preset" aria-label="Light basemap preset" onchange={(e) => pickPreset(e, 'light')}>
              <option value="">Preset...</option>
              {#if maptiler.trim()}
                <optgroup label="MapTiler (your key)">
                  {#each MAPTILER_PRESETS.light as p (p.style)}<option value={maptilerTileUrl(p.style, maptiler.trim(), p.ext)}>{p.label}</option>{/each}
                </optgroup>
              {/if}
              <optgroup label="Keyless">
                {#each TILE_PRESETS.light as p (p.url)}<option value={p.url}>{p.label}</option>{/each}
              </optgroup>
            </select>
            <input id="tiles-light" bind:value={tiles.light} autocomplete="off" placeholder={TILE_PLACEHOLDER.light} />
          </div>
        </div>
        <div class="field">
          <label for="tiles-dark">Dark basemap URL</label>
          <div class="tile-row">
            <select class="preset" aria-label="Dark basemap preset" onchange={(e) => pickPreset(e, 'dark')}>
              <option value="">Preset...</option>
              {#if maptiler.trim()}
                <optgroup label="MapTiler (your key)">
                  {#each MAPTILER_PRESETS.dark as p (p.style)}<option value={maptilerTileUrl(p.style, maptiler.trim(), p.ext)}>{p.label}</option>{/each}
                </optgroup>
              {/if}
              <optgroup label="Keyless">
                {#each TILE_PRESETS.dark as p (p.url)}<option value={p.url}>{p.label}</option>{/each}
              </optgroup>
            </select>
            <input id="tiles-dark" bind:value={tiles.dark} autocomplete="off" placeholder={TILE_PLACEHOLDER.dark} />
          </div>
        </div>
        <div class="field">
          <label for="tiles-satellite">Satellite basemap URL</label>
          <div class="tile-row">
            <select class="preset" aria-label="Satellite basemap preset" onchange={(e) => pickPreset(e, 'satellite')}>
              <option value="">Preset...</option>
              {#if maptiler.trim()}
                <optgroup label="MapTiler (your key)">
                  {#each MAPTILER_PRESETS.satellite as p (p.style)}<option value={maptilerTileUrl(p.style, maptiler.trim(), p.ext)}>{p.label}</option>{/each}
                </optgroup>
              {/if}
              <optgroup label="Keyless">
                {#each TILE_PRESETS.satellite as p (p.url)}<option value={p.url}>{p.label}</option>{/each}
              </optgroup>
            </select>
            <input id="tiles-satellite" bind:value={tiles.satellite} autocomplete="off" placeholder={TILE_PLACEHOLDER.satellite} />
          </div>
        </div>
      </section>

      <div class="actions">
        <button type="submit" class="cta" disabled={saving}>
          <i class="fas fa-floppy-disk"></i> {saving ? 'Saving...' : 'Save integrations'}
        </button>
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
    max-width: 860px;
    margin: 0 auto;
  }

  .head {
    margin-bottom: 1.5rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid rgb(from var(--fontColor) r g b / 0.08);
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
    padding: 1.35rem 1.5rem;
    margin-bottom: 1.2rem;
  }

  .panel-head {
    display: flex;
    align-items: flex-start;
    gap: 0.9rem;
    padding-bottom: 1.1rem;
    margin-bottom: 1.2rem;
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
    margin-bottom: 0.9rem;
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
    opacity: 0.8;
    transition: opacity 0.2s;
  }
  .key-link:hover {
    opacity: 1;
    text-decoration: underline;
  }

  input,
  .preset {
    background-color: rgb(from var(--tertiaryColor) r g b / 0.7);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.12);
    color: var(--fontColor);
    border-radius: var(--radius-control);
    padding: 0.6rem 0.8rem;
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
    width: 10rem;
    cursor: pointer;
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
    justify-content: flex-end;
    padding-top: 1.1rem;
    border-top: 1px solid rgb(from var(--fontColor) r g b / 0.08);
  }

  .cta {
    display: inline-flex;
    align-items: center;
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

  @media (max-width: 720px) {
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
