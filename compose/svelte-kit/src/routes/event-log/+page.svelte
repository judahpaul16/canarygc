<script lang="ts">
    import { mavlinkLogStore, mavStateStore } from '../../stores/mavlinkStore';
    import { showModal } from '../../lib/overlays';

    const HEARTBEAT_FLASH_MS = 2000;

    let logContainer: HTMLElement | undefined = $state();
    let showTimeSync = $state(false);
    let showParamValue = $state(false);
    let showGPSRawInt = $state(false);
    let showSysStatus = $state(false);
    let searchTerm = $state('');

    let logs = $derived($mavlinkLogStore);
    let systemState = $derived($mavStateStore);
    const heartbeatInfo = 'HEARTBEAT is a message sent by the autopilot to communicate its presence and status to the GCS.';

    $effect(() => {
        if (logs[logs.length - 1]?.indexOf('HEARTBEAT') !== -1) triggerHeartbeat();
    });

    $effect(() => {
        void logs;
        if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
    });

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
                }, HEARTBEAT_FLASH_MS);
            }
        }
    }

    interface LogSegment {
        text: string;
        hit: boolean;
    }

    function escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Splits a log line into plain and search-matching segments so matches can
    // be wrapped in <mark> without rendering the log text as HTML.
    function segments(log: string): LogSegment[] {
        if (!searchTerm) return [{ text: log, hit: false }];
        const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
        return log
            .split(regex)
            .filter((part) => part !== '')
            .map((part) => ({ text: part, hit: part.toLowerCase() === searchTerm.toLowerCase() }));
    }

    function clearLogs() {
        mavlinkLogStore.set([]);
    }

    function confirmClear() {
        showModal({
            title: 'Clear MAVLink Logs',
            content: 'Are you sure you want to clear all MAVLink Logs? This action cannot be undone.',
            confirmation: true,
            onConfirm: () => {
                clearLogs();
                showModal({
                    title: 'Logs Cleared',
                    content: 'All MAVLink Logs have been cleared successfully.',
                    notification: true
                });
            },
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
</script>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
    <div class="dashboard w-full gap-4 p-5 rounded-3xl rounded-l-none overflow-hidden h-[90vh] max-h-[90vh]"
    >
        <div class="event-log rounded-2xl h-full flex flex-col p-5">
            <div class="flex items-center justify-between gap-4 mb-4">
                <h2 class="text-xl">MAVLink Events</h2>
                <div class="filters flex gap-4 justify-center items-center">
                    <input type="text" class="form-input" placeholder="Search" bind:value={searchTerm}/>
                    <div class="form-checkbox gap-2">
                        <input type="checkbox" class="form-checkbox" name="Toggle TIMESYNC" bind:checked={showTimeSync}>
                        <label for="Toggle TIMESYNC" class="mr-2">TIMESYNC</label>
                        <input type="checkbox" class="form-checkbox" name="Toggle PARAM_VALUE" bind:checked={showParamValue}>
                        <label for="Toggle PARAM_VALUE">PARAM_VALUE</label>
                        <input type="checkbox" class="form-checkbox" name="Toggle GLOBAL_POSITION_INT" bind:checked={showGPSRawInt}>
                        <label for="Toggle GLOBAL_POSITION_INT">GLOBAL_POSITION_INT</label>
                        <input type="checkbox" class="form-checkbox" name="Toggle BATTERY_STATUS" bind:checked={showSysStatus}>
                        <label for="Toggle BATTERY_STATUS">BATTERY_STATUS</label>
                    </div>
                    <div class="btns flex gap-4">
                        <button class="btn btn-primary bg-red-400 hover:bg-red-500 relative" onclick={confirmClear}>
                            <i class="fas fa-trash-alt"></i>
                            <div class="tooltip">Clear</div>
                        </button>
                        <button class="btn btn-primary bg-blue-400 hover:bg-blue-500 relative" onclick={downloadLogs}>
                            <i class="fas fa-download"></i>
                            <div class="tooltip">Download</div>
                        </button>
                    </div>
                </div>
                <div class="system-state w-fit flex">
                    System State:<p class="text-[#61cd89] ml-1 mr-2">{systemState}</p>
                    <div class="heartbeat w-fit relative mr-5">
                        <div>
                            <i class="fas fa-heart absolute top-[0.15rem]"></i>
                            <i class="fas fa-heart absolute top-[0.15rem]"></i>
                        </div>
                        <div class="tooltip">{heartbeatInfo}</div>
                    </div>
                </div>
            </div>
            <pre class="text-gray-300 flex flex-col" bind:this={logContainer}>
                {#each logs as log (log)}
                    {#if log.indexOf('HEARTBEAT') === -1 && log.indexOf('MISSION_CURRENT') === -1 && log.indexOf('"command":512') === -1 && log.indexOf('GPS_RAW_INT') === -1}
                        {#if log.indexOf('TIMESYNC') !== -1}
                            <span style="display: {showTimeSync ? 'block' : 'none'}">{#each segments(log) as seg, i (i)}{#if seg.hit}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}</span>
                        {:else if log.indexOf('PARAM_VALUE') !== -1}
                            <span style="display: {showParamValue ? 'block' : 'none'}">{#each segments(log) as seg, i (i)}{#if seg.hit}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}</span>
                        {:else if log.indexOf('GLOBAL_POSITION_INT') !== -1}
                            <span style="display: {showGPSRawInt ? 'block' : 'none'}">{#each segments(log) as seg, i (i)}{#if seg.hit}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}</span>
                        {:else if log.indexOf('BATTERY_STATUS') !== -1}
                            <span style="display: {showSysStatus ? 'block' : 'none'}">{#each segments(log) as seg, i (i)}{#if seg.hit}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}</span>
                        {:else}
                            <span>{#each segments(log) as seg, i (i)}{#if seg.hit}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}</span>
                        {/if}
                    {/if}
                {/each}
            </pre>
        </div>
    </div>
</div>


<style>
    .dashboard {
      background-color: var(--secondaryColor);
    }

    h2, span, label, .system-state {
        color: var(--fontColor);
    }

    pre {
        white-space: pre-wrap;
        word-wrap: break-word;
        background-color: var(--secondaryColor);
        border-radius: var(--radius-control);
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
        padding: 0.3rem;
        border-radius: var(--radius-control);
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

    button:first-of-type > .tooltip {
        transform: translateX(-35px);
    }
    button:last-of-type > .tooltip {
        transform: translateX(75px);
    }

    button:hover .tooltip {
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
        border-radius: var(--radius-control);
        padding-inline: 0.5em;
        padding-block: 0.25em;
        background-color: var(--secondaryColor);
        color: var(--fontColor);
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
        border-radius: var(--radius-control);
        background-color: var(--tertiaryColor);
        cursor: pointer;
    }

    input[type="checkbox"]:checked {
        background-color: #61cd89;
    }

    button {
        font-size: small;
        padding: 4px 8px;
        border-radius: var(--radius-control);
        color: #ffffff;
        cursor: pointer;
    }

    label {
        font-size: 10pt;
    }

    .heartbeat {
        transition: 0s;
    }

    .fa-heart:last-of-type {
        color: #7c7c7c;
        opacity: 0.2;
    }

    .event-log {
        background-color: var(--primaryColor);
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
                display: inline-table;
                text-align: center;
                height: 10%;
            }

            .filters + div {
                display: inline-flex;
            }
        }
    }
</style>
