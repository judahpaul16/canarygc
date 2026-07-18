<script lang="ts">
  import {
    guidanceRunningStore,
    guidanceStatusStore,
    stopGuidance,
    inavRunningStore,
    inavStatusStore,
    stopInavMission
  } from '../lib/guidance-session';
  import { m } from '$lib/paraglide/messages';

  let guidanceRunning = $derived($guidanceRunningStore);
  let guidanceStatus = $derived($guidanceStatusStore);
  let inavRunning = $derived($inavRunningStore);
  let inavStatus = $derived($inavStatusStore);
</script>

{#if guidanceRunning}
  <div class="guidance-panel">
    <div class="guidance-info">
      <strong><i class="fas fa-satellite-dish"></i> {m.gp_companion_guidance()}</strong>
      <span>
        {#if guidanceStatus}
          {guidanceStatus.phase === 'complete'
            ? m.gp_holding_final()
            : m.gp_waypoint_of({ index: guidanceStatus.index + 1, count: guidanceStatus.count })}
          {#if guidanceStatus.distanceM !== null}· {guidanceStatus.distanceM.toFixed(0)} m{/if}
        {:else}
          {m.gp_starting()}
        {/if}
      </span>
    </div>
    <button class="guidance-stop" onclick={stopGuidance}>
      <i class="fas fa-hand"></i> {m.gp_stop_release()}
    </button>
  </div>
{:else if inavRunning}
  <div class="guidance-panel">
    <div class="guidance-info">
      <strong><i class="fas fa-route"></i> {m.gp_inav_mission()}</strong>
      <span>
        {#if inavStatus}
          {inavStatus.phase === 'failsafe' ? m.gp_failsafe_returning() : m.gp_flying_onboard()}
        {:else}
          {m.gp_engaging()}
        {/if}
      </span>
    </div>
    <button class="guidance-stop" onclick={stopInavMission}>
      <i class="fas fa-hand"></i> {m.gp_stop_release()}
    </button>
  </div>
{/if}

<style>
  .guidance-panel {
    position: fixed;
    bottom: 1.25rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1200;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.1rem;
    border-radius: var(--radius-shell);
    background-color: rgb(from var(--primaryColor) r g b / 95%);
    border: 1px solid #f0673a;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
    color: var(--fontColor);
  }

  .guidance-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.85rem;
  }

  .guidance-info strong i {
    color: #f0673a;
    margin-right: 0.35rem;
  }

  .guidance-stop {
    background-color: #f0673a;
    color: #fff;
    font-weight: 700;
    padding: 0.55rem 1rem;
    border-radius: var(--radius-control);
    white-space: nowrap;
  }

  .guidance-stop:hover {
    background-color: #ff7d52;
  }
</style>
