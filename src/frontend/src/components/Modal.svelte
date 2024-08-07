<script lang="ts">
  export let title: string;
  export let content: string;
  export let isOpen: boolean = false;
  export let confirmation: boolean = false;
  export let notification: boolean = false;
  export let onConfirm: () => void = () => {};
  export let onCancel: () => void = () => {};

  const closeModal = () => {
    isOpen = false;
    if (!confirmation && !notification) {
      onCancel();
    }
  };

  const handleConfirm = () => {
    onConfirm();
    closeModal();
  };
</script>

{#if isOpen}
  <div class="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
    <div class="bg-[#1e1e1e] rounded-lg shadow-lg max-w-sm w-full">
      <div class="relative border-b border-[#2d2d2d]">
        <div class="px-4 py-2 text-lg font-semibold text-white">
          {title}
        </div>
        <button on:click={closeModal} class="absolute top-2 right-2 text-gray-400 hover:text-white text-2xl">
          &times;
        </button>
      </div>
      <div class="px-4 py-2 text-white">
        {content}
      </div>
      {#if confirmation}
        <div class="flex justify-end px-4 py-2 border-t border-[#2d2d2d]">
          <button on:click={handleConfirm} class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 mr-2">Confirm</button>
          <button on:click={closeModal} class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400">Cancel</button>
        </div>
      {/if}
      {#if notification}
        <div class="flex justify-end px-4 py-2 border-t border-[#2d2d2d]">
          <button on:click={closeModal} class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400">Okay</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  button {
    font-size: 1rem;
    line-height: 1.5;
    border: none;
    background: none;
    cursor: pointer;
    transition: background-color 0.3s, color 0.3s;
  }
</style>
