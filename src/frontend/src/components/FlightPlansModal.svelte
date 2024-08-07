<script lang="ts">
  import PocketBase from "pocketbase";
  import { flightPlanTitleStore, flightPlanActionsStore, type FlightPlanAction } from "../stores/flightPlanStore";

  const pb = new PocketBase("http://localhost:8090");

  export let title: string = "Manage Flight Plans";
  export let isOpen: boolean = false;
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

{#if isOpen}
  <div class="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
    <div class="bg-[#1e1e1e] rounded-lg shadow-lg max-w-lg w-full">
      <div class="relative border-b border-[#2d2d2d]">
        <div class="px-4 py-2 text-lg font-semibold text-white">
          {title}
        </div>
        <button
          on:click={closeModal}
          class="absolute top-2 right-2 text-gray-400 hover:text-white text-2xl"
        >
          &times;
        </button>
      </div>
      <div class="px-4 py-2 text-white">
        <ul>
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
        </ul>
      </div>
      <div class="flex justify-end px-4 py-2 border-t border-[#2d2d2d]">
        <button
          on:click={importPlan}
          class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          <i class="fas fa-upload mr-1"></i>
          Import Flight Plan
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  button {
    font-size: 1rem;
    line-height: 1.5;
    border: none;
    background: none;
    cursor: pointer;
    transition:
      background-color 0.3s,
      color 0.3s;
  }
</style>
