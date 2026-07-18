import { get } from 'svelte/store';
import { mapStore } from '../stores/mapStore';
import { missionPlanTitleStore, missionPlanActionsStore } from '../stores/missionPlanStore';
import { patternCaptureStore } from '../stores/patternStore';
import { showModal, notify } from './overlays';
import { optimizeMissionPath } from './path-planning';
import { airspaceZonesStore, obstaclesStore, safetyLimitsStore } from '../stores/safetyStore';
import { refreshAirspace, refreshHazards, refreshBuildings } from './preflight';
import { m } from '$lib/paraglide/messages';

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
			title: m.pa_path_clear_title(),
			content: m.pa_path_clear_body(),
			duration: FEEDBACK_MS
		});
		return;
	}
	missionPlanActionsStore.set(result.actions);
	const parts: string[] = [];
	if (result.clearedLegs > 0) {
		parts.push(m.pa_added_waypoints({ count: result.addedWaypoints, hazards: result.clearedLegs }));
	}
	if (result.raisedWaypoints > 0) {
		parts.push(m.pa_raised_waypoints({ count: result.raisedWaypoints }));
	}
	if (result.movedWaypoints > 0) {
		parts.push(m.pa_moved_waypoints({ count: result.movedWaypoints }));
	}
	notify({
		title: m.pa_adjusted_title(),
		content: `${parts.join(' ')} ${m.pa_review_footer()}`,
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
			title: m.pa_survey_title(),
			content: m.pa_survey_body(),
			type: 'info',
			persistent: true
		})
	);
}

export function startOrbitCapture(): void {
	patternCaptureStore.set({ kind: 'orbit', corners: [] });
	holdInstruction(
		notify({
			title: m.pa_orbit_title(),
			content: m.pa_orbit_body(),
			type: 'info',
			persistent: true
		})
	);
}

export function startCorridorCapture(): void {
	patternCaptureStore.set({ kind: 'corridor', corners: [] });
	holdInstruction(
		notify({
			title: m.pa_corridor_title(),
			content: m.pa_corridor_body(),
			type: 'info',
			persistent: true
		})
	);
}

export function startSarCapture(): void {
	patternCaptureStore.set({ kind: 'sar', corners: [] });
	holdInstruction(
		notify({
			title: m.pa_sar_title(),
			content: m.pa_sar_body(),
			type: 'info',
			persistent: true
		})
	);
}

export function startStructureScanCapture(): void {
	patternCaptureStore.set({ kind: 'structure', corners: [] });
	holdInstruction(
		notify({
			title: m.pa_structure_title(),
			content: m.pa_structure_body(),
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
		title: m.pa_clear_title(),
		content: m.pa_clear_body(),
		confirmation: true,
		inputs: [
			{
				type: 'checkbox',
				placeholder: m.pa_clear_on_fc(),
				required: false
			}
		],
		onConfirm: (values) => {
			removeAllActions(values[0] === 'true');
		}
	});
}
