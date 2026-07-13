<script lang="ts" module>
	let uid = 0;
</script>

<script lang="ts">
	export interface SelectOption {
		value: string;
		label: string;
	}

	export interface SelectGroup {
		label: string;
		options: SelectOption[];
	}

	// One select look everywhere: the native control is unstyled
	// (appearance: none) and the caret is drawn by the wrapper with its own
	// inset from the right edge. `searchable` renders a type-to-filter input
	// against a datalist instead of a dropdown, wearing the same caret.
	let {
		value = $bindable(''),
		options = [],
		groups = [],
		placeholder = '',
		searchable = false,
		disabled = false,
		id = undefined,
		onchange = undefined
	}: {
		value?: string;
		options?: SelectOption[];
		groups?: SelectGroup[];
		placeholder?: string;
		searchable?: boolean;
		disabled?: boolean;
		id?: string;
		onchange?: (value: string) => void;
	} = $props();

	const listId = `select-list-${++uid}`;

	// Upstream catalogs occasionally repeat a value; a keyed each throws on a
	// duplicate key, so the option list is de-duplicated before rendering.
	let uniqueOptions = $derived.by(() => {
		const seen = new Set<string>();
		return options.filter((o) => (seen.has(o.value) ? false : seen.add(o.value)));
	});
</script>

<div class="select-wrap" class:disabled>
	{#if searchable}
		<input
			{id}
			list={listId}
			bind:value
			{placeholder}
			{disabled}
			autocomplete="off"
			oninput={() => onchange?.(value)}
		/>
		<datalist id={listId}>
			{#each uniqueOptions as option (option.value)}
				<option value={option.value}>{option.label === option.value ? '' : option.label}</option>
			{/each}
		</datalist>
		<i class="fas fa-magnifying-glass caret search"></i>
	{:else}
		<select {id} bind:value {disabled} onchange={() => onchange?.(value)}>
			{#if placeholder}
				<option value="">{placeholder}</option>
			{/if}
			{#each uniqueOptions as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
			{#each groups as group (group.label)}
				<optgroup label={group.label}>
					{#each group.options as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
		<i class="fas fa-chevron-down caret"></i>
	{/if}
</div>

<style>
	.select-wrap {
		position: relative;
		width: 100%;
	}

	.select-wrap.disabled {
		opacity: 0.55;
	}

	select,
	input {
		appearance: none;
		width: 100%;
		padding: 0.55rem 2.4rem 0.55rem 0.8rem;
		font-size: 0.85rem;
		color: var(--fontColor);
		background-color: rgb(from var(--tertiaryColor) r g b / 0.7);
		border: 1px solid rgb(from var(--fontColor) r g b / 0.12);
		border-radius: var(--radius-control);
		outline: none;
		cursor: pointer;
		transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
	}

	input {
		cursor: text;
	}

	input::placeholder {
		color: rgb(from var(--fontColor) r g b / 0.35);
	}

	select:hover,
	input:hover {
		border-color: rgb(from var(--fontColor) r g b / 0.22);
	}

	select:focus,
	input:focus {
		border-color: #f5c518;
		background-color: rgb(from var(--tertiaryColor) r g b / 0.9);
		box-shadow: 0 0 0 3px rgba(245, 197, 24, 0.18);
	}

	/* Chromium draws its own datalist expander arrow inside the input; the
	   wrapper's caret replaces it. */
	input::-webkit-calendar-picker-indicator {
		display: none !important;
	}

	.caret {
		position: absolute;
		top: 50%;
		right: 0.9rem;
		transform: translateY(-50%);
		font-size: 0.7rem;
		opacity: 0.55;
		pointer-events: none;
	}

	.caret.search {
		font-size: 0.75rem;
	}
</style>
