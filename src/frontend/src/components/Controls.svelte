<script>
  import Map from './Map.svelte';
  import DPad from './DPad.svelte';
</script>

<div class="controls bg-[#1c1c1e] text-white p-4 rounded-lg h-full flex space-x-4 items-center  overflow-x-auto">
  <div class="map-container flex-shrink-0 h-48 w-48">
    <Map />
  </div>
  <div class="flex flex-col justify-between space-y-4 w-full text-center">
    Controls...
    &nbsp;&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;&nbsp;
    Settings...
    &nbsp;&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;&nbsp;
    Buttons...
  </div>
  <DPad />
</div>

