<script lang="ts">
  import { onMount } from 'svelte';
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../../stores/customizationStore';
  import { notify } from '../../lib/overlays';

  let darkMode = $derived($darkModeStore);
  let primaryColor = $derived($primaryColorStore);
  let secondaryColor = $derived($secondaryColorStore);
  let tertiaryColor = $derived($tertiaryColorStore);
  let fontColor = $derived(darkMode ? '#ffffff' : '#000000');

  let loading = $state(true);
  let saving = $state(false);

  let email = $state('');
  let smtp = $state({ host: '', port: '587', secure: false, user: '', from: '', pass: '' });
  let passSet = $state(false);
  let openaip = $state('');
  let openaipSet = $state(false);
  let altitudeAngel = $state('');
  let altitudeAngelSet = $state(false);

  onMount(async () => {
    try {
      const res = await fetch('/api/integrations');
      const data = await res.json();
      email = data.email ?? '';
      smtp = { host: data.smtp.host, port: String(data.smtp.port), secure: data.smtp.secure, user: data.smtp.user, from: data.smtp.from, pass: '' };
      passSet = data.smtp.passSet;
      openaipSet = data.openaipSet;
      altitudeAngelSet = data.altitudeAngelSet;
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
        body: JSON.stringify({ email, smtp, openaip, altitudeAngel })
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
  class="settings"
  style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
>
  <header class="head">
    <h1><i class="fas fa-plug"></i> Integrations</h1>
    <p>Connect external services. Secrets are stored on this station and never shown again after saving.</p>
  </header>

  {#if loading}
    <div class="panel"><p class="muted">Loading...</p></div>
  {:else}
    <form onsubmit={(e) => { e.preventDefault(); save(); }}>
      <section class="panel">
        <h2><i class="fas fa-user-gear"></i> Operator</h2>
        <p class="muted">Used for password resets and as the default alert recipient.</p>
        <div class="field">
          <label for="email">Operator email</label>
          <input type="email" id="email" bind:value={email} autocomplete="email" />
        </div>
      </section>

      <section class="panel">
        <h2><i class="fas fa-envelope"></i> Email (SMTP)</h2>
        <p class="muted">Regular SMTP to your own mail server. Powers password resets and alert emails.</p>
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
        <h2><i class="fas fa-tower-broadcast"></i> Airspace data</h2>
        <p class="muted">Optional keys for worldwide airspace. Leave blank to use the keyless FAA fallback.</p>
        <div class="field">
          <label for="openaip">OpenAIP API key {#if openaipSet}<span class="badge">configured</span>{/if}</label>
          <input id="openaip" bind:value={openaip} autocomplete="off" placeholder={openaipSet ? '•••••••• (saved)' : 'OpenAIP key'} />
        </div>
        <div class="field">
          <label for="altitude-angel">Altitude Angel API key {#if altitudeAngelSet}<span class="badge">configured</span>{/if}</label>
          <input id="altitude-angel" bind:value={altitudeAngel} autocomplete="off" placeholder={altitudeAngelSet ? '•••••••• (saved)' : 'Altitude Angel key'} />
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

<style>
  .settings {
    color: var(--fontColor);
    max-width: 760px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    width: 100%;
    height: 100%;
    overflow-y: auto;
  }

  .head {
    margin-bottom: 1.25rem;
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
    background-color: rgb(from var(--primaryColor) r g b / 70%);
    border: 1px solid rgb(from var(--secondaryColor) r g b / 65%);
    border-radius: 1rem;
    padding: 1.25rem;
    margin-bottom: 1.1rem;
  }

  .panel h2 {
    font-size: 1.05rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .panel h2 i {
    color: #f5c518;
    width: 1.1rem;
    text-align: center;
  }

  .muted {
    opacity: 0.65;
    font-size: 0.82rem;
    margin: 0.3rem 0 1rem;
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

  input {
    background-color: rgb(from var(--tertiaryColor) r g b / 85%);
    border: 1px solid rgb(from var(--secondaryColor) r g b / 80%);
    color: var(--fontColor);
    border-radius: 0.6rem;
    padding: 0.55rem 0.75rem;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  input:focus {
    border-color: #f5c518;
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
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
  }

  .toggle-field {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    align-self: end;
    margin-bottom: 0.9rem;
    background-color: rgb(from var(--tertiaryColor) r g b / 55%);
    border: 1px solid rgb(from var(--secondaryColor) r g b / 60%);
    border-radius: 0.6rem;
    padding: 0.55rem 0.75rem;
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
    border-radius: 999px;
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
    border-radius: 0.75rem;
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
