<script lang="ts">
    import { mavlinkLogStore, mavStateStore, mavModelStore, fcProtocolStore } from '../../stores/mavlinkStore';
    import { showModal } from '../../lib/overlays';
    import { sendMavlinkCommand } from '../../lib/mavlink-client';
    import { commandCatalog, paramHint, parseConsoleInput } from '../../lib/mav-console';
    import { mspCommandCatalog, mspParamHint, parseMspConsoleInput, describeMspResponse } from '../../lib/msp-console';

    // A Betaflight or INAV board speaks MSP, not MAVLink, so it carries no MAVLink
    // heartbeat; the console below sends MSP commands to it instead of MAVLink
    // commands, and the log shows its MSP responses and connection events.
    let fcIsMsp = $derived($fcProtocolStore === 'msp');

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

    // High-rate state messages that carry no event value are muted; anything
    // actionable (arming, modes, commands, missions, warnings) gets a color.
    const TELEMETRY = new Set([
        'ATTITUDE', 'ATTITUDE_QUATERNION', 'GLOBAL_POSITION_INT', 'LOCAL_POSITION_NED',
        'GPS_RAW_INT', 'GPS2_RAW', 'VFR_HUD', 'SYS_STATUS', 'BATTERY_STATUS', 'TIMESYNC',
        'RAW_IMU', 'SCALED_IMU', 'SCALED_IMU2', 'SCALED_IMU3', 'SCALED_PRESSURE', 'ALTITUDE',
        'ESTIMATOR_STATUS', 'VIBRATION', 'HIGHRES_IMU', 'SERVO_OUTPUT_RAW', 'RC_CHANNELS',
        'RC_CHANNELS_RAW', 'SYSTEM_TIME', 'PING', 'ODOMETRY', 'EXTENDED_SYS_STATE',
        'ACTUATOR_OUTPUT_STATUS', 'POSITION_TARGET_GLOBAL_INT', 'NAV_CONTROLLER_OUTPUT'
    ]);

    interface ParsedLog {
        name: string;
        time: string;
        body: string;
        color: string;
        plain: boolean;
    }

    function logColor(name: string, body: string): string {
        if (name === 'STATUSTEXT') {
            const sev = Number((body.match(/"severity":\s*(\d+)/) ?? [])[1]);
            if (sev <= 3) return '#ff6b6b';
            if (sev === 4) return '#f59e0b';
            if (sev === 5) return '#fbbf24';
            return '#4ade80';
        }
        if (name.startsWith('MAVLink connection')) return name.includes('error') ? '#ff6b6b' : '#4ade80';
        if (name.startsWith('MSP_')) return body.startsWith('error') ? '#ff6b6b' : '#7dd3fc';
        if (name === 'HEARTBEAT') return '#4ade80';
        if (name.endsWith('ACK')) return '#c084fc';
        if (name.startsWith('COMMAND')) return '#a78bfa';
        if (name === 'SET_MODE') return '#22d3ee';
        if (name.startsWith('MISSION')) return '#60a5fa';
        if (name.startsWith('PARAM')) return '#c084fc';
        if (name.startsWith('HOME') || name.includes('ORIGIN')) return '#2dd4bf';
        if (TELEMETRY.has(name)) return '#8b98a5';
        return '#cbd5e1';
    }

    // Splits `NAME(magic)::timestamp::json` into fields; connection notices and
    // other bare strings render as a single colored line.
    function parseLog(line: string): ParsedLog {
        const first = line.indexOf('::');
        const second = first >= 0 ? line.indexOf('::', first + 2) : -1;
        if (first < 0 || second < 0) {
            return { name: line, time: '', body: '', color: logColor(line, ''), plain: true };
        }
        const name = line.slice(0, first).replace(/\(\d+\)$/, '');
        const time = line.slice(first + 2, second);
        const body = line.slice(second + 2);
        return { name, time, body, color: logColor(name, body), plain: false };
    }

    const ALWAYS_HIDDEN = ['HEARTBEAT', 'MISSION_CURRENT', '"command":512', 'GPS_RAW_INT'];

    let visibleLogs = $derived(
        logs
            .filter((log) => {
                if (ALWAYS_HIDDEN.some((h) => log.includes(h))) return false;
                if (log.includes('TIMESYNC') && !showTimeSync) return false;
                if (log.includes('PARAM_VALUE') && !showParamValue) return false;
                if (log.includes('GLOBAL_POSITION_INT') && !showGPSRawInt) return false;
                if (log.includes('BATTERY_STATUS') && !showSysStatus) return false;
                return true;
            })
            .map((raw) => ({ raw, parsed: parseLog(raw) }))
    );

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

    const SUGGESTION_LIMIT = 8;
    const HISTORY_LIMIT = 20;

    let consoleInput = $state('');
    let selIndex = $state(0);
    let consoleError = $state('');
    let sending = $state(false);
    let history: string[] = [];
    let historyPos = -1;

    let mavModel = $derived($mavModelStore);

    interface Suggestion { name: string; tag?: string; }

    // Suggestions apply to the command token only; params take over after it.
    // The catalog follows the connected protocol: MSP for a Betaflight or INAV
    // board, the autopilot's MAVLink command set otherwise.
    let suggestions = $derived.by<Suggestion[]>(() => {
        if (consoleInput.includes(' ')) return [];
        const raw = consoleInput.trim().toUpperCase();
        if (!raw) return [];
        if (fcIsMsp) {
            const token = raw.replace(/^MSP_?/, '');
            const bare = (name: string) => name.replace(/^MSP_/, '');
            return mspCommandCatalog()
                .filter((c) => bare(c.name).includes(token))
                .sort((a, b) => Number(bare(b.name).startsWith(token)) - Number(bare(a.name).startsWith(token)))
                .slice(0, SUGGESTION_LIMIT)
                .map((c) => ({ name: c.name, tag: c.write ? 'write' : undefined }));
        }
        const token = raw.replace(/^MAV_CMD_/, '');
        return commandCatalog(mavModel)
            .filter((c) => c.name.includes(token))
            .sort((a, b) => Number(b.name.startsWith(token)) - Number(a.name.startsWith(token)))
            .slice(0, SUGGESTION_LIMIT)
            .map((c) => ({ name: c.name, tag: c.ardu ? 'ArduPilot' : undefined }));
    });
    let hintLine = $derived.by(() => {
        const first = consoleInput.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
        if (fcIsMsp) {
            const name = first.replace(/^MSP_?/, 'MSP_');
            const known = mspCommandCatalog().some((c) => c.name === name);
            if (known) return `MSP · ${name}: ${mspParamHint(name)}`;
            return 'MSP commands · type to search, Tab completes, Enter sends';
        }
        const name = first.replace(/^MAV_CMD_/, '');
        const known = name && commandCatalog(mavModel).some((c) => c.name === name);
        if (known) return `${mavModel || 'Autopilot'} · ${name}: ${paramHint(name)}`;
        return `${mavModel || 'Autopilot'} commands · type to search, Tab completes, Enter sends`;
    });

    function completeSuggestion(name: string) {
        consoleInput = `${name} `;
        selIndex = 0;
        consoleError = '';
        document.getElementById('mav-console-input')?.focus();
    }

    function appendLog(line: string) {
        mavlinkLogStore.update((l) => [...l, line]);
    }

    function recordHistory() {
        history = [consoleInput, ...history.filter((h) => h !== consoleInput)].slice(0, HISTORY_LIMIT);
        historyPos = -1;
        consoleInput = '';
    }

    async function sendConsole() {
        if (fcIsMsp) {
            await sendMspConsole();
            return;
        }
        const parsed = parseConsoleInput(consoleInput, mavModel);
        if (!parsed.ok) {
            consoleError = parsed.error ?? 'Invalid command';
            return;
        }
        sending = true;
        const ok = await sendMavlinkCommand(parsed.name!, parsed.params!, {
            cmdLong: true,
            ardupilotMega: parsed.ardu
        });
        sending = false;
        consoleError = ok ? '' : 'Send failed; the server rejected the command';
        if (ok) recordHistory();
    }

    async function sendMspConsole() {
        const parsed = parseMspConsoleInput(consoleInput);
        if (!parsed.ok) {
            consoleError = parsed.error ?? 'Invalid command';
            return;
        }
        sending = true;
        const time = new Date().toLocaleTimeString();
        try {
            const res = await fetch('/api/msp/command', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ code: parsed.code, payload: parsed.payload, v2: parsed.v2 })
            });
            const data = await res.json();
            if (!res.ok) {
                consoleError = data.error ?? `Send failed (${res.status})`;
                appendLog(`${parsed.name}::${time}::error: ${consoleError}`);
            } else if (data.error) {
                appendLog(`${parsed.name}::${time}::flight controller returned an error frame`);
                recordHistory();
            } else {
                appendLog(`${parsed.name}::${time}::${describeMspResponse(parsed.code!, data.payload ?? [])}`);
                recordHistory();
            }
        } catch (e) {
            consoleError = (e as Error).message;
        } finally {
            sending = false;
        }
    }

    function onConsoleKeydown(e: KeyboardEvent) {
        consoleError = '';
        if (suggestions.length) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selIndex = (selIndex + 1) % suggestions.length;
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                selIndex = (selIndex - 1 + suggestions.length) % suggestions.length;
                return;
            }
            if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                completeSuggestion(suggestions[Math.min(selIndex, suggestions.length - 1)].name);
                return;
            }
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            sendConsole();
            return;
        }
        if (e.key === 'ArrowUp' && !consoleInput && history.length) {
            e.preventDefault();
            historyPos = Math.min(historyPos + 1, history.length - 1);
            consoleInput = history[historyPos];
            return;
        }
        if (e.key === 'ArrowDown' && historyPos >= 0) {
            e.preventDefault();
            historyPos -= 1;
            consoleInput = historyPos >= 0 ? history[historyPos] : '';
        }
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
            <div class="log-head flex items-center justify-between gap-4 mb-4">
                <h2 class="text-xl">{fcIsMsp ? 'Flight Controller Events' : 'MAVLink Events'}</h2>
                <div class="filters flex gap-4 justify-center items-center">
                    <input type="text" class="form-input" placeholder="Search" bind:value={searchTerm}/>
                    <!-- These toggles hide high-rate MAVLink message types. A
                         Betaflight or INAV board logs only low-rate state events,
                         so the MSP path shows none of these. -->
                    {#if !fcIsMsp}
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
                    {/if}
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
                    {#if !fcIsMsp}
                        <div class="heartbeat w-fit relative mr-5">
                            <div>
                                <i class="fas fa-heart absolute top-[0.15rem]"></i>
                                <i class="fas fa-heart absolute top-[0.15rem]"></i>
                            </div>
                            <div class="tooltip">{heartbeatInfo}</div>
                        </div>
                    {/if}
                </div>
            </div>
            {#snippet hl(text: string)}{#each segments(text) as seg, i (i)}{#if seg.hit}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}{/snippet}
            <div class="log-view" bind:this={logContainer}>
                {#each visibleLogs as item (item.raw)}
                    <div class="log-line" style="--accent: {item.parsed.color}">
                        <span class="log-name" style="color: {item.parsed.color}">{@render hl(item.parsed.name)}</span>{#if !item.parsed.plain}<span class="log-time">{item.parsed.time}</span><span class="log-body">{@render hl(item.parsed.body)}</span>{/if}
                    </div>
                {/each}
                {#if visibleLogs.length === 0}
                    <div class="log-empty">
                        {fcIsMsp
                            ? 'No events yet. Connection, arm, and GPS events from the flight controller appear here.'
                            : 'No events yet.'}
                    </div>
                {/if}
            </div>
            <div class="console">
                {#if suggestions.length}
                    <ul class="console-suggestions">
                        {#each suggestions as s, i (s.name)}
                            <li>
                                <button type="button" class:active={i === selIndex} onclick={() => completeSuggestion(s.name)}>
                                    <span>{s.name}</span>
                                    {#if s.tag}<span class="cs-tag" class:cs-write={s.tag === 'write'}>{s.tag}</span>{/if}
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
                <div class="console-row">
                    <span class="console-prompt">&gt;</span>
                    <input
                        id="mav-console-input"
                        class="console-input"
                        placeholder={fcIsMsp
                            ? 'MSP command, e.g. MSP_STATUS or MSP_RAW_GPS'
                            : 'MAV_CMD name + params, e.g. NAV_TAKEOFF 0 0 0 NaN NaN NaN 10'}
                        bind:value={consoleInput}
                        onkeydown={onConsoleKeydown}
                        spellcheck="false"
                        autocomplete="off"
                    />
                    <button class="console-send" onclick={sendConsole} disabled={sending}>Send</button>
                </div>
                <div class="console-hint" class:console-error={consoleError !== ''}>{consoleError || hintLine}</div>
            </div>
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

    .log-view {
        font-family: ui-monospace, 'SFMono-Regular', 'Menlo', 'Consolas', monospace;
        font-size: 0.8rem;
        line-height: 1.5;
        background-color: var(--secondaryColor);
        border-radius: var(--radius-control);
        padding: 0.4rem 0;
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
    }

    .console {
        position: relative;
        margin-top: 0.5rem;
        font-family: ui-monospace, 'SFMono-Regular', 'Menlo', 'Consolas', monospace;
    }

    .console-suggestions {
        position: absolute;
        bottom: 100%;
        left: 0;
        margin-bottom: 0.35rem;
        min-width: 340px;
        background-color: var(--secondaryColor);
        border: 1px solid var(--tertiaryColor);
        border-radius: var(--radius-control);
        overflow: hidden;
        z-index: 5;
    }

    .console-suggestions button {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.35rem 0.7rem;
        font-size: 0.8rem;
        color: var(--fontColor);
        text-align: left;
    }

    .console-suggestions button:hover,
    .console-suggestions button.active {
        background-color: var(--tertiaryColor);
    }

    .cs-tag {
        font-size: 0.65rem;
        color: #f5c518;
        border: 1px solid rgb(from #f5c518 r g b / 0.5);
        border-radius: 9999px;
        padding: 0 0.4rem;
    }

    /* A write command mutates the board (calibration, reboot, RC override), so
       its suggestion is tagged in a warning color. */
    .cs-write {
        color: #fca5a5;
        border-color: rgb(from #fca5a5 r g b / 0.5);
    }

    .console-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background-color: var(--secondaryColor);
        border: 1px solid var(--tertiaryColor);
        border-radius: var(--radius-control);
        padding: 0.35rem 0.6rem;
    }

    .console-prompt {
        color: #61cd89;
        font-weight: 700;
    }

    .console-input {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--fontColor);
        font-family: inherit;
        font-size: 0.8rem;
    }

    .console-input:focus {
        outline: none;
    }

    .console-send {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.25rem 0.8rem;
        border-radius: var(--radius-control);
        background-color: #4e94f7;
        color: #ffffff;
    }

    .console-send:disabled {
        opacity: 0.5;
    }

    .console-hint {
        margin-top: 0.3rem;
        font-size: 0.7rem;
        opacity: 0.6;
        color: var(--fontColor);
    }

    .console-hint.console-error {
        color: #ff6b6b;
        opacity: 1;
    }

    .log-line {
        padding: 0.05rem 0.75rem 0.05rem 0.6rem;
        border-left: 3px solid var(--accent);
        white-space: pre-wrap;
        word-break: break-word;
    }

    .log-line:hover {
        background-color: rgb(from var(--accent) r g b / 0.08);
    }

    .log-name {
        font-weight: 600;
    }

    .log-time {
        color: rgb(from var(--fontColor) r g b / 0.4);
        margin: 0 0.6rem;
    }

    .log-body {
        color: rgb(from var(--fontColor) r g b / 0.75);
    }

    .log-empty {
        padding: 1rem 0.75rem;
        color: rgb(from var(--fontColor) r g b / 0.5);
    }

    mark {
        background-color: #f5c518;
        color: #000000;
        border-radius: 3px;
        padding: 0 2px;
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

    /* The log view is the only flexible region; the header and console hold
       their size, otherwise a full log buffer crushes them to nothing. */
    .log-head,
    .console {
        flex-shrink: 0;
    }

    /* Mobile Styles */
    @media (max-width: 990px) {
        .dashboard {
            height: 100%;
            max-height: 95vh;
            border-radius: 0;
            padding: 0.7em;
        }

        .event-log {
            height: 100%;
            max-height: 88vh;
            padding: 0.75rem;
        }

        .log-head {
            flex-wrap: wrap;
            row-gap: 0.5rem;
            margin-bottom: 0.5rem;
        }

        .filters {
            width: 100%;
            flex-wrap: wrap;
            justify-content: flex-start;
            gap: 0.5rem;
        }

        .filters .form-input {
            flex: 1 1 100%;
            min-width: 0;
        }

        .form-checkbox {
            display: grid;
            grid-template-columns: auto 1fr auto 1fr;
            column-gap: 0.5rem;
            row-gap: 0.3rem;
            align-items: center;
        }

        .system-state {
            width: 100%;
        }

        .log-view {
            font-size: 0.7rem;
        }

        .console-suggestions {
            min-width: 0;
            width: 100%;
        }

        .console-input {
            min-width: 0;
        }
    }

</style>
