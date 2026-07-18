<script lang="ts">
    import { darkModeStore } from '../../stores/customizationStore';
    import {
        mavlinkParamStore,
        mavModelStore,
        mavVibrationStore,
        mavAttitudeStore,
        fcProtocolStore,
        type Parameter
    } from '../../stores/mavlinkStore';
    import { onMount } from 'svelte';
    import { writable, type Writable } from 'svelte/store';
    import { encodeParameterValue } from '../../lib/mavlink-client';
    import { PARAM_GROUPS, paramInGroup, helpFor, type ParamGroup } from '../../lib/param-groups';
    import { collectPidParams, type TuningRecommendation, type TuningResult } from '../../lib/pid-tuning';
    import { m } from '$lib/paraglide/messages';

    const loading: Writable<boolean> = writable(false);
    const success: Writable<string | null> = writable(null);
    const error: Writable<string | null> = writable(null);
    const modified: Writable<string[]> = writable([]);

    
    // Parameter type mapping with index signature
    // https://mavlink.io/en/messages/common.html#MAV_PARAM_TYPE
    const PARAM_TYPES: { [key: number]: string } = {
        1: 'uint8',
        2: 'int8',
        3: 'uint16',
        4: 'int16',
        5: 'uint32',
        6: 'int32',
        7: 'uint64',
        8: 'int64',
        9: 'float',
        10: 'double'
    };

    let searchTerm = $state('');
    let activeGroup = $state<string | null>(null);

    // Betaflight and INAV expose their settings over MSP and the CLI, not the
    // MAVLink parameter protocol this page speaks, so the table stays empty on
    // them and a note stands in for it.
    const fcIsMsp = $derived($fcProtocolStore === 'msp');

    let aiTuning = $state(false);
    let tuningResult = $state<TuningResult | null>(null);
    let tuningError = $state<string | null>(null);

    const allParams: Parameter[] = $derived(
        $mavlinkParamStore ? Array.from(Object.values($mavlinkParamStore)) : []
    );

    // Only surface a curated group once at least one of its parameters has
    // arrived, so the chip row matches whichever autopilot is connected.
    const availableGroups: ParamGroup[] = $derived(
        PARAM_GROUPS.filter((group) =>
            allParams.some((param) => paramInGroup(param.param_id, group, $mavModelStore))
        )
    );

    const activeGroupDef: ParamGroup | null = $derived(
        activeGroup ? (PARAM_GROUPS.find((group) => group.key === activeGroup) ?? null) : null
    );

    let filteredParams: Parameter[] = $derived(
        allParams.filter((param) => {
            const matchesSearch = param.param_id.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesGroup =
                !activeGroupDef || paramInGroup(param.param_id, activeGroupDef, $mavModelStore);
            return matchesSearch && matchesGroup;
        })
    );

    onMount(() => {
        requestParameters();
    });

    async function requestParameters() {
        if (fcIsMsp) return;
        try {
            loading.set(true);
            error.set(null);
            success.set(null);
            
            const response = await fetch('/api/mavlink/request_params', {
                method: 'POST',
                headers: {'content-type': 'application/json'},
            });

            if (!response.ok) throw new Error(await response.text());
        } catch (err) {
            error.set((err as Error).message);
        } finally {
            loading.set(false);
        }
    }

    async function writeParameter(id: string, value: number, type: number) {
        try {
            error.set(null);
            const encodedValue = encodeParameterValue(value, type);
            
            // Remove any extra quotes from the parameter ID
            const cleanId = id.replace(/^"|"$/g, '');
            
            console.log('Writing parameter:', {
                id: cleanId,
                originalValue: value,
                encodedValue,
                type
            });
            
            const response = await fetch('/api/mavlink/write_param', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json; charset=utf-8',
                    'id': cleanId,
                    'value': encodedValue.toString(),
                    'type': type.toString(),
                },
            });

            if (!response.ok) throw new Error(await response.text());
            success.set(m.param_write_success({ id: cleanId }));
            modified.update(modified => modified.filter(param_id => param_id !== cleanId));
            setTimeout(() => success.set(null), 5000);
        } catch (err) {
            error.set(m.param_write_error({ id, error: (err as Error).message }));
            setTimeout(() => error.set(null), 5000);
        }
    }

    async function aiTunePid() {
        tuningError = null;
        tuningResult = null;
        const pids = collectPidParams(allParams, $mavModelStore);
        if (pids.length === 0) {
            tuningError = m.param_tune_no_pids();
            return;
        }
        aiTuning = true;
        try {
            const response = await fetch('/api/ai/pid-tune', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    model: $mavModelStore,
                    pids,
                    vibration: $mavVibrationStore,
                    attitude: $mavAttitudeStore
                })
            });
            const data = await response.json();
            if (!response.ok) {
                tuningError = data.message ?? m.param_tune_failed();
                return;
            }
            tuningResult = data as TuningResult;
        } catch (err) {
            tuningError = (err as Error).message;
        } finally {
            aiTuning = false;
        }
    }

    function applyRecommendation(rec: TuningRecommendation) {
        const current = Object.values($mavlinkParamStore).find(
            (p) => p.param_id.replace(/^"|"$/g, '') === rec.param_id
        );
        if (!current) {
            error.set(m.param_tune_not_loaded({ id: rec.param_id }));
            return;
        }
        writeParameter(rec.param_id, rec.suggested, current.param_type);
    }

    async function applyAllRecommendations() {
        if (!tuningResult) return;
        for (const rec of tuningResult.recommendations) {
            applyRecommendation(rec);
        }
    }

    function closeTuning() {
        tuningResult = null;
        tuningError = null;
    }

    function handleParameterChange(_event: Event, param_id: string, _param_type: number) {
        modified.update(modified => {
            if (!modified.includes(param_id)) {
                modified.push(param_id);
            }
            return modified;
        });
    }

    async function exportParameters() {
        // downloads a JSON file with all parameters
        const params = Object.values($mavlinkParamStore);
        const blob = new Blob([JSON.stringify(params)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'parameters.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    async function importParameters() {
        // reads a JSON file with parameters and sends them to the server
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
            if (input.files && input.files.length > 0) {
                const file = input.files[0];
                const reader = new FileReader();
                reader.onload = async () => {
                    try {
                        const params = JSON.parse(reader.result as string);
                        for (const param of params) {
                            await writeParameter(param.param_id, param.param_value, param.param_type);
                        }
                    } catch (err) {
                        error.set(m.param_import_error({ error: (err as Error).message }));
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

</script>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
    <div class="dashboard w-full grid grid-cols-12 grid-rows-6 gap-4 p-5 rounded-3xl rounded-l-none overflow-auto overflow-x-hidden h-[90vh] max-h-[90vh]"
    >
        <div class="user-settings col-span-12 row-span-6 rounded-2xl h-full p-6">
            <div class="flex flex-col h-full">
                <!-- Header -->
                <div class="page-head flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold" style="color: var(--fontColor)">
                        {m.param_title()}
                        <a target="_blank" href="https://ardupilot.org/dev/docs/mavlink-get-set-params.html" class="relative text-blue-500">
                            <i class="fa-solid fa-square-arrow-up-right"></i>
                            <span class="tooltip">{m.param_ardupilot_ref()}</span>
                        </a>
                        <a target="_blank" href="https://docs.px4.io/v1.11/en/advanced_config/parameter_reference.html" class="relative text-blue-500">
                            <i class="fa-solid fa-square-arrow-up-right"></i>
                            <span class="tooltip">{m.param_px4_ref()}</span>
                        </a>
                    </h2>
                    <div class="space-x-2 text-sm">
                        <button 
                            class="relative px-4 py-2 bg-[#6e6e6e] text-white rounded-lg hover:bg-blue-600 transition-colors"
                            onclick={exportParameters}
                            disabled={$loading}
                        >
                            <i class="fa-solid fa-download"></i>
                            <span class="tooltip">{m.param_export()}</span>
                        </button>
                        <button 
                            class="relative px-4 py-2 bg-[#f89d47] text-white rounded-lg hover:bg-[#ec9c33] transition-colors"
                            onclick={importParameters}
                            disabled={$loading}
                        >
                            <i class="fa-solid fa-upload"></i>
                            <span class="tooltip">{m.param_import()}</span>
                        </button>
                        <button
                            class="relative px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                            onclick={requestParameters}
                            disabled={$loading}
                        >
                            <i class="fa-solid fa-sync"></i>
                            <span class="tooltip">{m.param_refresh()}</span>
                        </button>
                        <button
                            class="relative px-4 py-2 bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed] transition-colors"
                            onclick={aiTunePid}
                            disabled={$loading || aiTuning}
                        >
                            <i class="fa-solid {aiTuning ? 'fa-spinner fa-spin' : 'fa-robot'}"></i>
                            <span class="tooltip">{m.param_ai_tune()}</span>
                        </button>
                    </div>
                </div>

                <!-- Curated quick-config groups -->
                {#if availableGroups.length > 0}
                    <div class="mb-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            class="group-chip {activeGroup === null ? 'active' : ''}"
                            onclick={() => (activeGroup = null)}
                        >
                            <i class="fa-solid fa-list"></i> {m.param_all()}
                        </button>
                        {#each availableGroups as group (group.key)}
                            <button
                                type="button"
                                class="group-chip {activeGroup === group.key ? 'active' : ''}"
                                onclick={() => (activeGroup = activeGroup === group.key ? null : group.key)}
                            >
                                <i class="fa-solid {group.icon}"></i> {group.label()}
                            </button>
                        {/each}
                    </div>
                    {#if activeGroupDef}
                        <p class="group-blurb mb-4">{activeGroupDef.blurb()}</p>
                    {/if}
                {/if}

                <!-- Search -->
                <div class="mb-6">
                    <input
                        type="text"
                        bind:value={searchTerm}
                        placeholder={m.param_search_placeholder()}
                        class="w-full p-2 rounded-lg search border focus:border-blue-500 focus:outline-none"
                    />
                </div>

                <!-- Success States -->
                {#if $success}
                    <div class="bg-green-500 text-white p-4 rounded-lg mb-4 relative" id="success">
                        {$success}
                        <button class="absolute top-0 right-0 p-4" aria-label={m.common_dismiss()} onclick={() => success.set(null)}>
                            <i class="fas fa-xmark"></i>
                        </button>
                    </div>
                {/if}

                <!-- Error States -->
                {#if $error}
                    <div class="bg-red-500 text-white p-4 rounded-lg mb-4 relative" id="error">
                        {$error}
                        <button class="absolute top-0 right-0 p-4" aria-label={m.common_dismiss()} onclick={() => error.set(null)}>
                            <i class="fas fa-xmark"></i>
                        </button>
                    </div>
                {/if}

                <!-- Parameter List -->
                {#if fcIsMsp}
                    <p class="msp-hint flex-grow">{m.param_msp_hint({ model: $mavModelStore })}</p>
                {:else}
                <div class="param-list flex-grow overflow-y-auto">
                    <table class="w-full text-white">
                        <thead class="sticky top-0" style={ $darkModeStore ? 'background-color: #1f2937' : 'background-color: slategrey' }>
                            <tr>
                                <th class="text-left p-2">{m.param_th_parameter()}</th>
                                <th class="text-left p-2">{m.param_th_value()}</th>
                                <th class="text-left p-2">{m.param_th_type()}</th>
                                <th class="text-left p-2">{m.param_th_actions()}</th>
                                <th class="text-left p-2">{m.param_th_status()}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#key mavlinkParamStore}
                                {#each filteredParams as param (param.param_id)}
                                    <tr class="border-b">
                                        <td class="p-2 param_id" style="color: var(--fontColor)">
                                            {param.param_id}
                                            {#if helpFor(param.param_id)}
                                                <span class="param-help">{helpFor(param.param_id)}</span>
                                            {/if}
                                        </td>
                                        <td class="p-2">
                                            <input 
                                                type="number"
                                                bind:value={param.param_value}
                                                class="rounded-lg p-1 w-32 param_value"
                                                onchange={(e) => handleParameterChange(e, param.param_id, param.param_type)}
                                            />
                                        </td>
                                        <td class="p-2 param_type">{PARAM_TYPES[param.param_type] ?? m.param_type_unknown()}</td>
                                        <td class="p-2">
                                            <button 
                                                class="px-2 py-1 bg-[#1aac6e] rounded-lg hover:bg-[#2a7757] transition-colors"
                                                onclick={() => writeParameter(param.param_id, param.param_value, param.param_type)}
                                            >
                                                {m.param_save()}
                                            </button>
                                        </td>
                                        <td class="p-2">
                                            <span class="text-orange-400" hidden={!$modified.includes(param.param_id)}>{m.param_modified()}</span>
                                            <span class="text-green-400" hidden={$modified.includes(param.param_id)}>{m.param_saved()}</span>
                                        </td>
                                    </tr>
                                {/each}
                            {/key}
                        </tbody>
                    </table>
                </div>
                {/if}
            </div>
        </div>
    </div>
</div>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && (tuningResult || tuningError)) closeTuning(); }} />

{#if tuningResult || tuningError}
    <div
        class="ai-modal-backdrop"
        role="presentation"
        tabindex="-1"
        onclick={(e) => { if (e.target === e.currentTarget) closeTuning(); }}
        onkeydown={(e) => { if (e.key === 'Escape') closeTuning(); }}
    >
        <div class="ai-modal" role="dialog" aria-modal="true" tabindex="-1">
            <div class="ai-modal-head">
                <h3><i class="fa-solid fa-robot"></i> {m.param_ai_modal_title()}</h3>
                <button class="ai-close" aria-label={m.common_close()} onclick={closeTuning}><i class="fas fa-xmark"></i></button>
            </div>
            {#if tuningError}
                <p class="ai-error">{tuningError}</p>
            {:else if tuningResult}
                {#if tuningResult.summary}
                    <p class="ai-summary">{tuningResult.summary}</p>
                {/if}
                {#if tuningResult.recommendations.length === 0}
                    <p class="ai-summary">{m.param_ai_no_recs()}</p>
                {:else}
                    <div class="ai-recs">
                        {#each tuningResult.recommendations as rec (rec.param_id)}
                            <div class="ai-rec">
                                <div class="ai-rec-main">
                                    <span class="ai-rec-id">{rec.param_id}</span>
                                    <span class="ai-rec-change">{rec.current} <i class="fa-solid fa-arrow-right"></i> {rec.suggested}</span>
                                    <button class="ai-apply" onclick={() => applyRecommendation(rec)}>{m.param_apply()}</button>
                                </div>
                                {#if rec.reason}<p class="ai-rec-reason">{rec.reason}</p>{/if}
                            </div>
                        {/each}
                    </div>
                    <div class="ai-modal-foot">
                        <button class="ai-apply-all" onclick={applyAllRecommendations}>{m.param_apply_all()}</button>
                    </div>
                {/if}
                <p class="ai-disclaimer">{m.param_ai_disclaimer()}</p>
            {/if}
        </div>
    </div>
{/if}

<style>
    .dashboard {
        background-color: var(--secondaryColor);
    }

    .dashboard * {
        transition: 0s !important;
    }
  
    .user-settings {
        background: var(--primaryColor);
    }

    .param_id, .param_type {
        color: var(--fontColor);
    }

    .param_value {
        background-color: var(--tertiaryColor);
        color: var(--fontColor);
    }

    .search {
        background-color: var(--tertiaryColor);
        color: var(--fontColor);
        border: 1px solid var(--tertiaryColor);
    }

    .group-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.35rem 0.8rem;
        border-radius: 9999px;
        font-size: 0.85rem;
        background-color: var(--tertiaryColor);
        color: var(--fontColor);
        border: 1px solid transparent;
        transition: background-color 0.15s, border-color 0.15s;
    }

    .group-chip:hover {
        border-color: #3b82f6;
    }

    .group-chip.active {
        background-color: #3b82f6;
        color: #fff;
    }

    .group-blurb {
        color: var(--fontColor);
        opacity: 0.75;
        font-size: 0.85rem;
        max-width: 60ch;
    }

    .param-help {
        display: block;
        color: var(--fontColor);
        opacity: 0.6;
        font-size: 0.75rem;
        margin-top: 0.15rem;
        max-width: 42ch;
    }

    .msp-hint {
        color: var(--fontColor);
        opacity: 0.7;
        font-size: 0.85rem;
    }

    .ai-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.55);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 60;
        padding: 1rem;
    }

    .ai-modal {
        background: var(--primaryColor);
        color: var(--fontColor);
        border-radius: 1rem;
        width: 100%;
        max-width: 34rem;
        max-height: 80vh;
        overflow-y: auto;
        padding: 1.25rem 1.5rem 1.5rem;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
    }

    .ai-modal-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.75rem;
    }

    .ai-modal-head h3 {
        font-size: 1.15rem;
        font-weight: 700;
    }

    .ai-modal-head h3 i {
        color: #8b5cf6;
        margin-right: 0.4rem;
    }

    .ai-close {
        background: none;
        color: var(--fontColor);
        opacity: 0.6;
        font-size: 1.1rem;
    }

    .ai-close:hover {
        opacity: 1;
    }

    .ai-summary {
        font-size: 0.9rem;
        margin-bottom: 0.75rem;
        line-height: 1.4;
    }

    .ai-error {
        color: #f87171;
        font-size: 0.9rem;
    }

    .ai-recs {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }

    .ai-rec {
        background: var(--tertiaryColor);
        border-radius: 0.6rem;
        padding: 0.6rem 0.75rem;
    }

    .ai-rec-main {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        flex-wrap: wrap;
    }

    .ai-rec-id {
        font-weight: 600;
        font-family: monospace;
    }

    .ai-rec-change {
        font-family: monospace;
        opacity: 0.85;
    }

    .ai-rec-change i {
        margin: 0 0.3rem;
        color: #8b5cf6;
    }

    .ai-rec-reason {
        font-size: 0.8rem;
        opacity: 0.75;
        margin-top: 0.35rem;
    }

    .ai-apply {
        margin-left: auto;
        padding: 0.25rem 0.75rem;
        border-radius: 0.5rem;
        background: #1aac6e;
        color: #fff;
        font-size: 0.8rem;
    }

    .ai-apply:hover {
        background: #2a7757;
    }

    .ai-modal-foot {
        display: flex;
        justify-content: flex-end;
        margin-top: 0.9rem;
    }

    .ai-apply-all {
        padding: 0.4rem 1rem;
        border-radius: 0.5rem;
        background: #8b5cf6;
        color: #fff;
        font-size: 0.85rem;
    }

    .ai-apply-all:hover {
        background: #7c3aed;
    }

    .ai-disclaimer {
        font-size: 0.75rem;
        opacity: 0.6;
        margin-top: 1rem;
    }

    tr {
        border-color: var(--tertiaryColor);
    }

    /* Scrollbar styling */
    ::-webkit-scrollbar {
        width: 8px;
    }

    ::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
    }

    ::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: var(--radius-control);
    }

    ::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    .tooltip {
        position: absolute;
        top: 100%;
        left: -50%;
        display: flex;
        font-size: medium;
        padding-block: 0;
        padding-inline: 0.5em;
        border-radius: var(--radius-control);
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s, visibility 0.3s, transform 0.3s;
        z-index: 1;
    }

    a:hover .tooltip, button:hover .tooltip{
        opacity: 1;
        visibility: visible;
        transform: translate(-45px, 5px);
    }

    /* Mobile Styles */
    @media (max-width: 990px) {
        .dashboard {
            border-radius: 0;
            padding: 0.7em;
            height: 100%;
            max-height: 95vh;
        }

        .user-settings {
            padding: 0.9rem;
        }

        .page-head {
            flex-wrap: wrap;
            gap: 0.6rem;
            margin-bottom: 0.9rem;
        }

        .page-head h2 {
            font-size: 1.15rem;
        }

        .param-list {
            overflow-x: auto;
        }

        .param-list table {
            min-width: 540px;
            font-size: 0.8rem;
        }

        .param-list .param_value {
            width: 5.5rem;
        }
    }
</style>