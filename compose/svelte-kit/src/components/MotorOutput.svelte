<script lang="ts">
  import { mavServoOutputStore } from '../stores/mavlinkStore';

  const MIN_PWM = 1000;
  const MAX_PWM = 2000;
  const MIN_BARS = 4;

  let outputs = $derived($mavServoOutputStore);
  // Always render at least four bars, growing to the highest output that
  // carries a value, so every motor stays visible and updates live.
  let count = $derived(Math.max(MIN_BARS, outputs.reduce((n, v, i) => (v > 0 ? i + 1 : n), 0)));
  let bars = $derived(Array.from({ length: count }, (_, i) => ({ n: i + 1, pwm: outputs[i] ?? 0 })));

  function pct(pwm: number): number {
    return Math.max(0, Math.min(100, ((pwm - MIN_PWM) / (MAX_PWM - MIN_PWM)) * 100));
  }
</script>

<div class="motor-output">
  <div class="bars">
    {#each bars as o (o.n)}
      <div class="col">
        <div class="track">
          <div class="fill" style="height: {pct(o.pwm)}%"></div>
        </div>
        <div class="pwm">{o.pwm}</div>
        <div class="label">M{o.n}</div>
      </div>
    {/each}
  </div>
</div>

<style>
  .motor-output {
    width: 100%;
    height: 100%;
    min-height: 160px;
  }

  .bars {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: stretch;
    height: 100%;
  }

  .col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    flex: 1 1 40px;
    min-width: 38px;
  }

  .track {
    position: relative;
    width: 26px;
    flex: 1;
    min-height: 120px;
    background: rgb(from var(--fontColor) r g b / 0.1);
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    align-items: flex-end;
  }

  .fill {
    width: 100%;
    background: linear-gradient(to top, #3290e7, #61cd89);
    transition: height 0.15s linear;
  }

  .pwm {
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    color: var(--fontColor);
    opacity: 0.85;
  }

  .label {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--fontColor);
    opacity: 0.7;
  }
</style>
