<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import { onMount, mount } from 'svelte';
  import Modal from './Modal.svelte';
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../stores/customizationStore';

  let darkMode = $derived($darkModeStore);
  let primaryColor = $derived($primaryColorStore);
  let secondaryColor = $derived($secondaryColorStore);
  let tertiaryColor = $derived($tertiaryColorStore);
  let fontColor = $derived(darkMode ? '#ffffff' : '#000000');

  let isProduction = $state(false);
  let containerAspect = 16 / 9;
  let videoAspect = 16 / 9;

  function toggleFullScreen(element: HTMLElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        mount(Modal, {
                    target: document.body,
                    props: {
                      title: 'Error',
                      content: `Error attempting to enable full-screen mode: ${err.message} (${err.name})`,
                      isOpen: true,
                      confirmation: false,
                      notification: true,
                    },
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

  onMount(() => {
    const fetchLiveFeed = async () => {
      let response = await fetch(`http://${window.location.hostname}:8889/cam`);
      if (response.status === 200) {
        const liveFeed = document.getElementById('live-feed') as HTMLIFrameElement;
        liveFeed.style.zIndex = '20';
      }
      
      adjustVideoSize();
    };

    fetchLiveFeed();

    window.addEventListener('resize', adjustVideoSize);

    let response = fetch('/api/mavlink/heartbeat');
    response.then((res) => {
      if (res.status === 200) {
        isProduction = res.headers.get('isProduction') === 'true';
      }
    });
    let noSignal = document.getElementById('no-signal') as HTMLImageElement;
    if (!isProduction) noSignal.src = 'simulation.gif';
  });
</script>

<div id="live-feed-container" class="text-[#ffffff] rounded-2xl h-full relative overflow-hidden"
  style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --fontColor: {fontColor};"
>
  <div class="container w-full h-full relative">
    <img id="no-signal" src={darkMode && !isProduction ? 'no-signal.gif': 'no-signal-light.gif'} alt="No Signal" class="absolute top-0 w-full h-full object-cover rounded-lg z-10" />
    <iframe allowfullscreen id="live-feed" title="Live Feed" src={ typeof window !== 'undefined' ? `http://${window.location.hostname}:8889/cam`  : ''} class="bg-black absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 object-cover rounded-lg z-0"></iframe>
    <div class="tab absolute top-2 left-2 bg-[#f24e4eb9] text-[#ffffff] text-md px-2 py-1 rounded-full z-20">Live Feed</div>
    <div class="caution-text opacity-[50%] text-md absolute bottom-2 left-2 bg-[#252525cf] px-2 py-1 mr-[0.5em] rounded-full z-20">Use Caution: The feed may be slightly delayed.</div>
    <button class="absolute top-2 right-2 p-2 px-[14px] rounded-full z-20 opacity-[60%]" onclick={handleFullScreen}>
      <i class="fas fa-expand"></i>
    </button>
  </div>
</div>

<style>
  #live-feed-container {
    background-color: var(--primaryColor);
    border: 10px solid var(--primaryColor);
  }

  #live-feed-container:hover .caution-text,
  #live-feed-container:hover button {
    opacity: 1;
  }

  #no-signal {
    background-color: var(--primaryColor);
  }

  .tab {
    border: 2px solid #3d393980;
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
  }

  button {
    color: var(--fontColor);
    background-color: rgb(from var(--primaryColor) r g b / 75%);
  }

  button:hover {
    opacity: 0.75 !important;
  }

  @media (max-width: 990px) {
    #live-feed-container {
      height: 300px;
    }
  }
</style>