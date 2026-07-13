<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import { onMount } from 'svelte';
  import { showModal } from '../lib/overlays';
  import Hud from './Hud.svelte';
  import { feedViewStore, setFeedView, reportFeedAvailability, type FeedView } from '../stores/feedViewStore';

  let { compact = false }: { compact?: boolean } = $props();
  let containerAspect = 16 / 9;
  let videoAspect = 16 / 9;
  let feedSrc = $state('');

  const view = $derived($feedViewStore);
  const showFeed = $derived(view === 'feed' || view === 'hybrid');
  const showHud = $derived(view === 'hud' || view === 'hybrid');

  const VIEWS: { id: FeedView; icon: string; label: string }[] = [
    { id: 'feed', icon: 'fa-video', label: 'Live feed' },
    { id: 'hud', icon: 'fa-plane-up', label: 'Flight instruments' },
    { id: 'hybrid', icon: 'fa-layer-group', label: 'Feed with instruments' }
  ];

  function toggleFullScreen(element: HTMLElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        showModal({
          title: 'Error',
          content: `Error attempting to enable full-screen mode: ${err.message} (${err.name})`,
          notification: true,
        });
      });
    } else {
      document.exitFullscreen();
    }
  }

  function handleFullScreen() {
    const liveFeedElement = document.querySelector('#live-feed-container > div');
    if (liveFeedElement instanceof HTMLElement) {
      toggleFullScreen(liveFeedElement);
    }
  }

  function adjustVideoSize() {
    const container = document.querySelector('#live-feed-container');
    const iframe = document.querySelector('#live-feed') as HTMLIFrameElement;

    if (!container || !iframe) return;

    containerAspect = container.clientWidth / container.clientHeight;

    if (containerAspect > videoAspect) {
      const scale = (containerAspect / videoAspect) * 100;
      iframe.style.width = `${scale}%`;
      iframe.style.height = `${scale}%`;
    } else {
      const scale = (videoAspect / containerAspect) * 100;
      iframe.style.width = `${scale}%`;
      iframe.style.height = `${scale}%`;
    }
  }

  function rotateVideo() {
    const iframe = document.querySelector('#live-feed') as HTMLIFrameElement;
    if (!iframe) return;

    if (String(iframe.style.transform).includes('rotate(180deg)')) {
      iframe.style.transform = 'translate(-50%, -50%) rotate(0deg)';
    } else {
      iframe.style.transform = 'translate(-50%, -50%) rotate(180deg)';
    }
  }

  onMount(() => {
    feedSrc = `http://${window.location.hostname}:8889/cam`;

    // The MediaMTX feed is optional; while it is down the iframe stays behind
    // the placeholder and the view falls back to the HUD.
    const fetchLiveFeed = async () => {
      let available = false;
      try {
        const response = await fetch(feedSrc);
        available = response.ok;
      } catch {
        available = false;
      }
      reportFeedAvailability(available);
      const liveFeed = document.getElementById('live-feed');
      if (liveFeed) liveFeed.style.zIndex = available ? '20' : '0';
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

<div id="live-feed-container" class="text-[#ffffff] rounded-2xl h-full relative overflow-hidden">
  <!-- The video, no-signal fallback, and HUD are clipped to the rounded frame
       so nothing bleeds past the corners; the controls sit outside this clip so
       their tooltips are not cut off. -->
  <div class="media">
    {#if showFeed}
      {#if view === 'feed'}
        <img id="no-signal" src="no-signal.gif" alt="No Signal" class="absolute top-0 w-full h-full object-cover z-10" />
      {/if}
      <iframe allowfullscreen id="live-feed" title="Live Feed" src={feedSrc}></iframe>
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
      <div class="caution-text opacity-[50%] text-md absolute bottom-2 left-2 bg-[#252525cf] px-2 py-1 mr-[0.5em] rounded-full z-20">Use Caution: The feed may be slightly delayed.</div>
    {/if}
    <button class="chrome absolute top-2 right-14 p-2 px-[14px] rounded-full z-30 opacity-[60%]" aria-label="Rotate video" data-tip="Rotate video 180°" data-tip-pos="below" onclick={rotateVideo}>
      <i class="fas fa-sync-alt"></i>
    </button>
    <button class="chrome absolute top-2 right-2 p-2 px-[14px] rounded-full z-30 opacity-[60%]" aria-label="Toggle fullscreen" data-tip="Toggle fullscreen" data-tip-pos="below" onclick={handleFullScreen}>
      <i class="fas fa-expand"></i>
    </button>
  {/if}
</div>

<style>
  #live-feed-container {
    background-color: var(--primaryColor);
    border: 10px solid var(--primaryColor);
  }

  #live-feed-container:hover .caution-text,
  #live-feed-container:hover .chrome {
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

  /* The data-tip base rule sets position: relative at equal specificity with
     Tailwind's absolute utility, so the overlay placement is pinned here. */
  .chrome {
    position: absolute;
    color: var(--fontColor);
    background-color: rgb(from var(--primaryColor) r g b / 75%);
  }

  .chrome:hover {
    opacity: 0.75 !important;
  }

  @media (max-width: 990px) {
    #live-feed-container {
      height: 300px;
    }
  }
</style>
