<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { mavlinkLogStore } from '../../stores/mavlinkStore';
    import Modal from '../../components/Modal.svelte';
    
    let logs: string[] = [];
    let logContainer: HTMLElement;
    let showTimeSync = true;
    let showParamValue = true;
    let searchTerm = '';

    const heartbeatInfo = 'HEARTBEAT is a message sent by the autopilot to communicate its presence and status to the GCS.';

    async function queryMAVLink(command?: string) {
        let response = null;
        if (command) {
            response = await fetch('/api/mavlink', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ command }),
            });
        } else {
            response = await fetch('/api/mavlink', { method: 'POST' });
        }
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Decode and process the data
                const text = decoder.decode(value, { stream: true });
                logs = [...logs, text];
                mavlinkLogStore.set(logs);

                if (text.includes('HEARTBEAT')) {
                    triggerHeartbeat(text);
                }
            }
        }
    }

    async function triggerHeartbeat(log: string) {
        const heartbeat = document.querySelector('.heartbeat');
        if (heartbeat) {
            heartbeat.classList.add('text-green-500');
            setTimeout(() => {
                heartbeat.classList.remove('text-green-500');
            }, 1000);
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
        document.body.appendChild(modal.$$.fragment);
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
        queryMAVLink();
    });
</script>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
    <div class="dashboard w-full gap-4 p-5 bg-[#121212] rounded-[30px] rounded-l-none overflow-auto h-[90vh] max-h-[90vh]">
        <div class="event-log bg-[#1c1c1e] rounded-2xl h-full flex flex-col p-4">
            <div class="flex items-center justify-between gap-4 mb-4">
                <h2 class="text-white text-xl">MAVLink Event Log</h2>
                <div class="filters flex gap-4 justify-center items-center">
                    <input type="text" class="form-input" placeholder="Search" on:input={highlightText}/>
                    <div class="form-checkbox gap-2">
                        <input type="checkbox" class="form-checkbox" name="Toggle TIMESYNC" checked={showTimeSync} on:change={(event) => handleShowMessage(event, 'TIMESYNC')}>
                        <label for="Toggle TIMESYNC" class="text-white mr-2">TIMESYNC</label>
                        <input type="checkbox" class="form-checkbox" name="Toggle PARAM_VALUE" checked={showParamValue} on:change={(event) => handleShowMessage(event, 'PARAM_VALUE')}>
                        <label for="Toggle PARAM_VALUE" class="text-white">PARAM_VALUE</label>
                    </div>
                    <button class="btn btn-primary bg-orange-300" on:click={confirmClear}>Clear</button>
                    <button class="btn btn-primary bg-green-500" on:click={downloadLogs}>Download</button>
                </div>
                <div class="text-white w-fit flex gap-2">
                    HEARTBEAT Status:
                    <div class="heartbeat text-white w-fit relative">
                        <i class="fas fa-heart"></i>
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
        padding: 0.5rem;
        border-radius: 0.25rem;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s, visibility 0.3s, transform 0.3s;
        z-index: 1;
        transform: translateY(25px);
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
    padding: 5px 10px;
    border-radius: 0.5rem;
    color: white;
    cursor: pointer;
  }

  label {
    font-size: 10pt;
  }
</style>