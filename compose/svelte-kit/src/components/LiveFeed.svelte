<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import { onMount } from 'svelte';
  import { notify, showModal } from '../lib/overlays';
  import Hud from './Hud.svelte';
  import { feedViewStore, setFeedView, reportFeedAvailability, type FeedView } from '../stores/feedViewStore';
  import { m } from '$lib/paraglide/messages';

  let { compact = false }: { compact?: boolean } = $props();
  let containerEl = $state<HTMLElement | null>(null);
  let iframeEl = $state<HTMLIFrameElement | null>(null);
  let containerAspect = 16 / 9;
  let videoAspect = 16 / 9;
  let feedSrc = $state('');
  let camKind = $state('');
  let piCamId = $state(0);
  let switching = $state(false);

  async function switchCamera() {
    if (switching) return;
    switching = true;
    const target = piCamId === 0 ? 1 : 0;
    try {
      const res = await fetch('/api/camera', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ piCamId: target })
      });
      const data = await res.json();
      if (res.ok && data.applied) {
        piCamId = data.piCamId;
        if (data.ready === false) {
          notify({ title: m.lf_cam_title(), content: m.lf_cam_no_signal({ id: String(piCamId) }), type: 'warning', duration: 5000 });
        } else {
          notify({ title: m.lf_cam_title(), content: m.lf_cam_switched({ id: String(piCamId) }), duration: 3000 });
        }
      } else {
        notify({ title: m.lf_cam_title(), content: m.lf_cam_failed(), type: 'warning', duration: 5000 });
      }
    } catch {
      notify({ title: m.lf_cam_title(), content: m.lf_cam_failed(), type: 'warning', duration: 5000 });
    } finally {
      switching = false;
    }
  }

  const view = $derived($feedViewStore);
  const showFeed = $derived(view === 'feed' || view === 'hybrid');
  const showHud = $derived(view === 'hud' || view === 'hybrid');

  const VIEWS: { id: FeedView; icon: string; label: string }[] = [
    { id: 'feed', icon: 'fa-video', label: m.lf_view_feed() },
    { id: 'hud', icon: 'fa-plane-up', label: m.lf_view_hud() },
    { id: 'hybrid', icon: 'fa-layer-group', label: m.lf_view_hybrid() }
  ];

  function toggleFullScreen(element: HTMLElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        showModal({
          title: m.common_error(),
          content: m.lf_fullscreen_error({ message: err.message, name: err.name }),
          notification: true,
        });
      });
    } else {
      document.exitFullscreen();
    }
  }

  function handleFullScreen() {
    if (containerEl) toggleFullScreen(containerEl);
  }

  function adjustVideoSize() {
    if (!containerEl || !iframeEl) return;

    containerAspect = containerEl.clientWidth / containerEl.clientHeight;

    if (containerAspect > videoAspect) {
      const scale = (containerAspect / videoAspect) * 100;
      iframeEl.style.width = `${scale}%`;
      iframeEl.style.height = `${scale}%`;
    } else {
      const scale = (videoAspect / containerAspect) * 100;
      iframeEl.style.width = `${scale}%`;
      iframeEl.style.height = `${scale}%`;
    }
  }

  function rotateVideo() {
    if (!iframeEl) return;

    if (String(iframeEl.style.transform).includes('rotate(180deg)')) {
      iframeEl.style.transform = 'translate(-50%, -50%) rotate(0deg)';
    } else {
      iframeEl.style.transform = 'translate(-50%, -50%) rotate(180deg)';
    }
  }

  onMount(() => {
    feedSrc = `http://${window.location.hostname}:8889/cam`;

    fetch('/api/camera')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          camKind = data.kind ?? '';
          piCamId = Number(data.piCamId) === 1 ? 1 : 0;
        }
      })
      .catch(() => undefined);

    // The MediaMTX feed is optional; while it is down the iframe stays behind
    // the placeholder and the view falls back to the HUD.
    const fetchLiveFeed = async () => {
      let available: boolean;
      try {
        const response = await fetch(feedSrc);
        available = response.ok;
      } catch {
        available = false;
      }
      reportFeedAvailability(available);
      if (iframeEl) iframeEl.style.zIndex = available ? '20' : '0';
      adjustVideoSize();
    };
    fetchLiveFeed();

    const feedTimer = setInterval(() => fetchLiveFeed(), 5000);

    window.addEventListener('resize', adjustVideoSize);

    return () => {
      clearInterval(feedTimer);
      window.removeEventListener('resize', adjustVideoSize);
    };
  });
</script>

<div id="live-feed-container" bind:this={containerEl} class="text-[#ffffff] rounded-2xl h-full relative overflow-hidden">
  <!-- The video, no-signal fallback, and HUD are clipped to the rounded frame
       so nothing bleeds past the corners; the controls sit outside this clip so
       their tooltips are not cut off. -->
  <div class="media">
    {#if showFeed}
      <!-- The static sits under the video (which covers it while the feed is up),
           so hybrid shows the static behind the instruments when the feed is down
           instead of the broken iframe. -->
      <img id="no-signal" src="no-signal.gif" alt={m.lf_no_signal()} class="absolute top-0 w-full h-full object-cover z-10" />
      <iframe allowfullscreen id="live-feed" bind:this={iframeEl} title={m.lf_live_feed_title()} src={feedSrc}></iframe>
    {/if}
    {#if showHud}
      <div class="hud-layer" class:overlay={view === 'hybrid'}>
        <Hud {compact} transparent={view === 'hybrid'} />
      </div>
    {/if}
  </div>

  <div class="view-toggle absolute top-2 left-2 z-30" class:small={compact}>
    {#each VIEWS as v (v.id)}
      <button
        class="seg"
        class:active={view === v.id}
        aria-label={v.label}
        aria-pressed={view === v.id}
        data-tip={v.label}
        data-tip-pos="below-right"
        onclick={() => setFeedView(v.id)}
      >
        <i class="fas {v.icon}"></i>
      </button>
    {/each}
  </div>

  {#if !compact}
    {#if view === 'feed'}
      <div class="caution-text opacity-50 text-md absolute bottom-2 left-2 bg-[#252525cf] px-2 py-1 mr-[0.5em] rounded-full z-20">{m.lf_caution()}</div>
    {/if}
    <div class="view-toggle absolute top-2 right-2 z-30">
      {#if showFeed && camKind === 'pi'}
        <button
          class="seg"
          aria-label={m.lf_switch_cam({ id: String(piCamId === 0 ? 1 : 0) })}
          data-tip={m.lf_switch_cam({ id: String(piCamId === 0 ? 1 : 0) })}
          data-tip-pos="below"
          disabled={switching}
          onclick={switchCamera}
        >
          <i class="fas {switching ? 'fa-spinner fa-spin' : 'fa-camera-rotate'}"></i>
        </button>
      {/if}
      {#if showFeed}
        <button class="seg" aria-label={m.lf_rotate_aria()} data-tip={m.lf_rotate_tip()} data-tip-pos="below" onclick={rotateVideo}>
          <i class="fas fa-sync-alt"></i>
        </button>
      {/if}
      <button class="seg" aria-label={m.lf_fullscreen()} data-tip={m.lf_fullscreen()} data-tip-pos="below" onclick={handleFullScreen}>
        <i class="fas fa-expand"></i>
      </button>
    </div>
  {/if}
</div>

<style>
  #live-feed-container {
    background-color: var(--primaryColor);
    border: 10px solid var(--primaryColor);
  }

  #live-feed-container:fullscreen {
    border: none;
    border-radius: 0;
    height: 100%;
  }

  #live-feed-container:hover .caution-text {
    opacity: 1;
  }

  #no-signal {
    background-color: var(--primaryColor);
  }

  .media {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: 0.6rem;
  }

  .hud-layer {
    position: absolute;
    inset: 0;
    z-index: 15;
  }
  .hud-layer.overlay {
    z-index: 25;
    pointer-events: none;
  }

  .view-toggle {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border-radius: 9999px;
    background-color: rgb(from var(--primaryColor) r g b / 80%);
    border: 2px solid rgb(from var(--secondaryColor) r g b / 60%);
  }
  .seg {
    color: var(--fontColor);
    width: 1.9rem;
    height: 1.6rem;
    border-radius: 9999px;
    font-size: 0.8rem;
    opacity: 0.6;
    transition: background-color 0.15s, opacity 0.15s;
  }
  .seg:hover {
    opacity: 0.9;
  }
  .seg.active {
    background-color: #3290e7;
    color: #fff;
    opacity: 1;
  }
  .view-toggle.small .seg {
    width: 1.5rem;
    height: 1.3rem;
    font-size: 0.7rem;
  }

  .caution-text {
    color: var(--fontColor);
    background-color: rgb(from var(--primaryColor) r g b / 75%);
    border: 2px solid rgb(from var(--secondaryColor) r g b / 75%);
  }

  .seg:disabled {
    opacity: 0.4;
    cursor: default;
  }

  #live-feed {
    width: 300%;
    height: 300%;
    pointer-events: none;
    background-color: #000;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    object-fit: cover;
    border-radius: var(--radius-control);
    z-index: 0;
  }

  @media (max-width: 990px) {
    #live-feed-container {
      height: 300px;
    }
  }
</style>
