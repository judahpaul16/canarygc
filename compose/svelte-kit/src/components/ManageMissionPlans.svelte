<script lang="ts">
  import {
    missionPlanTitleStore,
    missionPlanActionsStore,
    missionCompleteStore,
    type MissionPlanActions
  } from "../stores/missionPlanStore";
  import { showModal, notify } from "../lib/overlays";
  import { setFlightMode } from "../lib/mavlink-client";
  import { readMissionFile } from "../lib/mission-import";
  import { toQgcWpl } from "../lib/mission-export";
  import { onMount } from "svelte";

  interface Props {
    title?: string;
    isModal?: boolean;
    isOpen?: boolean;
    onCancel?: () => void;
  }

  let {
    title = "Manage Mission Plans",
    isModal = false,
    isOpen = $bindable(true),
    onCancel = () => {}
  }: Props = $props();

  type Plan = { id: string; title: string; actions: MissionPlanActions; isLoaded: number };
  let missionPlans: Array<Plan> = $state([]);
  let query = $state("");
  let loadedTitle = $derived($missionPlanTitleStore);
  let filteredPlans = $derived(
    query.trim()
      ? missionPlans.filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase()))
      : missionPlans
  );

  const itemCount = (actions: MissionPlanActions) => Object.keys(actions).length;

  onMount(() => {
    getMissionPlans();
  });

  async function getMissionPlans() {
    try {
      let response = await fetch("/api/mission/list", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      });
      let records = await response.json();
      if (Object.keys(records).length > 0) {
        missionPlans = records.map((record: { id: string; title: string; actions: string; isLoaded: number }) => ({
          id: record.id,
          title: record.title,
          actions: JSON.parse(record.actions),
          isLoaded: record.isLoaded,
        }));
      }
    } catch (error) {
      console.error("Error fetching mission plans:", error);
    }
  }

  async function loadMissionPlan(plan: { title: string; actions: MissionPlanActions }) {
    showModal({
      title: "Load Mission Plan",
      content: "Are you sure you want to load this mission plan? This action will overwrite the currently loaded mission plan.",
      confirmation: true,
      onConfirm: async () => {
        await handleLoad(plan.title, plan.actions);
        isOpen = false;
      },
    });
  }

  async function handleLoad(title: string, actions: MissionPlanActions) {
    setFlightMode('GUIDED');

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

    // Unload all mission plans first
    await fetch("/api/mission/unload", {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
    });

    // Load the new mission plan
    await fetch("/api/mission/load", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "title": title,
        },
    });

    missionPlanTitleStore.set(title);
    missionPlanActionsStore.set(actions);
    missionCompleteStore.set(false);
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

      let missionExists = false;
      let response = await fetch("/api/mission/checkExists", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "title": title,
        },
      });
      let responseData = await response.json();
      console.log(responseData);
      if (responseData.length > 0) missionExists = true;

      if (missionExists) {
          await handleUpdate(title, plan);
      } else {
          let missionPlan = {
            title: title,
            actions: plan,
            isLoaded: 1,
          };
          let response = await fetch("/api/mission/save", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "title": missionPlan.title,
              "actions": JSON.stringify(missionPlan.actions),
            },
          }).catch((error) => {
            showModal({
              title: "Error",
              content: error.message,
              notification: true,
            });
          });
          if (response) {
            notify({
              title: "Mission Plan Saved",
              content: "The mission plan has been saved.",
              duration: 3000,
            });
          }
      }
  }

  async function handleUpdate(title: string, plan: MissionPlanActions) {
    let missionPlan = {
      title: title,
      actions: plan,
      isLoaded: 1,
    };
    let response = await fetch("/api/mission/update", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "title": missionPlan.title,
        "actions": JSON.stringify(missionPlan.actions),
      },
    }).catch((error) => {
      showModal({
        title: "Error",
        content: error.message,
        notification: true,
      });
    });
    if (response) {
      notify({
        title: "Mission Plan Updated",
        content: "The mission plan has been updated.",
        duration: 3000,
      });
    }
  }

  async function deleteMissionPlan(title: string) {
    showModal({
      title: "Delete Mission Plan",
      content: "Are you sure you want to delete this mission plan?",
      confirmation: true,
      onConfirm: async () => {
        await handleDelete(title);
      },
    });
  }

  async function handleDelete(title: string) {
    try {
      await fetch(`/api/mission/delete`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "title": title,
        },
      });
      missionPlans = missionPlans.filter((plan) => plan.title !== title);
    } catch (error) {
      console.error("Error deleting mission plan:", error);
    }
  }

  async function importPlan() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.plan,.waypoints,.txt,.mission,.kml,.kmz,.csv";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const { title, actions: imported } = await readMissionFile(file);
        await handleSave(title, imported);
        await getMissionPlans();
        notify({
          title: "Mission Imported",
          content: `Loaded ${Object.keys(imported).length} items from ${file.name}.`,
        });
      } catch (err) {
        showModal({
          title: "Import Failed",
          content: (err as Error).message,
          notification: true,
        });
      }
    };
    input.click();
  }

  // Exports the loaded plan as a Mission Planner ".waypoints" file the operator
  // can archive or re-import elsewhere.
  function exportPlan() {
    const name = loadedTitle || "mission";
    const blob = new Blob([toQgcWpl($missionPlanActionsStore)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}.waypoints`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify({ title: "Mission Exported", content: `Saved ${name}.waypoints.`, duration: 3000 });
  }

  const closeModal = () => {
    isOpen = false;
    onCancel();
  };
</script>

{#snippet body(scrollClass: string)}
  <div class="search">
    <i class="fas fa-magnifying-glass search-icon"></i>
    <input
      class="search-input"
      type="text"
      placeholder="Search plans"
      aria-label="Search mission plans"
      bind:value={query}
    />
    {#if query}
      <button class="search-clear" aria-label="Clear search" onclick={() => (query = "")}>&times;</button>
    {/if}
  </div>

  <ul class="plan-list {scrollClass}">
    {#if filteredPlans.length}
      {#each filteredPlans as plan (plan.id)}
        <li class="plan-row" class:loaded={plan.title === loadedTitle}>
          <div class="plan-info">
            <span class="plan-title" title={plan.title}>{plan.title}</span>
            <span class="plan-meta">
              {itemCount(plan.actions)} item{itemCount(plan.actions) === 1 ? "" : "s"}{#if plan.title === loadedTitle} <span class="loaded-tag">loaded</span>{/if}
            </span>
          </div>
          <div class="plan-actions">
            <button class="act load" aria-label="Load {plan.title}" title="Load" onclick={() => loadMissionPlan(plan)}>
              <i class="fas fa-cloud-arrow-up"></i>
            </button>
            <button class="act del" aria-label="Delete {plan.title}" title="Delete" onclick={() => deleteMissionPlan(plan.title)}>
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </li>
      {/each}
    {:else}
      <li class="empty">
        {missionPlans.length ? `No plans match “${query}”.` : "No mission plans yet."}
      </li>
    {/if}
  </ul>

  <div class="footer">
    <button class="foot-btn" onclick={importPlan}>
      <i class="fas fa-upload"></i><span>Import</span>
    </button>
    {#if loadedTitle}
      <button class="foot-btn" onclick={exportPlan}>
        <i class="fas fa-download"></i><span>Export</span>
      </button>
    {/if}
  </div>
{/snippet}

{#if isOpen && isModal}
  <div class="overlay elevated-surface fixed inset-0 flex items-center justify-center z-50 p-4">
    <div class="panel modal-panel">
      <header class="panel-head">
        <span class="head-title">{title}</span>
        {#if missionPlans.length}<span class="head-count">{missionPlans.length}</span>{/if}
        <button class="close" aria-label="Close" onclick={closeModal}>&times;</button>
      </header>
      {@render body("scroll-modal")}
    </div>
  </div>
{:else}
  <div class="panel card-panel">
    <header class="panel-head">
      <span class="head-title">{title}</span>
      {#if missionPlans.length}<span class="head-count">{missionPlans.length}</span>{/if}
    </header>
    {@render body("scroll-card")}
  </div>
{/if}

<style>
  .overlay {
    background-color: rgba(0, 0, 0, 0.55);
  }

  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background-color: var(--primaryColor);
    color: var(--fontColor);
    border-radius: var(--radius-surface, 1rem);
  }

  .card-panel {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .modal-panel {
    width: 100%;
    max-width: 32rem;
    max-height: 80vh;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  }

  .panel-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0.85rem;
    border-bottom: 1px solid var(--secondaryColor);
  }

  .head-title {
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .head-count {
    font-size: 0.65rem;
    font-weight: 600;
    line-height: 1;
    padding: 0.15rem 0.4rem;
    border-radius: 999px;
    color: var(--fontColor);
    background-color: var(--secondaryColor);
  }

  .close {
    margin-left: auto;
    font-size: 1.4rem;
    line-height: 1;
    color: #9ca3af;
    background: none;
    border: none;
    cursor: pointer;
  }
  .close:hover {
    color: #fff;
  }

  /* Search */
  .search {
    position: relative;
    padding: 0.6rem 0.85rem 0.4rem;
  }
  .search-icon {
    position: absolute;
    left: 1.35rem;
    top: 50%;
    transform: translateY(-40%);
    font-size: 0.7rem;
    color: #8b95a5;
    pointer-events: none;
  }
  .search-input {
    width: 100%;
    padding: 0.35rem 1.6rem 0.35rem 1.75rem;
    font-size: 0.75rem;
    color: var(--fontColor);
    background-color: var(--secondaryColor);
    border: 1px solid var(--tertiaryColor);
    border-radius: 0.55rem;
    outline: none;
    transition: border-color 0.2s;
  }
  .search-input::placeholder {
    color: #8b95a5;
  }
  .search-input:focus {
    border-color: #4e94f7;
  }
  .search-clear {
    position: absolute;
    right: 1.15rem;
    top: 50%;
    transform: translateY(-40%);
    font-size: 1rem;
    line-height: 1;
    color: #8b95a5;
    background: none;
    border: none;
    cursor: pointer;
  }
  .search-clear:hover {
    color: var(--fontColor);
  }

  /* List */
  .plan-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 0.15rem 0.6rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .scroll-modal {
    max-height: 55vh;
  }

  .plan-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.55rem;
    border-radius: 0.55rem;
    border-left: 2px solid transparent;
    background-color: var(--secondaryColor);
    transition: background-color 0.15s, border-color 0.15s;
  }
  .plan-row:hover {
    background-color: var(--tertiaryColor);
  }
  .plan-row.loaded {
    border-left-color: #62bbff;
    background-color: color-mix(in srgb, #62bbff 12%, var(--secondaryColor));
  }

  .plan-info {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
    min-width: 0;
    flex: 1;
  }
  .plan-title {
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--fontColor);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .plan-meta {
    font-size: 0.62rem;
    color: #93a0b4;
    white-space: nowrap;
  }
  .loaded-tag {
    color: #62bbff;
    font-weight: 600;
    margin-left: 0.35rem;
  }

  .plan-actions {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex-shrink: 0;
  }
  .act {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.85rem;
    height: 1.85rem;
    font-size: 0.8rem;
    border: none;
    border-radius: 0.45rem;
    background: transparent;
    color: #93a0b4;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
  }
  .act.load:hover {
    color: #62bbff;
    background-color: rgba(98, 187, 255, 0.12);
  }
  .act.del:hover {
    color: #f87171;
    background-color: rgba(248, 113, 113, 0.12);
  }
  .empty {
    padding: 1.1rem 0.5rem;
    text-align: center;
    font-size: 0.72rem;
    color: #8b95a5;
  }

  /* Footer */
  .footer {
    display: flex;
    gap: 0.4rem;
    padding: 0.5rem 0.85rem;
    border-top: 1px solid var(--secondaryColor);
  }
  .foot-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.4rem 0.5rem;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--fontColor);
    background-color: var(--secondaryColor);
    border: 1px solid var(--tertiaryColor);
    border-radius: 0.55rem;
    cursor: pointer;
    transition: background-color 0.2s, color 0.2s;
  }
  .foot-btn:hover {
    color: #fff;
    background-color: #4e94f7;
    border-color: #4e94f7;
  }

  /* Mobile: the card hugs its content, so the list gets a capped auto height
     and the touch targets stay comfortable. */
  @media (max-width: 990px) {
    .card-panel {
      height: auto;
    }
    .scroll-card {
      max-height: 40vh;
    }
    .head-title {
      font-size: 0.95rem;
    }
    .plan-title {
      font-size: 0.85rem;
    }
    .plan-meta {
      font-size: 0.68rem;
    }
    .act {
      width: 2.1rem;
      height: 2.1rem;
    }
    .foot-btn {
      padding: 0.55rem 0.5rem;
      font-size: 0.8rem;
    }
  }
</style>
