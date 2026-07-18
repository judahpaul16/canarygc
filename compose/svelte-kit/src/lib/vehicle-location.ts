// One shared "Set home / start point" modal for the landing page and the
// mission planner. Home is where RTL returns; no-GPS mode also sets the
// vehicle's global origin to the same point so a craft with no GPS flies in
// local position referenced to it, with the map sharing that reference.
import { mavLocationStore } from '../stores/mavlinkStore';
import { sendMavlinkCommand } from './mavlink-client';
import { showModal, notify } from './overlays';
import { m } from '$lib/paraglide/messages';

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
		notify({ title: m.vl_home_set(), content: useCurrent ? m.vl_home_current() : m.vl_home_entered(), duration: 5000 });
	} else {
		showModal({ title: m.vl_home_fail_title(), content: m.vl_home_fail_body(), notification: true });
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
			notify({ title: m.vl_start_set(), content: m.vl_start_set_body(), duration: 5000 });
		} else if (res.status === 503) {
			notify({ title: m.vl_no_vehicle_title(), content: m.vl_no_vehicle_body(), type: 'warning' });
		} else {
			notify({ title: m.vl_start_fail_title(), content: await res.text(), type: 'warning' });
		}
	} catch {
		notify({ title: m.vl_start_fail_title(), content: m.vl_network_error(), type: 'warning' });
	}
}

export function openVehicleLocationModal(): void {
	showModal({
		title: m.vl_modal_title(),
		content: m.vl_modal_body(),
		confirmation: true,
		confirmLabel: m.vl_set_location_btn(),
		inputs: [
			{ type: 'number', placeholder: m.vl_latitude_placeholder(), required: false, label: m.vl_latitude_label() },
			{ type: 'number', placeholder: m.vl_longitude_placeholder(), required: false, label: m.vl_longitude_label() },
			{ type: 'number', placeholder: '0', required: false, label: m.vl_altitude_label() },
			{ type: 'checkbox', placeholder: m.vl_no_gps_check(), required: false }
		],
		onConfirm: async (values) => {
			const lat = parseFloat(values[0]);
			const lon = parseFloat(values[1]);
			const alt = parseFloat(values[2] || '0');
			const noGps = values[3] === 'true';
			if (noGps) {
				if (Number.isNaN(lat) || Number.isNaN(lon)) {
					notify({ title: m.vl_invalid_coords_title(), content: m.vl_invalid_coords_body(), type: 'warning' });
					return;
				}
				await setOriginAndHome(lat, lon, alt);
				return;
			}
			await setHomeOnly(lat, lon, alt);
		}
	});
}
