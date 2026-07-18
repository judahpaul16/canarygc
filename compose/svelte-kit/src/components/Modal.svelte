<script lang="ts">
  import { untrack } from 'svelte';
  import { m } from '$lib/paraglide/messages';

  interface Props {
    title: string;
    content: string;
    html?: boolean;
    isOpen?: boolean;
    confirmation?: boolean;
    notification?: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
    inputs?: {
      type: string;
      placeholder: string;
      required: boolean;
      label?: string;
      value?: string;
      options?: { value: string; label: string }[];
    }[] | null;
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
    confirmLabel = m.common_confirm(),
    cancelLabel = m.common_cancel(),
    inputs = null,
    onConfirm = () => {},
    onCancel = () => {},
    onClose = () => {}
  }: Props = $props();

  let inputValues: string[] = $state(untrack(() => (inputs ? inputs.map((input) => input.value ?? '') : [])));
  let checkboxValues: boolean[] = $state(
    untrack(() => (inputs ? inputs.map((input) => input.type === 'checkbox' && input.value === 'true') : []))
  );
  let validationError = $state('');
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
      const missing = inputs.some((input, i) =>
        input.required && (input.type === 'checkbox' ? !checkboxValues[i] : !inputValues[i])
      );
      if (missing) {
        validationError = m.modal_required_fields();
        return;
      }
      inputs.forEach((input, i) => {
        if (input.type === 'checkbox') inputValues[i] = `${checkboxValues[i]}`;
      });
    }

    // Dismiss immediately, then run the handler; it may open another modal (the
    // pre-flight check) and take seconds to arm and take off, so leaving this one
    // mounted until it resolves would strand it on screen behind the next one.
    // onClose fires only after onConfirm settles: callers like the pre-flight
    // check resolve a decision in onConfirm and treat onClose as "dismissed
    // without deciding," so closing first would turn every confirm into a cancel.
    const values = [...inputValues];
    isOpen = false;
    await onConfirm(values);
    onClose();
  };
</script>

<svelte:window onkeydown={handleKeydown} />
{#if isOpen}
  <div class="elevated-surface fixed inset-0 flex items-center justify-center z-50 bg-[#00000090] p-4 backdrop-blur-sm"
  >
    <button type="button" aria-label={m.modal_close_dialog()} class="absolute inset-0 h-full w-full cursor-default" onclick={closeModal}></button>
    <div class="container relative z-10 rounded-2xl shadow-2xl w-full {html ? 'max-w-lg' : 'max-w-md'}" role="dialog" aria-modal="true">
      <div class="relative border-b" style="border-color: rgb(from var(--fontColor) r g b / 0.12);">
        <div class="px-5 py-3 text-lg font-semibold">
          {title}
        </div>
        <button onclick={closeModal} aria-label={m.common_close()} class="absolute top-2.5 right-3 opacity-60 hover:opacity-100 text-2xl leading-none">
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
            <div class="input-grid">
              {#each inputs as input, i (i)}
                {#if input.type === 'checkbox'}
                  <div class="check-field">
                    <input type="checkbox"
                      id={`modal-checkbox-${i}`}
                      bind:checked={checkboxValues[i]}
                    />
                    <label for={`modal-checkbox-${i}`}>{input.label ?? input.placeholder}</label>
                  </div>
                {:else if input.type === 'select'}
                  <div class="field field-wide">
                    {#if input.label}<label for={`modal-input-${i}`}>{input.label}</label>{/if}
                    <select id={`modal-input-${i}`} bind:value={inputValues[i]} class="form-input">
                      {#each input.options ?? [] as option (option.value)}
                        <option value={option.value}>{option.label}</option>
                      {/each}
                    </select>
                  </div>
                {:else}
                  <div class="field">
                    {#if input.label}<label for={`modal-input-${i}`}>{input.label}</label>{/if}
                    <input
                      id={`modal-input-${i}`}
                      type={input.type === 'number' ? 'number' : 'text'}
                      step={input.type === 'number' ? '0.0001' : undefined}
                      placeholder={input.placeholder}
                      bind:value={inputValues[i]}
                      class="form-input"
                      required />
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
            <button type="button" onclick={closeModal} class="bg-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400">{m.common_okay()}</button>
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

  /* One or two columns depending on field count; each field is full-width in
     its cell so placeholders and labels never truncate. */
  .input-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
    margin-top: 0.9rem;
    text-align: left;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }

  .field label {
    font-size: 0.78rem;
    opacity: 0.75;
    font-weight: 600;
  }

  .check-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    grid-column: 1 / -1;
  }

  .form-input {
    appearance: none;
    width: 100%;
    padding: 0.5rem 0.7rem;
    border: 2px solid var(--secondaryColor);
    border-radius: var(--radius-control);
    background-color: var(--tertiaryColor);
    color: var(--fontColor);
    font-size: 10pt;
    transition: border-color 0.2s ease, background-color 0.2s ease;
  }

  .form-input::placeholder {
    color: rgb(from var(--fontColor) r g b / 0.4);
  }

  /* Option labels run long, so a select takes the full row. */
  .field-wide {
    grid-column: 1 / -1;
  }

  select.form-input {
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.6' stroke-linecap='round'/></svg>");
    background-repeat: no-repeat;
    background-position: right 0.7rem center;
    padding-right: 2rem;
    cursor: pointer;
  }

  select.form-input option {
    background-color: var(--tertiaryColor);
    color: var(--fontColor);
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
