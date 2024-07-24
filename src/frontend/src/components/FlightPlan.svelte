<script lang="ts">
  import { onMount } from 'svelte';

  let actions = [1, 2];

  function addAction() {
    actions = [...actions, actions.length + 1];
  }

  function removeAction(index : number) {
    actions = actions.filter((_, i) => i !== index);
  }
</script>

<div class="flightplan bg-[#1c1c1e] text-white p-4 rounded-lg space-x-4 items-center h-full overflow-auto">
  <div class="container block">
    <div class="column h-[10vh]">
      {#each actions as action, index}
        <div class="flex items-center">
            <div class="form-checkbox">
                <input type="checkbox" id="action-{index}" />
                <label for="action-{index}">{index}</label>
            </div>
            <div class="separator"></div>
            <div class="form-input">
                <select name="action" id="action" value="WAYPOINT">
                <option value="WAYPOINT">WAYPOINT</option>
                <option value="TAKEOFF">TAKEOFF</option>
                <option value="LAND">LAND</option>
                <option value="RETURN">RETURN</option>
                <option value="LOITER">LOITER</option>
                <option value="DROP PAYLOAD">DROP PAYLOAD</option>
                </select>
            </div>
            <div class="separator"></div>
            <div class="form-range text-center">
                <label for="speed" class="text-sm">Max Speed (m/s)</label>
                <input type="range" id="speed" name="speed" min="1" max="10" value="5" />
            </div>
            <div class="separator"></div>
            <div class="form-input text-center flex gap-2">
                <label for="altitude">Altitude</label>
                <select name="altitude" id="altitude" value="100">
                <option value="100">100</option>
                <option value="150">150</option>
                <option value="200">200</option>
                <option value="250">250</option>
                <option value="300">300</option>
                <option value="350">350</option>
                </select> ft
            </div>
            <div class="separator"></div>
            <div class="form-input">
                <input type="text" placeholder="Notes" />
            </div>
            <div class="separator"></div>
            <div class="form-input">
                <input type="checkbox" id="action-{index}-notify" />
                <label for="action-{index}-notify" class="text-sm">Notify on complete?</label>
            </div>
            <div class="separator"></div>
            <button class="bg-[#2d2d2d] text-white rounded-lg px-3 py-2 text-sm" on:click={() => removeAction(index)}>
                <i class="fas fa-trash-alt text-red-400"></i>
            </button>
        </div>
      {/each}
      <div class="flex justify-center">
        <button class="bg-[#2d2d2d] text-white rounded-lg px-4 py-2 my-4" on:click={addAction}>
          <i class="fas fa-plus"></i>&nbsp;&nbsp;Add Action
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .column {
    flex: 1;
    padding: 0 1rem;
  }

  .separator {
    width: 1px;
    background-color: #4f4f50;
    margin: 0 1rem;
  }

  .form-checkbox {
    display: flex;
    align-items: center;
  }

  .form-checkbox input {
    display: none;
  }

  .form-checkbox:checked {
    background-color: #66e1ff;
  }

  .form-range::-webkit-slider-thumb {
    appearance: none;
    background-color: #66e1ff;
    width: 1rem;
    height: 1rem;
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .form-range::-moz-range-thumb {
    appearance: none;
    background-color: #66e1ff;
    width: 1rem;
    height: 1rem;
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .form-input {
    padding: 0.5rem;
  }

  input, select {
    border: none;
    border-radius: 0.5rem;
    padding-inline: 0.5em;
    padding-block: 0.25em;
    background-color: #2d2d2d;
    color: white;
  }

  input:focus, select:focus {
    border-color: #66e1ff;
  }

  .form-input:focus {
    outline: none;
    border-color: #66e1ff;
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
    background-color: #66e1ff;
  }
</style>
