// One shared "Set home / start point" modal for the landing page and the
// mission planner. Home is where RTL returns; no-GPS mode also sets the
// vehicle's global origin to the same point so a craft with no GPS flies in
// local position referenced to it, with the map sharing that reference.
import { mavLocationStore } from '../stores/mavlinkStore';
import { sendMavlinkCommand } from './mavlink-client';
import { showModal, notify } from './overlays';

const DEGREES_TO_E7 = 1e7;

async function setHomeOnly(lat: number, lon: number, alt: number): Promise<void> {
	let latE7 = Number((lat * DEGREES_TO_E7).toFixed(0));
	let lonE7 = Number((lon * DEGREES_TO_E7).toFixed(0));
	let altM = Number(alt.toFixed(0));
	let useCurrent = 0;
	if (isNaN(latE7) || isNaN(lonE7) || isNaN(altM)) {
		useCurrent = 1;
		latE7 = 0;
		lonE7 = 0;
		altM = 0;
	}
	const ok = await sendMavlinkCommand('DO_SET_HOME', [useCurrent, 0, 0, 0, latE7, lonE7, altM]);
	if (ok) {
		notify({ title: 'Home set', content: useCurrent ? 'Home set to the current position.' : 'Home set to the entered point.', duration: 5000 });
	} else {
		showModal({ title: 'Could not set home', content: 'The vehicle rejected the home location.', notification: true });
	}
}

async function setOriginAndHome(lat: number, lon: number, alt: number): Promise<void> {
	try {
		const res = await fetch('/api/mavlink/set_origin', {
			method: 'POST',
			headers: { lat: String(lat), lon: String(lon), alt: String(Number.isNaN(alt) ? 0 : alt) }
		});
		if (res.ok) {
			mavLocationStore.set({ lat, lng: lon });
			notify({ title: 'Start point set', content: 'Origin and home set on the vehicle; local moves now reference this point.', duration: 5000 });
		} else if (res.status === 503) {
			notify({ title: 'No vehicle connected', content: 'Connect the autopilot, then set the start point.', type: 'warning' });
		} else {
			notify({ title: 'Could not set the start point', content: await res.text(), type: 'warning' });
		}
	} catch {
		notify({ title: 'Could not set the start point', content: 'Network error reaching the vehicle.', type: 'warning' });
	}
}

export function openVehicleLocationModal(): void {
	showModal({
		title: 'Set home / start point',
		content:
			'Home is where the vehicle returns in RTL; leave latitude and longitude blank to use the current position. No-GPS mode also sets the global origin to this point so a vehicle with no GPS flies in local position referenced to it. Use the takeoff spot; leave altitude at 0 unless you know the field elevation.',
		confirmation: true,
		confirmLabel: 'Set location',
		inputs: [
			{ type: 'number', placeholder: 'e.g. 33.7911', required: false, label: 'Latitude' },
			{ type: 'number', placeholder: 'e.g. -84.3713', required: false, label: 'Longitude' },
			{ type: 'number', placeholder: '0', required: false, label: 'Altitude (m AMSL)' },
			{ type: 'checkbox', placeholder: 'No-GPS mode: also set the global origin for local flying', required: false }
		],
		onConfirm: async (values) => {
			const lat = parseFloat(values[0]);
			const lon = parseFloat(values[1]);
			const alt = parseFloat(values[2] || '0');
			const noGps = values[3] === 'true';
			if (noGps) {
				if (Number.isNaN(lat) || Number.isNaN(lon)) {
					notify({ title: 'Invalid coordinates', content: 'No-GPS mode needs a numeric latitude and longitude for the origin.', type: 'warning' });
					return;
				}
				await setOriginAndHome(lat, lon, alt);
				return;
			}
			await setHomeOnly(lat, lon, alt);
		}
	});
}
