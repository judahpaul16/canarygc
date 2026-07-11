<script lang="ts">
  import { onMount } from 'svelte';
  import { notify } from '../../lib/overlays';
  import { refreshAlertConfig } from '../../lib/alerts';
  import { ALERT_TYPES } from '../../lib/alert-types';
  let loading = $state(true);
  let saving = $state(false);
  let enabled = $state<Set<string>>(new Set());

  onMount(async () => {
    try {
      const res = await fetch('/api/alerts/settings');
      const data = await res.json();
      enabled = new Set<string>(data.enabled ?? []);
    } catch {
      notify({ title: 'Load failed', content: 'Could not load alert settings.', type: 'warning' });
    } finally {
      loading = false;
    }
  });

  function toggle(id: string) {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    enabled = next;
  }

  async function save() {
    saving = true;
    try {
      const res = await fetch('/api/alerts/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: [...enabled] })
      });
      if (res.ok) {
        await refreshAlertConfig();
        notify({ title: 'Alerts saved', content: 'Your alert settings have been updated.', duration: 3000 });
      } else {
        const data = await res.json();
        notify({ title: 'Save failed', content: data.message ?? 'Could not save alerts.', type: 'warning' });
      }
    } catch {
      notify({ title: 'Save failed', content: 'Network error while saving.', type: 'warning' });
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Canary Ground Control - Alerts</title>
</svelte:head>

<div
  class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0"
>
  <div class="dashboard w-full p-5 rounded-3xl rounded-l-none overflow-auto overflow-x-hidden h-[90vh] max-h-[90vh]">
    <div class="settings rounded-2xl h-full p-6 overflow-y-auto">
      <div class="content">
  <header class="head">
    <h1><i class="fas fa-bell"></i> Alerts</h1>
    <p>Email the operator when the vehicle reports an event. Each email carries the live coordinates and telemetry, and is sent to the operator email using the SMTP set under <a href="/integrations">Integrations</a>.</p>
  </header>

  {#if loading}
    <div class="panel"><p class="muted">Loading...</p></div>
  {:else}
    <form onsubmit={(e) => { e.preventDefault(); save(); }}>
      <section class="panel">
        <div class="panel-head">
          <span class="icon-chip"><i class="fas fa-list-check"></i></span>
          <div>
            <h2>Alert types</h2>
            <p class="muted">Turn on the events you want emailed.</p>
          </div>
        </div>
        <div class="grid">
          {#each ALERT_TYPES as alert (alert.id)}
            <button
              type="button"
              class="alert-row {enabled.has(alert.id) ? 'on' : ''}"
              onclick={() => toggle(alert.id)}
              aria-pressed={enabled.has(alert.id)}
            >
              <i class="fas {alert.icon}"></i>
              <span class="alert-text">
                <span class="alert-label">{alert.label}</span>
                <span class="alert-desc">{alert.description}</span>
              </span>
              <span class="switch"><span class="slider"></span></span>
            </button>
          {/each}
        </div>
      </section>

      <div class="actions">
        <button type="submit" class="cta" disabled={saving}>
          <i class="fas fa-floppy-disk"></i> {saving ? 'Saving...' : 'Save alerts'}
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

  .head a {
    color: #f5c518;
    text-decoration: none;
  }

  .head a:hover {
    text-decoration: underline;
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
    gap: 0.7rem;
  }

  .alert-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    text-align: left;
    background-color: rgb(from var(--tertiaryColor) r g b / 0.7);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.12);
    border-radius: var(--radius-control);
    padding: 0.7rem 0.85rem;
    color: var(--fontColor);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .alert-row:hover {
    border-color: rgb(from var(--fontColor) r g b / 0.28);
  }

  .alert-row.on {
    border-color: #f5c518;
    background-color: rgba(245, 197, 24, 0.1);
  }

  .alert-row > i {
    font-size: 1rem;
    width: 1.4rem;
    text-align: center;
    color: #f5c518;
    flex-shrink: 0;
  }

  .alert-text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .alert-label {
    font-size: 0.9rem;
    font-weight: 600;
  }

  .alert-desc {
    font-size: 0.72rem;
    opacity: 0.6;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 38px;
    height: 22px;
    flex-shrink: 0;
  }

  .slider {
    position: absolute;
    inset: 0;
    background: rgb(from var(--secondaryColor) r g b / 90%);
    border-radius: 9999px;
    transition: background 0.2s ease;
  }

  .slider::before {
    content: '';
    position: absolute;
    height: 16px;
    width: 16px;
    left: 3px;
    top: 3px;
    background: #ffffff;
    border-radius: 50%;
    transition: transform 0.2s ease;
  }

  .alert-row.on .slider {
    background: #f5c518;
  }

  .alert-row.on .slider::before {
    transform: translateX(16px);
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

    .actions {
      justify-content: stretch;
    }

    .cta {
      width: 100%;
      justify-content: center;
    }
  }
</style>
