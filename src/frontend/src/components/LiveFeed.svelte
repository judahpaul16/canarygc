<script lang="ts">
  import '@fortawesome/fontawesome-free/css/all.min.css';

  function toggleFullScreen(element: HTMLElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  function handleFullScreen() {
    const liveFeedElement = document.querySelector('.live-feed');
    if (liveFeedElement instanceof HTMLElement) {
      toggleFullScreen(liveFeedElement);
    }
  }
</script>

<div class="live-feed bg-[#1c1c1e] text-white rounded-lg h-full relative">
  <div class="relative h-full bg-gray-700 rounded-lg">
    <img src="https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3BvOGdwNXByYjVoMzRzMWU0d2Q1cXkxMDdxMjlmMXZzZDQ1MjNuMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/svIaVieSrBFvQdxY2e/giphy.gif" alt="Live Feed" class="w-full h-full object-cover rounded-lg" />
    <div class="absolute top-0 left-0 bg-[#f24e4ecf] text-white px-2 py-1 rounded-br-lg rounded-lg rounded-bl-none rounded-tr-none">Live Feed</div>
    <button class="absolute top-2 right-2 text-white bg-gray-800 bg-opacity-75 p-2 px-3 hover:bg-blue-400 rounded-full" on:click={handleFullScreen}>
      <i class="fas fa-expand"></i>
    </button>
  </div>
</div>
