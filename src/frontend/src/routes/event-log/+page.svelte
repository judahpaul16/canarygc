<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { mavlinkLogStore } from '../../stores/mavlinkStore';
    
    let logs: string[] = [];
    let logContainer: HTMLElement;

    async function fetchMAVLinkData() {
        const response = await fetch('/api/mavlink', { method: 'POST' });
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
                
                // Scroll to the bottom of the log container
                if (logContainer) {
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
            }
        }
    }

    onMount(() => {
        mavlinkLogStore.subscribe((value) => {
            logs = value;
        });
        fetchMAVLinkData();
    });
    
</script>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
    <div class="dashboard w-full gap-4 p-5 bg-[#121212] rounded-[30px] rounded-l-none overflow-auto h-[90vh] max-h-[90vh]">
        <div class="event-log bg-[#1c1c1e] rounded-2xl h-full flex flex-col p-4">
            <h2 class="text-white text-xl font-bold mb-4">Event Log</h2>
            <pre class="text-gray-300 flex flex-col" bind:this={logContainer}>
                {#each logs as log}
                    <span>{log}</span>
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
    }
</style>