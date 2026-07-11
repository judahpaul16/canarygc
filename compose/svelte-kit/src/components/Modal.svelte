<script lang="ts">
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../stores/customizationStore';
  import { untrack } from 'svelte';

  interface Props {
    title: string;
    content: string;
    html?: boolean;
    isOpen?: boolean;
    confirmation?: boolean;
    notification?: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
    inputs?: { type: string; placeholder: string; required: boolean }[] | null;
    onConfirm?: (values: string[]) => void | Promise<void>;
    onCancel?: (values: string[]) => void;
    onClose?: () => void;
  }

  let {
    title,
    content,
    html = false,
    isOpen = $bindable(false),
    confirmation = false,
    notification = false,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    inputs = null,
    onConfirm = () => {},
    onCancel = () => {},
    onClose = () => {}
  }: Props = $props();

  let inputValues: string[] = $state(untrack(() => (inputs ? inputs.map(() => '') : [])));
  let checkboxValues: boolean[] = $state(untrack(() => (inputs ? inputs.map(() => false) : [])));
  let validationError = $state('');

  let darkMode = $derived($darkModeStore);
  let primaryColor = $derived($primaryColorStore);
  let secondaryColor = $derived(darkMode ? $tertiaryColorStore : $secondaryColorStore);
  let tertiaryColor = $derived($tertiaryColorStore);
  let fontColor = $derived(darkMode ? '#ffffff' : '#000000');

  const closeModal = () => {
    isOpen = false;
    if (!confirmation && !notification) {
      onCancel([...inputValues]);
    }
    onClose();
  };

  const cancel = () => {
    onCancel([...inputValues]);
    isOpen = false;
    onClose();
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && isOpen) closeModal();
  };

  const handleConfirm = async (event: Event) => {
    event.preventDefault();

    if (inputs) {
      const missing = inputs.some(
        (input, i) => input.required && input.type !== 'checkbox' && !inputValues[i]
      );
      if (missing) {
        validationError = 'Please enter a valid value for all inputs.';
        return;
      }
      inputs.forEach((input, i) => {
        if (input.type === 'checkbox') inputValues[i] = `${checkboxValues[i]}`;
      });
    }

    await onConfirm([...inputValues]);
    isOpen = false;
    onClose();
  };
</script>

<svelte:window onkeydown={handleKeydown} />
{#if isOpen}
  <div class="fixed inset-0 flex items-center justify-center z-50 bg-[#00000090] p-4 backdrop-blur-sm"
    style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
  >
    <button type="button" aria-label="Close dialog" class="absolute inset-0 h-full w-full cursor-default" onclick={closeModal}></button>
    <div class="container relative z-10 rounded-2xl shadow-2xl w-full {html ? 'max-w-md' : 'max-w-sm'}" role="dialog" aria-modal="true">
      <div class="relative border-b" style="border-color: rgb(from var(--fontColor) r g b / 0.12);">
        <div class="px-5 py-3 text-lg font-semibold">
          {title}
        </div>
        <button onclick={closeModal} aria-label="Close" class="absolute top-2.5 right-3 opacity-60 hover:opacity-100 text-2xl leading-none">
          &times;
        </button>
      </div>
      <form>
        <div class="modal-body px-5 py-4 whitespace-pre-line max-h-[70vh] overflow-y-auto">
          {#if html}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- html is an opt-in flag; callers pass app-built markup with FAA values escaped -->
            {@html content}
          {:else}{content}{/if}
          {#if inputs}
            <div class="text-center gap-2 items-center justify-center w-full">
              {#each inputs as input, i (i)}
                {#if input.type === 'number'}
                  <input type="number" step="0.0001"
                    placeholder={input.placeholder}
                    bind:value={inputValues[i]}
                    class="form-input"
                  required />
                {:else if input.type === 'text'}
                  <input type="text"
                    placeholder={input.placeholder}
                    bind:value={inputValues[i]}
                    class="form-input"
                  required />
                {:else if input.type === 'checkbox'}
                  <div class="flex justify-center items-center">
                    <input type="checkbox"
                      id={`modal-checkbox-${i}`}
                      bind:checked={checkboxValues[i]}
                      class="form-input"
                    />
                    <label for={`modal-checkbox-${i}`} class="ml-2">{input.placeholder}</label>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
          {#if validationError}
            <div class="text-red-400 text-sm mt-2">{validationError}</div>
          {/if}
        </div>
        {#if confirmation}
          <div class="flex justify-end px-4 py-2 border-t">
            <button type="submit" onclick={handleConfirm} class="bg-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 mr-2">{confirmLabel}</button>
            <button type="button" onclick={cancel} class="bg-gray-500 px-4 py-2 rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400">{cancelLabel}</button>
          </div>
        {/if}
        {#if notification}
          <div class="flex justify-end px-4 py-2 border-t">
            <button type="button" onclick={closeModal} class="bg-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400">Okay</button>
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

  .form-input {
    appearance: none;
    width: fit-content;
    max-width: 150px;
    margin: 0.5em;
    padding: 0.5rem;
    border: 2px solid var(--secondaryColor);
    border-radius: var(--radius-surface);
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
      border-radius: var(--radius-control);
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
