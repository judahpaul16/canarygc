import { get } from 'svelte/store';
import { mapStore } from '../stores/mapStore';
import { missionPlanTitleStore, missionPlanActionsStore } from '../stores/missionPlanStore';
import { patternCaptureStore } from '../stores/patternStore';
import { showModal, notify } from './overlays';
import { optimizeMissionPath } from './path-planning';
import { airspaceZonesStore, obstaclesStore, safetyLimitsStore } from '../stores/safetyStore';
import { refreshAirspace, refreshHazards, refreshBuildings } from './preflight';

const FEEDBACK_MS = 3000;

export async function optimizePath(): Promise<void> {
	const actions = get(missionPlanActionsStore);
	// Pull current hazards, buildings, and airspace for the mission area so
	// avoidance has data even if the overlays were never opened.
	const [, , buildings] = await Promise.all([
		refreshAirspace(actions),
		refreshHazards(actions),
		refreshBuildings(actions)
	]);
	const limits = get(safetyLimitsStore);
	const result = optimizeMissionPath(
		actions,
		get(airspaceZonesStore),
		get(obstaclesStore),
		buildings,
		limits.maxAltitudeM
	);
	if (!result.changed) {
		notify({
			title: 'Path already clear',
			content: 'No leg crosses restricted airspace, an obstacle, or a building at its altitude.',
			duration: FEEDBACK_MS
		});
		return;
	}
	missionPlanActionsStore.set(result.actions);
	const n = (count: number) => (count > 1 ? 's' : '');
	const parts: string[] = [];
	if (result.clearedLegs > 0) {
		parts.push(`added ${result.addedWaypoints} waypoint${n(result.addedWaypoints)} to route around ${result.clearedLegs} hazard${n(result.clearedLegs)}`);
	}
	if (result.raisedWaypoints > 0) {
		parts.push(`raised ${result.raisedWaypoints} waypoint${n(result.raisedWaypoints)} to clear obstacles or buildings`);
	}
	if (result.movedWaypoints > 0) {
		parts.push(`moved ${result.movedWaypoints} waypoint${n(result.movedWaypoints)} clear of restricted airspace`);
	}
	notify({
		title: 'Path adjusted for hazards',
		content: `Path ${parts.join(', ')}. Review the plan before flying.`,
		duration: FEEDBACK_MS * 2
	});
}

// Holds the active-instruction toast open until the pattern capture ends
// (finished or canceled), then dismisses it and stops watching the store.
function holdInstruction(close: () => void): void {
	const unsubscribe = patternCaptureStore.subscribe((capture) => {
		if (capture) return;
		close();
		// Defer so the subscribe callback returns before it detaches itself.
		queueMicrotask(unsubscribe);
	});
}

export function startSurveyCapture(): void {
	patternCaptureStore.set({ kind: 'survey', corners: [] });
	holdInstruction(
		notify({
			title: 'Survey pattern',
			content: 'Click the survey area corners on the map, then double-click to finish. Escape cancels.',
			type: 'info',
			persistent: true
		})
	);
}

export function startOrbitCapture(): void {
	patternCaptureStore.set({ kind: 'orbit', corners: [] });
	holdInstruction(
		notify({
			title: 'Orbit pattern',
			content: 'Click the orbit center on the map. Escape cancels.',
			type: 'info',
			persistent: true
		})
	);
}

async function removeAllActions(clearLoadedPlan: boolean): Promise<void> {
	document.querySelectorAll('.action-container').forEach((el) => {
		el.remove();
	});

	document.querySelectorAll('#flight-plan-title').forEach((el) => {
		(el as HTMLInputElement).value = '';
	});

	mapStore.set(get(mapStore));
	missionPlanTitleStore.set('');
	missionPlanActionsStore.set({});

	if (clearLoadedPlan) {
		try {
			const response = await fetch('/api/mavlink/clear_mission', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				}
			});
			if (response.ok) {
				console.log(await response.text());
			} else {
				console.error(`Error: ${await response.text()}`);
			}
		} catch (error) {
			console.error('Error:', error);
		}
	}
}

export function confirmClear(): void {
	showModal({
		title: 'Clear Mission Plan',
		content: 'Are you sure you want to clear the current mission plan? This action will remove all actions from the map. Check the box to also clear the mission plan on the flight controller.',
		confirmation: true,
		inputs: [
			{
				type: 'checkbox',
				placeholder: 'Clear on Flight Controller',
				required: false
			}
		],
		onConfirm: (values) => {
			removeAllActions(values[0] === 'true');
		}
	});
}
