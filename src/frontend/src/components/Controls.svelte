<script>
  import Map from './Map.svelte';
  import DPad from './DPad.svelte';
  import Weather from './Weather.svelte';
</script>

<div class="controls bg-[#1c1c1e] text-white p-9 rounded-lg h-full flex space-x-4 items-center overflow-x-auto">
  <div class="map-container flex-shrink-0 h-48 w-48">
    <Map hideOverlay={true} />
  </div>
  <div class="flex w-full justify-between">
    <div class="column flex flex-col items-center align-middle space-y-4">
      <Weather isDashboard={true} />
    </div>
    <div class="separator"></div>
    <div class="column flex flex-col items-center justify-center space-y-4 text-center max-h-[16vh] min-w-[150px] overflow-auto">
      <div class="flex flex-col items-center">
        <label class="text-sm mb-1">Max Speed</label>
        <input type="number"  min="0" class="form-input" placeholder="Default: 10" />
        <span class="text-xs text-gray-400 mt-1">m/s</span>
      </div>
      <div class="flex flex-col items-center justify-center">
        <label class="text-sm mb-1">Max Altitude</label>
        <input type="number"  min="0" class="form-input" placeholder="Default: 100" />
        <span class="text-xs text-gray-400 mt-1">m</span>
      </div>
    </div>
    <div class="separator"></div>
    <div class="column flex flex-col items-center justify-center space-y-4">
      <div class="flex flex-col items-center">
        <label class="text-sm mb-1">Altitude Up</label>
        <button class="alt-button rounded-full">
          <i class="fas fa-arrow-up alt-up"></i>
        </button>
      </div>
      <div class="flex flex-col items-center justify-center">
        <label class="text-sm mb-1">Altitude Down</label>
        <button class="alt-button rounded-full">
          <i class="fas fa-arrow-down alt-down"></i>
        </button>
      </div>
    </div>
    <div class="separator"></div>
    <div class="column flex flex-col items-center justify-center space-y-4">
      <div class="flex flex-col items-center">
        <label class="text-sm mb-1">Rotate Left</label>
        <button class="rotate-button rotate-left rounded-full">⟲</button>
      </div>
      <div class="flex flex-col items-center">
        <label class="text-sm mb-1">Rotate Right</label>
        <button class="rotate-button rotate-right rounded-full">⟳</button>
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

  .form-input,
  .alt-button,
  .rotate-button {
    appearance: none;
    background-color: #374151;
    transition: background-color 0.3s ease;
  }

  input[type='number'] {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #2d2d2d;
    border-radius: 0.25rem;
    background-color: #3f3f40;
    color: white;
    font-size: 1rem;
    transition: border-color 0.3s;
  }

  .form-input {
    border: 1px solid #374151;
    padding: 0.5rem;
  }

  .form-input:focus {
    outline: none;
    border-color: #66e1ff;
  }

  .alt-button,
  .rotate-button {
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

  .alt-button:hover,
  .rotate-button:hover {
    background-color: #4f4f50;
  }

  .rotate-left:hover {
    animation: rotate-left 0.6s;
    color: #66e1ff;
  }

  .rotate-right:hover {
    animation: rotate-right 0.6s;
    color: #66e1ff;
  }

  @keyframes rotate-left {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(-360deg);
    }
  }

  @keyframes rotate-right {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .alt-button:hover .alt-up {
    transform: translateY(-0.3rem);
    color: #66e1ff;
  }

  .alt-button:hover .alt-down  {
    transform: translateY(0.3rem);
    color: #66e1ff;
  }
</style>
