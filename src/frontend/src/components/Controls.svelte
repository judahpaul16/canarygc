<script>
  import Map from './Map.svelte';
  import DPad from './DPad.svelte';
</script>

<div class="controls bg-[#1c1c1e] text-white p-4 rounded-lg h-full flex space-x-4 items-center overflow-x-auto">
  <div class="map-container flex-shrink-0 h-48 w-48">
    <Map />
  </div>
  <div class="flex w-full justify-between">
    <div class="column flex flex-col items-center align-middle space-y-4">
      <div class="flex flex-col items-center">
        <label class="text-sm mb-1">Option 1</label>
        <input type="checkbox" class="form-checkbox h-5 w-5 text-gray-600 rounded-md" />
      </div>
      <div class="flex flex-col items-center">
        <label class="text-sm mb-1">Slider 1</label>
        <input type="range" class="form-range w-20 rounded-md" min="0" max="100" />
      </div>
      <div class="flex flex-col items-center">
        <label class="text-sm mb-1">Slider 2</label>
        <input type="range" class="form-range w-20 rounded-md" min="0" max="100" />
      </div>
    </div>
    <div class="separator"></div>
    <div class="column flex flex-col items-center space-y-4">
      <div class="flex flex-col items-center">
        <label class="text-sm mb-1">Option 2</label>
        <input type="checkbox" class="form-checkbox h-5 w-5 text-gray-600 rounded-md" />
      </div>
      <div class="flex flex-col items-center">
        <label class="text-sm mb-1">Slider 3</label>
        <input type="range" class="form-range w-20 rounded-md" min="0" max="100" />
      </div>
      <div class="flex flex-col items-center">
        <label class="text-sm mb-1">Slider 4</label>
        <input type="range" class="form-range w-20 rounded-md" min="0" max="100" />
      </div>
    </div>
    <div class="separator"></div>
    <div class="column flex flex-col items-center space-y-4">
      <div class="flex flex-col items-center">
        <label class="text-sm mb-1">Altitude Up</label>
        <button class="alt-button rounded-full">↑</button>
      </div>
      <div class="flex flex-col items-center">
        <label class="text-sm mb-1">Altitude Down</label>
        <button class="alt-button rounded-full">↓</button>
      </div>
    </div>
  </div>
  <DPad />
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

  .form-checkbox,
  .form-range,
  .form-input,
  .alt-button {
    appearance: none;
    background-color: #374151;
    transition: background-color 0.3s ease;
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
    border: 1px solid #374151;
    padding: 0.5rem;
  }

  .form-input:focus {
    outline: none;
    border-color: #66e1ff;
  }

  .alt-button {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 3rem;
    height: 3rem;
    background-color: #3f3f40;
    color: white;
    font-size: 1.5rem;
    cursor: pointer;
    transition: background-color 0.3s;
    border: none;
  }

  .alt-button:hover {
    background-color: #4f4f50;
  }
</style>
