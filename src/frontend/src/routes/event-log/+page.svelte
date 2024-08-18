<script lang="ts">
    import { onDestroy, onMount, afterUpdate } from 'svelte';
    import { mavlinkLogStore, mavStateStore } from '../../stores/mavlinkStore';
    import Modal from '../../components/Modal.svelte';
    import PocketBase from 'pocketbase';
    import { get } from 'svelte/store';

    const pb = new PocketBase('http://localhost:8090');
    
    let logs: string[] = [];
    let logContainer: HTMLElement;
    let showTimeSync = false;
    let showParamValue = false;
    let showGPSRawInt = false;
    let showSysStatus = false;
    let searchTerm = '';
    let systemState = get(mavStateStore);

    $: systemState = $mavStateStore;

    const heartbeatInfo = 'HEARTBEAT is a message sent by the autopilot to communicate its presence and status to the GCS.';

    $: if (logs[logs.length - 1]?.indexOf('HEARTBEAT') !== -1) triggerHeartbeat();

    async function triggerHeartbeat() {
        if (typeof document !== 'undefined') {
            const heartbeat = document.querySelector('.heartbeat');
            const icon = document.querySelector('.heartbeat i');
            if (heartbeat) {
                heartbeat.classList.add('text-green-500');
                heartbeat.classList.remove('text-white');
                icon?.classList.add('animate-ping');
                setTimeout(() => {
                    icon?.classList.remove('animate-ping');
                    heartbeat.classList.remove('text-green-500');
                    heartbeat.classList.add('text-white');
                }, 2000);
            }
        }
    }

    function handleShowMessage(event: Event, message: string) {
        let checked = (event.target as HTMLInputElement).checked;
        if (checked) {
            document.querySelectorAll('pre span').forEach((span) => {
                if (span.textContent?.includes(message)) {
                    // @ts-ignore
                    span.style.display = 'block';
                }
            });
        } else {
            document.querySelectorAll('pre span').forEach((span) => {
                if (span.textContent?.includes(message)) {
                    // @ts-ignore
                    span.style.display = 'none';
                }
            });
        }
        if (message === 'TIMESYNC') {
            showTimeSync = checked;
        } else if (message === 'PARAM_VALUE') {
            showParamValue = checked;
        } else if (message === 'GPS_RAW_INT') {
            showGPSRawInt = checked;
        } else if (message === 'SYS_STATUS') {
            showSysStatus = checked;
        }
    }

    function highlightText(event: Event) {
        searchTerm = (event.target as HTMLInputElement).value.toLowerCase();
        if (searchTerm === '') {
            document.querySelectorAll('pre span').forEach((span) => {
                span.innerHTML = span.innerHTML.replace(/<\/?mark>/g, '');
            });
            return;
        }

        document.querySelectorAll('pre span').forEach((span) => {
            const text = span.textContent || '';
            const highlightedText = text.replace(new RegExp(searchTerm, 'gi'), (match) => `<mark>${match}</mark>`);
            span.innerHTML = highlightedText;
        });
    }

    function getHighlightedLog(log: string) {
        if (!searchTerm) return log;
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        return log.replace(regex, '<mark>$1</mark>');
    }

    function clearLogs() {
        logs = [];
        mavlinkLogStore.set(logs);
        pb.collection('blackbox').getFullList().then((list) => {
            list.forEach((item) => {
                pb.collection('blackbox').delete(item.id);
            });
        });
    }

    function confirmClear() {
        let modal = new Modal({
        target: document.body,
        props: {
            title: 'Clear MAVLink Logs',
            content: 'Are you sure you want to clear all MAVLink Logs? This action cannot be undone.',
            isOpen: true,
            confirmation: true,
            notification: false,
            onConfirm: () => {
            clearLogs();
            modal.$destroy();
            const newModal = new Modal({
                target: document.body,
                props: {
                title: 'Logs Cleared',
                content: 'All MAVLink Logs have been cleared successfully.',
                isOpen: true,
                confirmation: false,
                notification: true,
                }
            });
            },
        }
        });
    }

    function downloadLogs() {
        const element = document.createElement('a');
        const file = new Blob([logs.join('\n')], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = 'mavlink_logs.txt';
        document.body.appendChild(element);
        element.click();
    }

    onMount(() => {
        mavlinkLogStore.subscribe((value) => {
            logs = value;
        });
    });

    afterUpdate(() => {
        logContainer.scrollTop = logContainer.scrollHeight;
    });
</script>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
    <div class="dashboard w-full gap-4 p-5 bg-[#121212] rounded-[30px] rounded-l-none overflow-hidden h-[90vh] max-h-[90vh]">
        <div class="event-log bg-[#1c1c1e] rounded-2xl h-full flex flex-col p-5">
            <div class="flex items-center justify-between gap-4 mb-4">
                <h2 class="text-white text-xl">MAVLink Events</h2>
                <div class="filters flex gap-4 justify-center items-center">
                    <input type="text" class="form-input" placeholder="Search" on:input={highlightText}/>
                    <div class="form-checkbox gap-2">
                        <input type="checkbox" class="form-checkbox" name="Toggle TIMESYNC" checked={showTimeSync} on:change={(event) => handleShowMessage(event, 'TIMESYNC')}>
                        <label for="Toggle TIMESYNC" class="text-white mr-2">TIMESYNC</label>
                        <input type="checkbox" class="form-checkbox" name="Toggle PARAM_VALUE" checked={showParamValue} on:change={(event) => handleShowMessage(event, 'PARAM_VALUE')}>
                        <label for="Toggle PARAM_VALUE" class="text-white">PARAM_VALUE</label>
                        <input type="checkbox" class="form-checkbox" name="Toggle GPS_RAW_INT" checked={showGPSRawInt} on:change={(event) => handleShowMessage(event, 'GPS_RAW_INT')}>
                        <label for="Toggle GPS_RAW_INT" class="text-white">GPS_RAW_INT</label>
                        <input type="checkbox" class="form-checkbox" name="Toggle SYS_STATUS" checked={showSysStatus} on:change={(event) => handleShowMessage(event, 'SYS_STATUS')}>
                        <label for="Toggle SYS_STATUS" class="text-white">SYS_STATUS</label>
                    </div>
                    <div class="btns flex gap-4">
                        <button class="btn btn-primary bg-orange-400 hover:bg-orange-500" on:click={confirmClear}>Clear</button>
                        <button class="btn btn-primary bg-green-500 hover:bg-green-700" on:click={downloadLogs}>Download</button>
                    </div>
                </div>
                <div class="text-white w-fit flex">
                    System State:<span class="text-[#61cd89] ml-1 mr-3">{systemState}</span>
                    <div class="heartbeat text-white w-fit relative mr-5">
                        <div>
                            <i class="fas fa-heart absolute top-[0.15rem]"></i>
                            <i class="fas fa-heart absolute top-[0.15rem]"></i>
                        </div>
                        <span class="tooltip">{heartbeatInfo}</span>
                    </div>
                </div>
            </div>
            <pre class="text-gray-300 flex flex-col" bind:this={logContainer}>
                {#each logs as log}
                    {#if log.indexOf('HEARTBEAT') === -1}
                        {#if log.indexOf('TIMESYNC') !== -1}
                            <span style="display: {showTimeSync ? 'block' : 'none'}">{@html getHighlightedLog(log)}</span>
                        {:else if log.indexOf('PARAM_VALUE') !== -1}
                            <span style="display: {showParamValue ? 'block' : 'none'}">{@html getHighlightedLog(log)}</span>
                        {:else if log.indexOf('GPS_RAW_INT') !== -1}
                            <span style="display: {showGPSRawInt ? 'block' : 'none'}">{@html getHighlightedLog(log)}</span>
                        {:else if log.indexOf('SYS_STATUS') !== -1}
                            <span style="display: {showSysStatus ? 'block' : 'none'}">{@html getHighlightedLog(log)}</span>
                        {:else}
                            <span>{@html getHighlightedLog(log)}</span>
                        {/if}
                    {/if}
                {/each}
            </pre>
        </div>
    </div>
</div>


<style>
    pre {
        white-space: pre-wrap;
        word-wrap: break-word;
        background-color: #2b2b2b;
        border-radius: 10px;
        padding: 10px;
        max-height: 95%;
        overflow-y: auto;
        height: 100%;
    }

    .tooltip {
        position: absolute;
        top: 0;
        right: 0;
        margin-bottom: 0.5rem;
        background-color: black;
        color: white;
        padding: 0.3rem;
        border-radius: 0.25rem;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s, visibility 0.3s, transform 0.3s;
        z-index: 1;
        transform: translate(-15px, -6px);
    }

    .heartbeat:hover .tooltip {
        opacity: 1;
        visibility: visible;
    }

    .form-checkbox {
        display: flex;
        align-items: center;
    }

    .form-checkbox:checked {
        background-color: #61cd89;
    }

    .form-input {
        padding: 0.5rem;
        font-size: 0.875rem;
    }

    input {
        border: none;
        border-radius: 0.5rem;
        padding-inline: 0.5em;
        padding-block: 0.25em;
        background-color: #2d2d2d;
        color: white;
    }

    input:focus {
        border-color: #61cd89;
    }

    .form-input:focus {
        outline: none;
        border-color: #61cd89;
    }

    input[type="checkbox"] {
        appearance: none;
        width: 1rem;
        height: 1rem;
        border-radius: 0.25rem;
        background-color: #2d2d2d;
        cursor: pointer;
    }

    input[type="checkbox"]:checked {
        background-color: #61cd89;
    }

    button {
        font-size: small;
        padding: 4px 8px;
        border-radius: 0.5rem;
        color: white;
        cursor: pointer;
    }

    label {
        font-size: 10pt;
    }

    .heartbeat {
        transition: 0s;
    }
    @media (min-width: 990px) {
        .event-log > div {
            overflow: hidden;
        }
    }

    /* Mobile Styles */
    @media (max-width: 990px) {
        .dashboard {
            height: 100%;
            max-height: 95vh;
            border-radius: 0;
        }
        .event-log {
            height: 100%;
            max-height: 88vh;
        }
        .event-log > div {
            display: flex;
            flex-direction: column;
        }
        .event-log > div > div:first-of-type {
            display: flex;
            flex-direction: column;
        }
        .form-checkbox {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
        }
    }

    @media (max-width: 1440px) {
        @media (min-width: 990px) {
            .event-log > div {
                display: block;
                text-align: center;
                height: 10%;
            }

            .filters + div {
                display: inline-flex;
            }
        }
    }
</style>