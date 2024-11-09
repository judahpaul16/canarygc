<script lang="ts">
    import { primaryColorStore, secondaryColorStore } from '../../stores/customizationStore';
    import { mavlinkParamStore, type Parameter, type ParameterMeta } from '../../stores/mavlinkStore';
    import { onMount } from 'svelte';
    import { get, writable, type Writable } from 'svelte/store';

    const loading: Writable<boolean> = writable(false);
    const error: Writable<string | null> = writable(null);

    $: primaryColor = $primaryColorStore;
    $: secondaryColor = $secondaryColorStore;
    
    // Parameter type mapping with index signature
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

    let searchTerm = '';
    let filteredParams: Parameter[] = [];

    $: {
        if ($mavlinkParamStore) {
            filteredParams = Array.from(Object.values($mavlinkParamStore)).filter(param => 
                param.param_id.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
    }

    onMount(() => {
        requestParameters();
    });

    async function requestParameters() {
        try {
            loading.set(true);
            error.set(null);
            
            const response = await fetch('/api/mavlink/request_params', {
                method: 'POST',
                headers: {'content-type': 'application/json'},
            });

            if (!response.ok) throw new Error(await response.text());
        } catch (err: any) {
            error.set(err.message);
        } finally {
            loading.set(false);
        }
    }

    async function writeParameter(param_id: string, value: number) {
        try {
            error.set(null);
            const response = await fetch('/api/mavlink/write_param', {
                method: 'POST',
                headers: {'content-type': 'application/json'},
                body: JSON.stringify({ param_id, value })
            });

            if (!response.ok) throw new Error(await response.text());

        } catch (err: any) {
            error.set(`Failed to write parameter ${param_id}: ${err.message}`);
        }
    }

    function handleParameterChange(event: Event, param_id: string) {
        const target = event.target as HTMLInputElement;
        if (target && target.value) {
            writeParameter(param_id, parseFloat(target.value));
        }
    }
</script>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
    <div class="dashboard w-full grid grid-cols-12 grid-rows-6 gap-4 p-5 rounded-[30px] rounded-l-none overflow-auto h-[90vh] max-h-[90vh]"
        style="--secondaryColor: {secondaryColor}"
    >
        <div class="user-settings col-span-12 row-span-6 rounded-2xl h-full p-6" style="--primaryColor: {primaryColor}">
            <div class="flex flex-col h-full">
                <!-- Header -->
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-white">Vehicle Parameters</h2>
                    <button 
                        class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        on:click={requestParameters}
                        disabled={$loading}
                    >
                        Refresh Parameters
                    </button>
                </div>

                <!-- Search -->
                <div class="mb-6">
                    <input 
                        type="text"
                        bind:value={searchTerm}
                        placeholder="Search parameters..."
                        class="w-full p-2 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                </div>

                <!-- Error States -->
                {#if $error}
                    <div class="bg-red-500 text-white p-4 rounded-lg mb-4">
                        {$error}
                    </div>
                {/if}

                <!-- Parameter List -->
                <div class="flex-grow overflow-y-auto">
                    <table class="w-full text-white">
                        <thead class="sticky top-0 bg-gray-800">
                            <tr>
                                <th class="text-left p-2">Parameter</th>
                                <th class="text-left p-2">Value</th>
                                <th class="text-left p-2">Type</th>
                                <th class="text-left p-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#key mavlinkParamStore}
                                {#each filteredParams as param (param.param_id)}
                                    <tr class="border-b border-gray-700">
                                        <td class="p-2">{param.param_id}</td>
                                        <td class="p-2">
                                            <input 
                                                type="number"
                                                value={param.param_value}
                                                class="bg-gray-700 rounded p-1 w-32"
                                                on:change={(e) => handleParameterChange(e, param.param_id)}
                                            />
                                        </td>
                                        <td class="p-2">{PARAM_TYPES[param.param_type] ?? 'unknown'}</td>
                                        <td class="p-2">
                                            <button 
                                                class="px-2 py-1 bg-gray-600 rounded hover:bg-gray-500 transition-colors"
                                                on:click={() => writeParameter(param.param_id, param.param_value)}
                                            >
                                                Save
                                            </button>
                                        </td>
                                    </tr>
                                {/each}
                            {/key}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    .dashboard {
        background-color: var(--secondaryColor);
    }
  
    .user-settings {
        background: var(--primaryColor);
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
        border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }
</style>