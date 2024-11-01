<script lang="ts">
  import { primaryColorStore, secondaryColorStore } from '../../stores/customizationStore';
  let primaryColor = $derived($primaryColorStore);
  let secondaryColor = $derived($secondaryColorStore);
</script>

<div class="dashboard-container h-full flex items-center justify-center min-h-[95vh] p-0">
    <div class="dashboard w-full grid grid-cols-12 grid-rows-6 gap-4 p-5 rounded-[30px] rounded-l-none overflow-auto h-[90vh] max-h-[90vh]"
        style="--secondaryColor: {secondaryColor}"
    >
        <div class="user-settings col-span-12 row-span-6 rounded-2xl h-full" style="--primaryColor: {primaryColor}">
            <!-- <UserSettings /> -->
        </div>
    </div>
</div>

<style>
    .dashboard {
      background-color: var(--secondaryColor);
    }
  
    .user-settings {
        background: var(--primaryColor);
    }
</style>