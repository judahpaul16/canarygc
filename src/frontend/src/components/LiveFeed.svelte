<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import Modal from './Modal.svelte';
  import { onMount } from 'svelte';
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../stores/customizationStore';
  import Hls from 'hls.js';

  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = $secondaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: fontColor = darkMode ? '#ffffff' : '#000000';

  function toggleFullScreen(element: HTMLElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        new Modal({
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

  async function initConnection() {
    let video = document.getElementById('live-feed') as HTMLVideoElement;
    let videoSrc = `http://${window.location.hostname}:8554/stream.m3u8`;
    if (Hls.isSupported()) {
      var hls = new Hls();
      hls.loadSource(videoSrc);
      hls.attachMedia(video);
      video.onloadeddata = () => {
        video.style.zIndex = '10';
      };
    }
    // HLS.js is not supported on platforms that do not have Media Source
    // Extensions (MSE) enabled.
    //
    // When the browser has built-in HLS support (check using `canPlayType`),
    // we can provide an HLS manifest (i.e. .m3u8 URL) directly to the video
    // element through the `src` property. This is using the built-in support
    // of the plain video element, without using HLS.js.
    else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoSrc;
      video.onloadeddata = () => {
        video.style.zIndex = '10';
      };
    }
    video.play();
  }

  onMount(() => {
    initConnection();
  });
</script>

<div id="live-feed-container" class="text-[#ffffff] rounded-2xl h-full relative"
  style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --fontColor: {fontColor};"
>
  <div class="container w-full h-full relative">
    <img id="no-signal" src={darkMode ? 'no-signal.gif': 'no-signal-light.gif'} alt="No Signal" class="absolute top-0 w-full h-full object-cover rounded-lg z-10" />
    <video id="live-feed" controls autoplay loop muted class="bg-black absolute top-0 w-full h-full object-cover rounded-lg z-0"></video>
    <div class="tab absolute top-2 left-2 bg-[#f24e4eb9] text-[#ffffff] text-md px-2 py-1 rounded-full z-20">Live Feed</div>
    <div class="caution-text opacity-0 text-md absolute top-2 right-2 bg-[#252525cf] px-2 py-1 rounded-full z-20">Use Caution: The feed may be slightly delayed.</div>
  </div>
</div>

<style>
  #live-feed-container {
    background-color: var(--primaryColor);
    border: 10px solid var(--primaryColor);
  }

  #live-feed-container:hover .caution-text {
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
</style>