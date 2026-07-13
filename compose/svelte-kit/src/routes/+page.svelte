<script lang="ts">
  import Modal from '../components/Modal.svelte';
  import { mavLocationStore } from '../stores/mavlinkStore';
  import { notify } from '../lib/overlays';

  let { data } = $props();
  let originModalOpen = $state(false);

  // Sets the vehicle's global origin and home to a manual start point so a
  // GPS-less aircraft can operate in local position relative to it.
  async function setStartPoint(values: string[]) {
    const lat = parseFloat(values[0]);
    const lon = parseFloat(values[1]);
    const alt = parseFloat(values[2] || '0');
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      notify({ title: 'Invalid coordinates', content: 'Enter a numeric latitude and longitude.', type: 'warning' });
      return;
    }
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
  const features = [
    {
      icon: 'fa-satellite-dish',
      title: 'Live telemetry & control',
      desc: 'Attitude, position, battery and GPS over MAVLink, with arm, disarm and flight-mode control.',
      wide: true
    },
    {
      icon: 'fa-route',
      title: 'Mission planner',
      desc: 'Plot and edit waypoints on synced 2D and 3D maps.'
    },
    {
      icon: 'fa-shield-halved',
      title: 'Airspace & pre-flight safety',
      desc: 'Restricted-airspace overlays with geofence, altitude and no-fly-zone checks before launch.'
    },
    {
      icon: 'fa-volume-high',
      title: 'Audible callouts',
      desc: 'Spoken alerts for arming, mode changes, low battery, GPS and link loss.'
    },
    {
      icon: 'fa-microchip',
      title: 'ArduPilot & PX4',
      desc: 'Both autopilot stacks, detected and encoded automatically.'
    },
    {
      icon: 'fa-video',
      title: 'On-board camera',
      desc: 'Live video from the aircraft, streamed to the browser over WebRTC.'
    },
    {
      icon: 'fa-wand-magic-sparkles',
      title: 'Smart path optimization',
      desc: 'One-click routing that shortens the flight and steers legs clear of restricted airspace.'
    },
    {
      icon: 'fa-file-import',
      title: 'Mission import',
      desc: 'Load QGroundControl .plan and Mission Planner .waypoints files straight into the planner.'
    }
  ];

  const mavlinkLinks = [
    { href: 'https://mavlink.io/en/', text: 'MAVLink' },
    { href: 'https://mavlink.io/en/messages/common.html', text: 'Common MAVLink Messages' },
    { href: 'https://ardupilot.org/copter/docs/mission-command-list.html', text: 'Copter Mission Command List' },
    {
      href: 'https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html',
      text: 'Common Mission Command Messages'
    },
    { href: 'https://ardupilot.org/copter/docs/auto-mode.html', text: 'Auto Mode' },
    {
      href: 'https://ardupilot.org/planner/docs/common-loading-firmware-onto-pixhawk.html',
      text: 'Loading Firmware onto Pixhawk'
    }
  ];

  const safetyLinks = [
    { href: 'https://dronesafetymap.com', text: 'Drone Safety Map' },
    { href: 'https://ardupilot.org/copter/docs/common-prearm-safety-checks.html', text: 'Prearm Safety Checks' },
    { href: 'https://www.faa.gov/uas', text: 'FAA Rules and Regulations for UAS' }
  ];
</script>

<svelte:head>
  <title>Canary Ground Control</title>
</svelte:head>

<div
  class="home"
>
  <div class="home-inner">
    <header class="hero glass">
      <img src="logo.png" alt="Canary Ground Control" class="logo" />
      <h1>Canary Ground Control</h1>
      <p class="tagline">Web-native ground control for autonomous flight, running on the aircraft itself.</p>

      {#if data.user}
        <p class="state-note">Signed in as <strong>{data.user.username}</strong>.</p>
        <div class="cta-row">
          <a href="/dashboard" class="cta">Open dashboard <i class="fas fa-arrow-right"></i></a>
          <button type="button" class="cta cta-ghost" onclick={() => (originModalOpen = true)}>
            <i class="fas fa-location-crosshairs"></i> Set start point
          </button>
        </div>
      {:else if data.operatorExists}
        <p class="state-note">Sign in to reach the station.</p>
        <a href="/login" class="cta">Log in <i class="fas fa-arrow-right"></i></a>
      {:else}
        <p class="firstrun-note">
          <i class="fas fa-circle-plus"></i> No operator account exists yet. Create one to get started.
        </p>
        <a href="/register" class="cta">Create operator account <i class="fas fa-arrow-right"></i></a>
      {/if}
    </header>

    <section class="grid">
      {#each features as feature (feature.title)}
        <div class="tile glass {feature.wide ? 'tile-wide' : ''}">
          <i class="fas {feature.icon}"></i>
          <h3>{feature.title}</h3>
          <p>{feature.desc}</p>
        </div>
      {/each}
    </section>

    <section class="resources glass">
      <div class="res-col mavlink">
        <h2><i class="fas fa-book"></i> MAVLink</h2>
        <ul>
          {#each mavlinkLinks as link (link.href)}
            <li><a href={link.href} target="_blank" rel="noopener noreferrer">{link.text}</a></li>
          {/each}
        </ul>
      </div>
      <div class="res-col safety">
        <h2><i class="fas fa-triangle-exclamation"></i> Safety</h2>
        <ul>
          {#each safetyLinks as link (link.href)}
            <li><a href={link.href} target="_blank" rel="noopener noreferrer">{link.text}</a></li>
          {/each}
        </ul>
      </div>
    </section>
  </div>
</div>

<Modal
  bind:isOpen={originModalOpen}
  title="Set start point (no GPS)"
  content="Fly in local position with no GPS: enter a start location and the station sets the vehicle's global origin and home to it, so local moves and the map share one reference. Use the takeoff spot; leave altitude at 0 unless you know the field elevation."
  confirmation={true}
  confirmLabel="Set origin & home"
  inputs={[
    { type: 'number', placeholder: 'e.g. 33.7911', required: true, label: 'Latitude' },
    { type: 'number', placeholder: 'e.g. -84.3713', required: true, label: 'Longitude' },
    { type: 'number', placeholder: '0', required: false, label: 'Altitude (m AMSL)' }
  ]}
  onConfirm={setStartPoint}
/>

<style>
  .home {
    width: 100%;
    min-height: 95vh;
    display: flex;
    justify-content: center;
    padding: 2rem 1rem 3rem;
    color: var(--fontColor);
    overflow-y: auto;
  }

  .home-inner {
    width: 100%;
    max-width: 1080px;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .glass {
    background-color: rgb(from var(--primaryColor) r g b / 62%);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgb(from var(--secondaryColor) r g b / 70%);
    border-radius: var(--radius-shell);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.28);
  }

  .hero {
    text-align: center;
    padding: 2.75rem 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    position: relative;
    overflow: hidden;
  }

  .hero::before {
    content: '';
    position: absolute;
    top: -45%;
    left: 50%;
    width: 460px;
    height: 460px;
    transform: translateX(-50%);
    background: radial-gradient(circle, rgba(245, 197, 24, 0.18), transparent 62%);
    pointer-events: none;
  }

  .logo {
    width: 64px;
    height: 64px;
    filter: drop-shadow(0 4px 12px rgba(245, 197, 24, 0.35));
  }

  .hero h1 {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-top: 0.25rem;
  }

  .tagline {
    max-width: 34rem;
    opacity: 0.72;
    margin-top: 0.15rem;
  }

  .state-note {
    margin-top: 0.85rem;
    opacity: 0.78;
    font-size: 0.95rem;
  }

  .firstrun-note {
    margin-top: 0.85rem;
    color: #ffcb5a;
    font-size: 0.95rem;
  }

  .cta {
    margin-top: 0.9rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: #f5c518;
    color: #1c1c1e;
    font-weight: 700;
    padding: 0.7rem 1.4rem;
    border-radius: var(--radius-control);
    text-decoration: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(245, 197, 24, 0.35);
    background: #ffd23f;
  }

  .cta-row {
    margin-top: 0.9rem;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.6rem;
  }
  .cta-row .cta {
    margin-top: 0;
  }
  .cta-ghost {
    background: transparent;
    color: #f5c518;
    border: 1px solid rgb(from #f5c518 r g b / 0.5);
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
  }
  .cta-ghost:hover {
    background: rgb(from #f5c518 r g b / 0.12);
    box-shadow: none;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.25rem;
  }

  .tile {
    padding: 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  }

  .tile-wide {
    grid-column: span 2;
  }

  .tile i {
    font-size: 1.4rem;
    color: #f5c518;
    margin-bottom: 0.3rem;
  }

  .tile h3 {
    font-size: 1.05rem;
    font-weight: 700;
  }

  .tile p {
    opacity: 0.72;
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .tile:hover {
    transform: scale(1.02);
    box-shadow: 0 14px 44px rgba(0, 0, 0, 0.34);
    border-color: rgb(from #f5c518 r g b / 45%);
  }

  .resources {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    padding: 1.5rem 1.75rem;
  }

  .res-col h2 {
    font-size: 1rem;
    font-weight: 700;
    margin-bottom: 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .mavlink h2 i {
    color: #58a6ff;
  }

  .safety h2 i {
    color: #ffcb5a;
  }

  .res-col ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .res-col a {
    color: #58a6ff;
    text-decoration: none;
    font-size: 0.9rem;
  }

  .res-col a:hover {
    text-decoration: underline;
  }

  @media (max-width: 860px) {
    .grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 560px) {
    .grid {
      grid-template-columns: 1fr;
    }

    .tile-wide {
      grid-column: span 1;
    }

    .resources {
      grid-template-columns: 1fr;
    }
  }
</style>
