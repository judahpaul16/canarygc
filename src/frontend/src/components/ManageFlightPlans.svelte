<script lang="ts">
  import PocketBase from "pocketbase";
  import { flightPlanTitleStore, flightPlanActionsStore, type FlightPlanAction } from "../stores/flightPlanStore";

  const pb = new PocketBase("http://localhost:8090");

  export let title: string = "Manage Flight Plans";
  export let isModal = false;
  export let isOpen: boolean = true;
  let flightPlans: Array<{ id: string; title: string }> = [];
  let actions: any = {};
  export let onCancel: () => void = () => {};

  async function getFlightPlans() {
    try {
      const records = await pb.collection("flight_plans").getFullList();
      flightPlans = records.map((record) => ({
        id: record.id,
        title: record.title,
      }));
    } catch (error) {
      console.error("Error fetching flight plans:", error);
    }
  }

  async function loadPlan(plan: any) {
    actions = await pb.collection("flight_plans").getFirstListItem(`id = "${plan.id}"`);
    flightPlanActionsStore.set(actions.actions);
    flightPlanTitleStore.set(plan.title);
  }

  function handleSave(title: string, plan: FlightPlanAction) {
    flightPlanTitleStore.set(title);
    flightPlanActionsStore.set(plan);
    let flightPlan = {
      title: title,
      actions: plan,
    };
    pb.collection("flight_plans").create(flightPlan).then(() => getFlightPlans());
  }

  async function handleDelete(id: string) {
    try {
      await pb.collection("flight_plans").delete(id);
      flightPlans = flightPlans.filter((plan) => plan.id !== id);
    } catch (error) {
      console.error("Error deleting flight plan:", error);
    }
  }

  async function importPlan() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const data = e.target?.result;
          const plan = JSON.parse(data as string);
          const title = file.name.replace(".json", "").replace(/_/g, " ");
          await handleSave(title, plan);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }

  $: if (isOpen) {
    getFlightPlans();
  }

  const closeModal = () => {
    isOpen = false;
    onCancel();
  };
</script>

{#if isOpen && isModal}
  <div class="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50 p-8">
    <div class="bg-[#1e1e1e] rounded-lg shadow-lg max-w-lg w-full">
      <div class="relative border-b border-[#2d2d2d]">
        <div class="p-4 text-lg font-semibold text-white">
          {title}
        </div>
        <button
          on:click={closeModal}
          class="absolute top-2 right-2 text-gray-400 hover:text-white text-2xl"
        >
          &times;
        </button>
      </div>
      <div class="px-4 py-2 text-white max-h-[40vh] overflow-auto">
        <ul class="overflow-auto">
          {#if flightPlans.length != 0}
            {#each flightPlans as plan (plan.id)}
              <li class="flex justify-between items-center px-2 py-1 bg-gray-700 rounded mb-2">
                <span>{plan.title}</span>
                <div class="flex items-center gap-2">
                  <button
                    on:click={() => handleDelete(plan.id)}
                    class="text-red-500 hover:text-red-700">Delete</button
                  >
                  <button
                    on:click={() => loadPlan(plan)}
                    class="text-blue-500 hover:text-blue-700">Load</button
                  >
                </div>
              </li>
            {/each}
          {:else}
            <li class="px-2 py-1 bg-gray-700 rounded mb-2">
              <span>No flight plans found.</span>
            </li>
          {/if}
        </ul>
      </div>
      <div class="flex justify-center px-4 py-2 border-t border-[#2d2d2d]">
        <button
            on:click={importPlan}
            class="bg-transparent hover:bg-[#4b5563] text-white px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
          <i class="fas fa-upload mr-1"></i>
          Import Flight Plan
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="bg-[#1c1c1e] rounded-lg w-full h-full overflow-auto relative">
    <div class="relative border-b border-[#2d2d2d]">
      <div class="title-container p-4 pb-2 font-semibold text-white">
        {title}
      </div>
    </div>
    <div class="plans p-2 text-white h-full max-h-[63%] mb-2">
      <ul class="overflow-auto h-full p-2 text-sm">
        {#if flightPlans.length != 0}
          {#each flightPlans as plan (plan.id)}
            <li class="inline-block justify-between items-center px-2 py-1 bg-gray-700 rounded mb-2 w-full">
              <span class="mr-2" title={plan.title}>{plan.title.substring(0, 15)}{#if plan.title.length >= 12}...{/if}</span>
              <div class="flex items-center gap-3 float-right">
                <button
                  on:click={() => handleDelete(plan.id)}
                  class="text-red-500 hover:text-red-700 relative">
                    <i class="fas fa-trash-alt text-sm"></i>
                    <div class="tooltip">Delete</div>
                  </button
                >
                <button
                  on:click={() => loadPlan(plan)}
                  class="text-blue-500 hover:text-blue-700 relative">
                    <i class="fas fa-upload text-sm"></i>
                    <div class="tooltip">Load</div>
                  </button
                >
              </div>
            </li>
          {/each}
        {:else}
          <li class="px-2 py-1 bg-gray-700 rounded mb-2">
            <span>No flight plans found.</span>
          </li>
        {/if}
      </ul>
    </div>
    <div class="flex justify-center px-4 pt-1 border-t border-[#2d2d2d]">
      <button
          on:click={importPlan}
          class="bg-transparent hover:bg-[#4b5563] text-white px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
        <i class="fas fa-upload text-xs" title="Import Flight Plan"></i>
        <span class="import-btn-span text-xs ml-1">Import</span>
      </button>
    </div>
  </div>
{/if}

<style>
  button {
    font-size: 1rem;
    line-height: 1.5;
    border: none;
    cursor: pointer;
    transition:
      background-color 0.3s,
      color 0.3s;
  }

  .tooltip {
    position: absolute;
    top: 0;
    left: -290%;
    margin-bottom: 0.5rem;
    background-color: black;
    color: white;
    padding: 0.5rem;
    border-radius: 0.25rem;
    white-space: nowrap;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s, visibility 0.3s, transform 0.3s;
    z-index: 1;
  }

  button:hover .tooltip {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(-0.5rem);
  }

  .title-container {
    font-size: calc(0.5rem + 0.5vw);
  }
  .plans + div {
    padding-block: 1rem;
  }

  /* Mobile Styles */
  @media (max-width: 990px) {
    .plans {
      max-height: 33vh;
    }
    .plans + div {
      padding-block: 0.5rem;
    }
    .title-container {
      font-size: 1rem;
    }
  }
</style>
