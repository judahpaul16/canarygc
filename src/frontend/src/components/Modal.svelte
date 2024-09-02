<svelte:options accessors={true} />
<script lang="ts">
  export let title: string;
  export let content: string;
  export let isOpen: boolean = false;
  export let confirmation: boolean = false;
  export let notification: boolean = false;
  export let inputs: { type: string, placeholder: string }[] | null = null;
  export let inputValues: string[] = [];
  export let onConfirm: () => void = () => {};
  export let onCancel: () => void = () => {};
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../stores/customizationStore';

  $: inputValues = inputs ? inputs.map(() => {return ''}) : [];

  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = darkMode ? $tertiaryColorStore : $secondaryColorStore;
  $: tertiaryColor = $tertiaryColorStore;
  $: fontColor = darkMode ? "#ffffff" : "#000000";

  const closeModal = () => {
    isOpen = false;
    if (!confirmation && !notification) {
      onCancel();
    }
  };

  const handleConfirm = (event: Event) => {
    event.preventDefault();

    let ids: string[] = [];
    if (inputs) inputs.forEach((input) => {
      ids.push(`input-${input.type}-${inputs.indexOf(input)}`);
    });
    
    if (inputs && inputValues.length < inputs.length && inputs.some(input => input.type !== 'checkbox')) {
      alert('Please enter a valid value for all inputs.');
      return;
    } else if (inputs) {
      for (let i = 0; i < inputs.length; i++) {
        if (inputs[i].type === 'checkbox') {
          inputValues[i] = `${(document.querySelector(`#${ids[i]}`) as HTMLInputElement).checked}`;
        } else if (document.querySelector(`#${ids[i]}`)) {
          inputValues[i] = (document.querySelector(`#${ids[i]}`) as HTMLInputElement).value;
        }
      }
    }
    
    onConfirm();
    closeModal();
  };
</script>

{#if isOpen}
  <div class="fixed inset-0 flex items-center justify-center z-50 bg-[#00000080]"
    style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
  >
    <div class="container rounded-lg shadow-lg max-w-sm w-full">
      <div class="relative border-b">
        <div class="px-4 py-2 text-lg font-semibold">
          {title}
        </div>
        <button on:click={closeModal} class="absolute top-2 right-2 text-gray-400 hover:text-white text-2xl">
          &times;
        </button>
      </div>
      <form>
        <div class="px-4 py-2">
          {content}
          {#if inputs}
            <div class="text-center gap-2 items-center justify-center w-full">
              {#each inputs as input}
                {#if input.type === 'number'}
                  <input type="number" step="0.0001"
                    placeholder={input.placeholder}
                    value={inputValues[inputs.indexOf(input)]}
                    id={`input-${input.type}-${inputs.indexOf(input)}`}
                    class="form-input"
                  required />
                {:else if input.type === 'text'}
                  <input type="text"
                    placeholder={input.placeholder}
                    value={inputValues[inputs.indexOf(input)]}
                    id={`input-${input.type}-${inputs.indexOf(input)}`}
                    class="form-input"
                  required />
                {:else if input.type === 'checkbox'}
                  <div class="flex justify-center items-center">
                    <input type="checkbox"
                      id={`input-${input.type}-${inputs.indexOf(input)}`}
                      class="form-input"
                    />
                    <label for={input.placeholder} class="ml-2">{input.placeholder}</label>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
        {#if confirmation}
          <div class="flex justify-end px-4 py-2 border-t">
            <button type="submit" on:click={handleConfirm} class="bg-blue-500 px-4 py-2 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 mr-2">Confirm</button>
            <button on:click|preventDefault={closeModal} class="bg-gray-500 px-4 py-2 rounded hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400">Cancel</button>
          </div>
        {/if}
        {#if notification}
          <div class="flex justify-end px-4 py-2 border-t">
            <button on:click|preventDefault={closeModal} class="bg-blue-500 px-4 py-2 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400">Okay</button>
          </div>
        {/if}
      </form>
    </div>
  </div>
{/if}

<style>
  .container {
    color: var(--fontColor);
    background-color: var(--primaryColor);
  }

  button {
    font-size: 1rem;
    line-height: 1.5;
    border: none;
    background: none;
    cursor: pointer;
    transition: background-color 0.3s, color 0.3s;
  }

  button:hover {
    color: var(--primaryColor);
  }

  .form-input {
    appearance: none;
    width: fit-content;
    max-width: 150px;
    margin: 0.5em;
    padding: 0.5rem;
    border: 2px solid var(--secondaryColor);
    border-radius: 1em;
    background-color: var(--tertiaryColor);
    color: var(--fontColor);
    font-size: 10pt;
    transition: border-color 0.3s;
    transition: background-color 0.3s ease;
  }

  .form-input:focus {
    outline: none;
    border-color: #66e1ff;
  }

  input[type="checkbox"] {
      appearance: none;
      width: 1rem;
      height: 1rem;
      border-radius: 0.25rem;
      background-color: var(--secondaryColor);
      cursor: pointer;
  }

  input[type="checkbox"]:checked {
      background-color: #66e1ff;
  }

  .border-b, .border-t {
    border-color: var(--secondaryColor);
  }
</style>
