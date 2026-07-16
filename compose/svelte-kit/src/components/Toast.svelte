<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { dismissToast } from '../stores/toastStore';
  import type { NotificationType } from '../lib/overlays';

  interface Props {
    id: number;
    title: string;
    content: string;
    type: NotificationType;
    duration: number;
    persistent: boolean;
    onDismiss?: () => void;
    link?: { href: string; label: string };
  }

  let { id, title, content, type, duration, persistent, link }: Props = $props();

  const ICONS: Record<NotificationType, string> = {
    info: 'fa-circle-info',
    success: 'fa-circle-check',
    warning: 'fa-triangle-exclamation',
    error: 'fa-circle-exclamation'
  };

  // Errors and warnings interrupt (assertive); info and success wait their
  // turn (polite). role="alert"/"status" are implicit live regions, so a
  // screen reader announces each toast as it mounts.
  const role = $derived(type === 'error' || type === 'warning' ? 'alert' : 'status');
  const timed = $derived(!persistent && duration > 0);

  // Escapes markup, then restores line breaks so toast text can never inject
  // live HTML (MAVLink STATUSTEXT is attacker-influenced input).
  function renderSafe(raw: string): string {
    const escaped = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return escaped.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  }

  const safeContent = $derived(renderSafe(content));

  let progress = $state(100);
  let paused = $state(false);

  onMount(() => {
    if (!timed) return;
    let elapsed = 0;
    let last = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (paused) return;
      elapsed += dt;
      progress = Math.max(0, 100 - (elapsed / duration) * 100);
      if (elapsed >= duration) {
        clearInterval(interval);
        dismissToast(id);
      }
    }, 50);
    return () => clearInterval(interval);
  });
</script>

<div
  class="toast toast-{type}"
  {role}
  in:fly={{ x: 48, duration: 220 }}
  out:fly={{ x: 48, duration: 200 }}
  onmouseenter={() => (paused = true)}
  onmouseleave={() => (paused = false)}
  onfocusin={() => (paused = true)}
  onfocusout={() => (paused = false)}
>
  <div class="toast-row">
    <i class="fas {ICONS[type]} toast-icon"></i>
    <div class="toast-text">
      <div class="toast-title">{title}</div>
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- safeContent is escaped above; only <br> survives -->
      <div class="toast-content">{@html safeContent}</div>
      {#if link}
        <a class="toast-link" href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
      {/if}
    </div>
    <button class="toast-close" onclick={() => dismissToast(id)} aria-label="Dismiss">&times;</button>
  </div>
  {#if timed}
    <div class="toast-track"><div class="toast-progress" style="width: {progress}%"></div></div>
  {/if}
</div>

<style>
  .toast {
    width: min(24rem, calc(100vw - 2rem));
    border-radius: 0.75rem;
    overflow: hidden;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
    border-left: 4px solid currentColor;
    background-color: var(--primaryColor);
    color: var(--accent);
  }
  .toast-info {
    --accent: #2a7acf;
    --tint: #c9d5f3;
  }
  .toast-success {
    --accent: #1e8d1e;
    --tint: #affcaf;
  }
  .toast-warning {
    --accent: #d48c3a;
    --tint: #f7d08a;
  }
  .toast-error {
    --accent: #d62929;
    --tint: #f7d4d4;
  }

  .toast-row {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.7rem 0.85rem;
  }
  .toast-icon {
    color: var(--accent);
    font-size: 1.1rem;
    margin-top: 0.1rem;
    flex-shrink: 0;
  }
  .toast-text {
    flex: 1;
    min-width: 0;
  }
  .toast-title {
    font-weight: 600;
    color: var(--fontColor);
    line-height: 1.25;
  }
  .toast-content {
    font-size: 0.85rem;
    color: rgb(from var(--fontColor) r g b / 0.8);
    margin-top: 0.15rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .toast-link {
    display: inline-block;
    margin-top: 0.3rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--primaryColor);
    text-decoration: underline;
  }
  .toast-close {
    flex-shrink: 0;
    color: rgb(from var(--fontColor) r g b / 0.5);
    font-size: 1.35rem;
    line-height: 1;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.15rem;
  }
  .toast-close:hover {
    color: var(--fontColor);
  }

  .toast-track {
    height: 3px;
    background-color: rgb(from var(--accent) r g b / 0.2);
  }
  .toast-progress {
    height: 100%;
    background-color: var(--accent);
  }
</style>
