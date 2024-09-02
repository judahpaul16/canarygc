<script lang="ts">
  import PocketBase from "pocketbase";
  import { missionPlanTitleStore, missionPlanActionsStore, type MissionPlanActions } from "../stores/missionPlanStore";
  import { get } from "svelte/store";
  import Modal from "./Modal.svelte";
  import { onMount } from "svelte";
  import { darkModeStore, primaryColorStore, secondaryColorStore, tertiaryColorStore } from '../stores/customizationStore';
  import Notification from "./Notification.svelte";

  const pb = new PocketBase("http://localhost:8090");

  export let title: string = "Manage Mission Plans";
  export let isModal = false;
  export let isOpen: boolean = true;
  export let onCancel: () => void = () => {};
  let missionPlans: Array<{ id: string; title: string }> = [];
  let actions: MissionPlanActions = {};

  $: darkMode = $darkModeStore;
  $: primaryColor = $primaryColorStore;
  $: secondaryColor = darkMode ? $tertiaryColorStore : $secondaryColorStore;
  $: fontColor = darkMode ? "#ffffff" : "#000000";
  $: tertiaryColor = $tertiaryColorStore;
  $: actions = $missionPlanActionsStore;

  onMount(() => {
    getMissionPlans();
  });

  async function getMissionPlans() {
    try {
      const records = await pb.collection("mission_plans").getFullList();
      missionPlans = records.map((record) => ({
        id: record.id,
        title: record.title,
      }));
    } catch (error) {
      console.error("Error fetching mission plans:", error);
    }
  }
  
  async function loadMissionPlan(plan: any) {
    const modal = new Modal({
      target: document.body,
      props: {
        title: "Load Mission Plan",
        content: "Are you sure you want to load this mission plan? This action will overwrite the currently loaded mission plan.",
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async (p: any = plan) => {
          let response = await pb.collection("mission_plans").getFirstListItem(`id = "${p.id}"`);
          let { title, actions } = response;
          await handleLoad(title, actions);
          isOpen = false;
        },
        onCancel: () => {
          modal.$destroy();
        },
      },
    });
  }

  async function handleLoad(title: string, actions: MissionPlanActions) {
    // Clear the current mission plan
    try {
      let response = await fetch("/api/mavlink/clear_mission", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      });
      if (response.ok) {
        console.log(await response.text());
      } else {
        console.error(`Error: ${await response.text()}`);
      }
    } catch (error) {
      console.error("Error:", error);
    }

    await pb.collection("mission_plans").getFullList().then((response) => {
      if (response.length > 0) {
        response.forEach(async (item) => {
          if (item.isLoaded === 1) {
            await pb.collection("mission_plans").update(item.id, { isLoaded: 0 });
          }
        });
      }
    });

    missionPlanTitleStore.set(title);
    missionPlanActionsStore.set(actions);
    try {
        let response = await fetch("/api/mavlink/load_mission", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "actions": JSON.stringify(actions),
            },
        });
        if (response.ok) {
            console.log(await response.text());
        } else {
            console.error(`Error: ${await response.text()}`);
        }
    } catch (error) {
        console.error("Error:", error);
    }
  }

  async function handleSave(title: string, plan: MissionPlanActions) {
      await handleLoad(title, plan);

      let id = "";
      let missionExists = async () => {
          let exists = false;
          await pb.collection("mission_plans").getFirstListItem(`title = "${title}"`).catch((error) => {
              exists = false;
          }).then((response) => {
              if (response) {
                  exists = true;
                  id = response.id;
              }
          });
          return exists;
      };        
      if (await missionExists()) {
          await handleUpdate(id, title, plan);
      } else {
          let missionPlan = {
              title: title,
              actions: plan,
              isLoaded: 1,
          };
          let response = await pb.collection("mission_plans").create(missionPlan).catch((error) => {
              new Modal({
                  target: document.body,
                  props: {
                      title: "Error",
                      content: error.message,
                      isOpen: true,
                      confirmation: false,
                      notification: true,
                  },
              });
          });
          if (response) {
            let notification = new Notification({
              target: document.body,
              props: {
                  title: "Mission Plan Saved",
                  content: "The mission plan has been saved.",
                  type: "info",
              },
            });
            setTimeout(() => {
                notification.$destroy();
            }, 3000);
          }
      }
  }

  async function handleUpdate(id: string, title: string, plan: MissionPlanActions) {
    let missionPlan = {
      title: title,
      actions: plan,
      isLoaded: 1,
    };
    let response = await pb.collection("mission_plans").update(id, missionPlan).catch((error) => {
      new Modal({
        target: document.body,
        props: {
            title: "Error",
            content: error.message,
            isOpen: true,
            confirmation: false,
            notification: true,
        },
      });
    });
    if (response) {
      let notification = new Notification({
        target: document.body,
        props: {
          title: "Mission Plan Updated",
          content: "The mission plan has been updated.",
          type: "info",
        },
      });
      setTimeout(() => {
        notification.$destroy();
      }, 3000);
    }
}

  async function deleteMissionPlan(id: string) {
    const modal = new Modal({
      target: document.body,
      props: {
        title: "Delete Mission Plan",
        content: "Are you sure you want to delete this mission plan?",
        isOpen: true,
        confirmation: true,
        notification: false,
        onConfirm: async () => {
          await handleDelete(id);
          modal.$destroy();
        },
        onCancel: () => {
          modal.$destroy();
        },
      },
    });
  }

  async function handleDelete(id: string) {
    try {
      await pb.collection("mission_plans").delete(id);
      missionPlans = missionPlans.filter((plan) => plan.id !== id);
    } catch (error) {
      console.error("Error deleting mission plan:", error);
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
          await getMissionPlans();
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }

  const closeModal = () => {
    isOpen = false;
    onCancel();
  };
</script>

{#if isOpen && isModal}
  <div class="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50 p-8">
    <div
      class="container rounded-lg shadow-lg max-w-lg w-full"
      style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor}"
    >
      <div class="relative border-b">
        <div class="title-container p-4 text-lg font-semibold">
          {title}
        </div>
        <button
          on:click={closeModal}
          class="absolute top-2 right-2 text-gray-400 hover:text-white text-2xl"
        >
          &times;
        </button>
      </div>
      <div class="px-4 py-2 max-h-[40vh] overflow-auto">
        <ul class="overflow-auto">
          {#if missionPlans.length != 0}
            {#each missionPlans as plan (plan.id)}
              <li class="flex justify-between items-center px-2 py-1 rounded mb-2">
                <span>{plan.title}</span>
                <div class="flex items-center gap-2">
                  <button
                    on:click={() => deleteMissionPlan(plan.id)}
                    class="text-red-500 hover:text-red-700">Delete</button
                  >
                  <button
                    on:click={() => loadMissionPlan(plan)}
                    class="text-blue-500 hover:text-blue-700">Load</button
                  >
                </div>
              </li>
            {/each}
          {:else}
            <li class="px-2 py-1 rounded mb-2">
              <span>No mission plans found.</span>
            </li>
          {/if}
        </ul>
      </div>
      <div class="flex justify-center px-4 py-2 border-t">
        <button
            on:click={importPlan}
            class="import-btn bg-transparent hover:bg-[#4b5563] px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
          <i class="fas fa-upload mr-1"></i>
          Import Plan
        </button>
      </div>
    </div>
  </div>
{:else}
  <div
      class="container rounded-lg w-full h-full overflow-auto relative"
      style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor}"
    >
    <div class="relative border-b">
      <div class="title-container p-4 pb-2 font-semibold">
        {title}
      </div>
    </div>
    <div class="plans p-2 h-full max-h-[67%]">
      <ul class="overflow-auto h-full p-2 text-sm">
        {#if missionPlans.length != 0}
          {#each missionPlans as plan (plan.id)}
            <li class="inline-block justify-between items-center px-2 py-1 rounded mb-2 w-full text-white">
              <span class="mr-2" title={plan.title}>{plan.title.substring(0, 11)}{#if plan.title.length >= 11}...{/if}</span>
              <div class="flex items-center gap-3 float-right relative">
                <button
                  on:click={() => deleteMissionPlan(plan.id)}
                  class="text-red-400 hover:text-red-600">
                    <i class="fas fa-trash-alt text-sm"></i>
                    <div class="tooltip">Delete</div>
                  </button
                >
                <button
                  on:click={() => loadMissionPlan(plan)}
                  class="text-[#62bbff] hover:text-[#377aad]">
                    <i class="fas fa-cloud-arrow-up text-sm"></i>
                    <div class="tooltip">Load</div>
                  </button
                >
              </div>
            </li>
          {/each}
        {:else}
          <li class="px-2 py-1 rounded mb-2">
            <span>No mission plans found.</span>
          </li>
        {/if}
      </ul>
    </div>
    <div class="absolute left-0 right-0 bottom-0 flex justify-center border-t" style="--tertiaryColor: {tertiaryColor}">
      <button
          on:click={importPlan}
          class="import-btn hover:bg-[#4b5563] px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
        <i class="fas fa-upload text-xs" title="Import Mission Plan"></i>
        <span class="import-btn-span text-xs ml-1">Import</span>
      </button>
    </div>
  </div>
{/if}

<style>
  .container {
    background-color: var(--primaryColor);
  }

  .container .border-b, .border-t {
    border-color: var(--secondaryColor);
  }

  .import-btn {
    background-color: var(--secondaryColor);
    color: var(--fontColor);
  }

  .import-btn:hover {
    background-color: var(--tertiaryColor);
  }

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
    top: -35%;
    left: -110%;
    margin-bottom: 0.5rem;
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
    transform: translateX(-30%);
  }

  .title-container {
    font-size: 10pt;
    color: var(--fontColor);
  }
  .plans + div {
    padding-block: 1rem;
  }

  li {
    color: var(--fontColor);
    background-color: var(--secondaryColor);
  }

  /* Mobile Styles */
  @media (max-width: 990px) {
    .plans {
      max-height: 33vh;
      margin-bottom: 3.5em;
    }
    .plans + div {
      padding-block: 0.5rem;
    }
    .title-container {
      font-size: 1rem;
    }
  }
</style>
