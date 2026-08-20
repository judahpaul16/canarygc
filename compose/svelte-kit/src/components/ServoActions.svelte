<script lang="ts">
  import { get } from 'svelte/store';
  import Select from './Select.svelte';
  import { mavModeStore, fcProtocolStore } from '../stores/mavlinkStore';
  import { sendMavlinkCommand, setFlightMode } from '../lib/mavlink-client';
  import { isGuidedLabel } from '../lib/flight-modes';
  import { notify } from '../lib/overlays';
  import {
    buildSteps,
    loadServoActions,
    saveServoActions,
    type ServoActionTab,
    type WinchAction
  } from '../lib/servo-actions';
  import { m } from '$lib/paraglide/messages';

  let { onClose }: { onClose: () => void } = $props();

  let advanced = $state(false);
  let tab = $state<ServoActionTab>('servo');
  let values = $state(loadServoActions());
  let sending = $state(false);

  const fcIsMsp = $derived($fcProtocolStore === 'msp');

  const TABS: { id: ServoActionTab; label: string; hint: string }[] = [
    { id: 'servo', label: m.sa_tab_servo(), hint: m.sa_hint_servo() },
    { id: 'parachute', label: m.sa_tab_parachute(), hint: m.sa_hint_parachute() },
    { id: 'gripper', label: m.sa_tab_gripper(), hint: m.sa_hint_gripper() },
    { id: 'relay', label: m.sa_tab_relay(), hint: m.sa_hint_relay() },
    { id: 'winch', label: m.sa_tab_winch(), hint: m.sa_hint_winch() }
  ];

  const WINCH_ACTIONS: { value: WinchAction; label: string }[] = [
    { value: 'deliver', label: m.sa_winch_deliver() },
    { value: 'retract', label: m.sa_winch_retract() },
    { value: 'lock', label: m.sa_winch_lock() },
    { value: 'hold', label: m.sa_winch_hold() },
    { value: 'relaxed', label: m.sa_winch_relaxed() },
    { value: 'load_line', label: m.sa_winch_load_line() },
    { value: 'abandon_line', label: m.sa_winch_abandon_line() },
    { value: 'load_payload', label: m.sa_winch_load_payload() },
    { value: 'length', label: m.sa_winch_length_action() },
    { value: 'rate', label: m.sa_winch_rate_action() }
  ];

  const activeTab = $derived(TABS.find((t) => t.id === tab) ?? TABS[0]);

  async function send(which: ServoActionTab) {
    if (sending) return;
    sending = true;
    try {
      saveServoActions(values);
      if (!isGuidedLabel(get(mavModeStore))) await setFlightMode('GUIDED');
      for (const step of buildSteps(which, values)) {
        if (step.delayMsBefore) await new Promise((resolve) => setTimeout(resolve, step.delayMsBefore));
        if (!(await sendMavlinkCommand(step.command, step.params))) {
          notify({ title: m.sa_title(), content: m.sa_send_failed(), type: 'warning', duration: 5000 });
          return;
        }
      }
      notify({ title: m.sa_title(), content: m.sa_sent_body(), duration: 3000 });
      onClose();
    } finally {
      sending = false;
    }
  }

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
  };
</script>

<svelte:window onkeydown={handleKeydown} />
<div class="elevated-surface fixed inset-0 flex items-center justify-center z-50 bg-[#00000090] p-4 backdrop-blur-xs">
  <button type="button" aria-label={m.modal_close_dialog()} class="absolute inset-0 h-full w-full cursor-default" onclick={onClose}></button>
  <div class="container relative z-10 rounded-2xl shadow-2xl w-full {advanced ? 'max-w-lg' : 'max-w-md'}" role="dialog" aria-modal="true">
    <div class="relative border-b" style="border-color: rgb(from var(--fontColor) r g b / 0.12);">
      <div class="px-5 py-3 text-lg font-semibold">
        {m.sa_title()}
      </div>
      <button onclick={onClose} aria-label={m.common_close()} class="absolute top-2.5 right-3 opacity-60 hover:opacity-100 text-2xl leading-none">
        &times;
      </button>
    </div>
    <div class="modal-body px-5 py-4 max-h-[70vh] overflow-y-auto">
      {#if fcIsMsp}
        <p class="whitespace-pre-line">{m.sa_msp_note()}</p>
      {:else}
        {#if !advanced}
          <p class="whitespace-pre-line">{m.sa_quick_confirm()}</p>
        {:else}
          <div class="tab-bar" role="tablist">
            {#each TABS as t (t.id)}
              <button
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                class="tab"
                class:active={tab === t.id}
                onclick={() => (tab = t.id)}
              >
                {t.label}
              </button>
            {/each}
          </div>
          <p class="hint">{activeTab.hint}</p>
          {#if tab === 'servo'}
            <div class="input-grid">
              <div class="field">
                <label for="sa-servo-channel">{m.sa_servo_channel()}</label>
                <input id="sa-servo-channel" type="number" min="1" max="16" class="form-input" bind:value={values.servo.channel} />
              </div>
              <div class="field">
                <label for="sa-servo-pwm">{m.sa_servo_pwm()}</label>
                <input id="sa-servo-pwm" type="number" min="800" max="2200" step="10" class="form-input" bind:value={values.servo.pwm} />
              </div>
              <div class="check-field">
                <input id="sa-servo-cycle" type="checkbox" bind:checked={values.servo.cycle} />
                <label for="sa-servo-cycle">{m.sa_servo_cycle()}</label>
              </div>
              {#if values.servo.cycle}
                <div class="field">
                  <label for="sa-servo-cycle-pwm">{m.sa_servo_cycle_pwm()}</label>
                  <input id="sa-servo-cycle-pwm" type="number" min="800" max="2200" step="10" class="form-input" bind:value={values.servo.cyclePwm} />
                </div>
                <div class="field">
                  <label for="sa-servo-cycle-delay">{m.sa_servo_cycle_delay()}</label>
                  <input id="sa-servo-cycle-delay" type="number" min="0" max="10000" step="100" class="form-input" bind:value={values.servo.cycleDelayMs} />
                </div>
              {/if}
            </div>
          {:else if tab === 'parachute'}
            <div class="input-grid">
              <div class="field field-wide">
                <label for="sa-parachute-action">{m.sa_parachute_action()}</label>
                <Select
                  id="sa-parachute-action"
                  value={values.parachute.action}
                  options={[
                    { value: 'release', label: m.sa_parachute_release() },
                    { value: 'enable', label: m.sa_parachute_enable() },
                    { value: 'disable', label: m.sa_parachute_disable() }
                  ]}
                  onchange={(v) => (values.parachute.action = v as 'release' | 'enable' | 'disable')}
                />
              </div>
            </div>
          {:else if tab === 'gripper'}
            <div class="input-grid">
              <div class="field">
                <label for="sa-gripper-instance">{m.sa_gripper_instance()}</label>
                <input id="sa-gripper-instance" type="number" min="1" max="8" class="form-input" bind:value={values.gripper.instance} />
              </div>
              <div class="field">
                <label for="sa-gripper-action">{m.sa_gripper_action()}</label>
                <Select
                  id="sa-gripper-action"
                  value={values.gripper.action}
                  options={[
                    { value: 'release', label: m.sa_gripper_release() },
                    { value: 'grab', label: m.sa_gripper_grab() }
                  ]}
                  onchange={(v) => (values.gripper.action = v as 'release' | 'grab')}
                />
              </div>
            </div>
          {:else if tab === 'relay'}
            <div class="input-grid">
              <div class="field">
                <label for="sa-relay-instance">{m.sa_relay_instance()}</label>
                <input id="sa-relay-instance" type="number" min="0" max="15" class="form-input" bind:value={values.relay.instance} />
              </div>
              <div class="field">
                <label for="sa-relay-state">{m.sa_relay_state()}</label>
                <Select
                  id="sa-relay-state"
                  value={values.relay.state}
                  options={[
                    { value: 'on', label: m.sa_relay_on() },
                    { value: 'off', label: m.sa_relay_off() }
                  ]}
                  onchange={(v) => (values.relay.state = v as 'on' | 'off')}
                />
              </div>
            </div>
          {:else if tab === 'winch'}
            <div class="input-grid">
              <div class="field">
                <label for="sa-winch-instance">{m.sa_winch_instance()}</label>
                <input id="sa-winch-instance" type="number" min="1" max="4" class="form-input" bind:value={values.winch.instance} />
              </div>
              <div class="field">
                <label for="sa-winch-action">{m.sa_winch_action()}</label>
                <Select
                  id="sa-winch-action"
                  value={values.winch.action}
                  options={WINCH_ACTIONS}
                  onchange={(v) => (values.winch.action = v as WinchAction)}
                />
              </div>
              {#if values.winch.action === 'length'}
                <div class="field">
                  <label for="sa-winch-length">{m.sa_winch_length()}</label>
                  <input id="sa-winch-length" type="number" step="0.5" class="form-input" bind:value={values.winch.lengthM} />
                </div>
              {/if}
              {#if values.winch.action === 'length' || values.winch.action === 'rate'}
                <div class="field">
                  <label for="sa-winch-rate">{m.sa_winch_rate()}</label>
                  <input id="sa-winch-rate" type="number" step="0.1" class="form-input" bind:value={values.winch.rateMs} />
                </div>
              {/if}
            </div>
          {/if}
        {/if}
        <div class="check-field mt-4">
          <input id="sa-advanced" type="checkbox" bind:checked={advanced} />
          <label for="sa-advanced">{m.sa_advanced()}</label>
        </div>
      {/if}
    </div>
    <div class="flex justify-end px-4 py-2 border-t" style="border-color: rgb(from var(--fontColor) r g b / 0.12);">
      {#if !fcIsMsp}
        {#if !advanced}
          <button type="button" disabled={sending} onclick={() => send('servo')} class="bg-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 focus:outline-hidden focus:ring-2 focus:ring-blue-400 mr-2">
            {#if sending}<i class="fas fa-spinner fa-spin"></i>{:else}{m.common_confirm()}{/if}
          </button>
        {:else}
          <button type="button" disabled={sending} onclick={() => send(tab)} class="bg-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 focus:outline-hidden focus:ring-2 focus:ring-blue-400 mr-2">
            {#if sending}<i class="fas fa-spinner fa-spin"></i>{:else}{m.sa_send()}{/if}
          </button>
        {/if}
      {/if}
      <button type="button" onclick={onClose} class="bg-gray-500 px-4 py-2 rounded-lg hover:bg-gray-600 focus:outline-hidden focus:ring-2 focus:ring-gray-400">{m.common_cancel()}</button>
    </div>
  </div>
</div>

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

  button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .tab-bar {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border-radius: 9999px;
    background-color: rgb(from var(--fontColor) r g b / 8%);
    margin-bottom: 0.6rem;
  }

  .tab {
    padding: 0.25rem 0.8rem;
    border-radius: 9999px;
    font-size: 0.9rem;
    opacity: 0.7;
  }

  .tab:hover {
    opacity: 1;
  }

  .tab.active {
    background-color: #3290e7;
    color: #fff;
    opacity: 1;
  }

  .hint {
    font-size: 0.8rem;
    opacity: 0.6;
    margin-bottom: 0.4rem;
  }

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

  .field-wide {
    grid-column: 1 / -1;
  }

  .field label {
    font-size: 0.85rem;
    opacity: 0.8;
  }

  .form-input {
    width: 100%;
    padding: 0.45rem 0.6rem;
    border-radius: 0.5rem;
    border: 1px solid rgb(from var(--fontColor) r g b / 0.2);
    background-color: rgb(from var(--fontColor) r g b / 0.06);
    color: var(--fontColor);
  }

  .check-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    grid-column: 1 / -1;
  }

  .check-field label {
    font-size: 0.9rem;
  }

  .mt-4 {
    margin-top: 1rem;
  }
</style>
