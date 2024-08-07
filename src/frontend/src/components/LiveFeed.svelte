<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css';
  import Modal from './Modal.svelte';

  function toggleFullScreen(element: HTMLElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        const modal = new Modal({
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
    const liveFeedElement = document.querySelector('#live-feed-container');
    if (liveFeedElement instanceof HTMLElement) {
      toggleFullScreen(liveFeedElement);
    }
  }
</script>

<div id="live-feed-container" class="bg-[#1c1c1e] text-white rounded-lg h-full relative">
  <div id="live-feed" class="relative h-full bg-gray-700 rounded-lg">
    <img src="https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3BvOGdwNXByYjVoMzRzMWU0d2Q1cXkxMDdxMjlmMXZzZDQ1MjNuMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/svIaVieSrBFvQdxY2e/giphy.gif" alt="Live Feed" class="w-full h-full object-cover rounded-lg" />
    <div class="absolute top-0 left-0 bg-[#f24e4ecf] text-white px-2 py-1 rounded-br-lg rounded-lg rounded-bl-none rounded-tr-none">Live Feed</div>
    <!-- warning the feed may be delayed -->
    <div class="absolute bottom-0 left-0 bg-[#252525cf] text-white px-2 py-1 rounded-tr-lg rounded-lg rounded-bl-none rounded-br-none rounded-tl-none">Use Caution: The feed may be slightly delayed.</div>
    <button class="absolute top-2 right-2 text-white bg-gray-800 bg-opacity-75 p-2 px-3 hover:bg-[#000000e6] rounded-full" on:click={handleFullScreen}>
      <i class="fas fa-expand"></i>
    </button>
  </div>
</div>
