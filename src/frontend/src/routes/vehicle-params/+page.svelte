<script lang="ts">
    import { primaryColorStore, secondaryColorStore } from '../../stores/customizationStore';
    import { mavlinkParamStore, type Parameter, type ParameterMeta } from '../../stores/mavlinkStore';
    import { onMount } from 'svelte';
    import { get, writable, type Writable } from 'svelte/store';
    import Modal from '../../components/Modal.svelte';

    const loading: Writable<boolean> = writable(false);
    const success: Writable<string | null> = writable(null);
    const error: Writable<string | null> = writable(null);

    $: primaryColor = $primaryColorStore;
    $: secondaryColor = $secondaryColorStore;
    
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

    async function writeParameter(id: string, value: number, type: number) {
        try {
            error.set(null);
            const response = await fetch('/api/mavlink/write_param', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'id': id.toString(),
                    'value': value.toString(),
                    'type': type.toString(),
                },
            });

            if (!response.ok) throw new Error(await response.text());
            success.set(`Parameter ${id} written successfully`);

        } catch (err: any) {
            error.set(`Failed to write parameter ${id}: ${err.message}`);
        }
    }

    function handleParameterChange(event: Event, param_id: string, param_type: number) {
        const target = event.target as HTMLInputElement;
        if (target && target.value) {
            writeParameter(param_id, parseFloat(target.value), param_type);
        }
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
                    } catch (err: any) {
                        error.set(`Failed to import parameters: ${err.message}`);
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    async function confirmSetDefaults() {
        let modal = new Modal({
            target: document.body,
            props: {
                title: 'Reset Parameters',
                content: 'Are you sure you want to reset all parameters to their default values?',
                isOpen: true,
                confirmation: true,
                notification: false,
                onConfirm: async () => {
                    await setDefaults();
                    modal.$destroy();
                },
            }
        });
    }

    async function setDefaults() {
        try {
            loading.set(true);
            error.set(null);
            
            // TODO: Implement set defaults

        } catch (err: any) {
            error.set(err.message);
        } finally {
            loading.set(false);
        }
    }
</script>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
    <div class="dashboard w-full grid grid-cols-12 grid-rows-6 gap-4 p-5 rounded-[30px] rounded-l-none overflow-auto overflow-x-hidden h-[90vh] max-h-[90vh]"
        style="--secondaryColor: {secondaryColor}"
    >
        <div class="user-settings col-span-12 row-span-6 rounded-2xl h-full p-6" style="--primaryColor: {primaryColor}">
            <div class="flex flex-col h-full">
                <!-- Header -->
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-white">
                        Vehicle Parameters
                        <a target="_blank" href="https://ardupilot.org/dev/docs/mavlink-get-set-params.html" class="relative text-blue-500">
                            <i class="fa-solid fa-square-arrow-up-right"></i>
                            <span class="tooltip">ArduPilot Reference</span>
                        </a>
                        <a target="_blank" href="https://docs.px4.io/v1.11/en/advanced_config/parameter_reference.html" class="relative text-blue-500">
                            <i class="fa-solid fa-square-arrow-up-right"></i>
                            <span class="tooltip">PX4 Reference</span>
                        </a>
                    </h2>
                    <div class="space-x-2 text-sm">
                        <button 
                            class="relative px-4 py-2 bg-[#6e6e6e] text-white rounded-lg hover:bg-blue-600 transition-colors"
                            on:click={exportParameters}
                            disabled={$loading}
                        >
                            <i class="fa-solid fa-download"></i>
                            <span class="tooltip">Export Parameters</span>
                        </button>
                        <button 
                            class="relative px-4 py-2 bg-[#f89d47] text-white rounded-lg hover:bg-[#ec9c33] transition-colors"
                            on:click={importParameters}
                            disabled={$loading}
                        >
                            <i class="fa-solid fa-upload"></i>
                            <span class="tooltip">Import Parameters</span>
                        </button>
                        <button 
                            class="relative px-4 py-2 bg-[#e65353] text-white rounded-lg hover:bg-[#ec3e3e] transition-colors"
                            on:click={confirmSetDefaults}
                            disabled={$loading}
                        >
                            <i class="fa-solid fa-undo"></i>
                            <span class="tooltip">Reset ALL Parameters to Defaults</span>
                        </button>
                        <button 
                            class="relative px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                            on:click={requestParameters}
                            disabled={$loading}
                        >
                            <i class="fa-solid fa-sync"></i>
                            <span class="tooltip">Refresh Parameters</span>
                        </button>
                    </div>
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

                <!-- Success States -->
                {#if $success}
                    <div class="bg-green-500 text-white p-4 rounded-lg mb-4">
                        {$success}
                    </div>
                {/if}

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
                                                on:change={(e) => handleParameterChange(e, param.param_id, param.param_type)}
                                            />
                                        </td>
                                        <td class="p-2">{PARAM_TYPES[param.param_type] ?? 'unknown'}</td>
                                        <td class="p-2">
                                            <button 
                                                class="px-2 py-1 bg-gray-600 rounded hover:bg-gray-500 transition-colors"
                                                on:click={() => writeParameter(param.param_id, param.param_value, param.param_type)}
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

    .tooltip {
        position: absolute;
        top: 100%;
        left: -50%;
        display: flex;
        font-size: medium;
        padding-block: 0;
        padding-inline: 0.5em;
        border-radius: 0.25rem;
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
</style>