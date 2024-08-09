<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import weatherCodes from '../lib/weathercodes.json';

  type WeatherCode = {
    day: {
      description: string;
      image: string;
    };
    night: {
      description: string;
      image: string;
    };
  };

  type WeatherCodes = {
    [key: number]: WeatherCode;
  };

  const weatherCodesTyped: WeatherCodes = weatherCodes as WeatherCodes;

  export let lat: number = 33.749;
  export let lon: number = -84.388;

  export let isDashboard: boolean = false;

  let locationName = '';
  let temperature = '';
  let weatherDescription = '';
  let weatherImage = '';
  let rainChance = '';
  let error = '';

  async function fetchWeather() {
    try {
      const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=precipitation_probability`);
      const weatherData = await weatherResponse.json();

      const geocodeResponse = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      const geocodeData = await geocodeResponse.json();

      if (weatherResponse.ok && geocodeResponse.ok) {
        const { temperature: temp, weathercode, relative_humidity } = weatherData.current_weather;
        const isDaytime = new Date().getHours() >= 6 && new Date().getHours() < 18;
        const weatherCode = weatherCodesTyped[weathercode];

        if (weatherCode) {
          weatherDescription = isDaytime ? weatherCode.day.description : weatherCode.night.description;
          weatherImage = isDaytime ? weatherCode.day.image : weatherCode.night.image;
        } else {
          weatherDescription = 'Unknown weather';
          weatherImage = '';
        }

        temperature = `${temp}°C`;

        const rainData = weatherData.hourly.precipitation_probability;
        if (rainData && rainData.length > 0) {
          rainChance = `${rainData[0]}%`;
        } else {
          rainChance = 'N/A';
        }

        locationName = geocodeData.display_name;
      } else {
        error = weatherData.reason || 'Failed to fetch weather data';
      }
    } catch (err : any) {
      error = err.message || 'Failed to fetch weather data';
    }
  }

  onMount(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, 60000); // Update every 1 minute

    return () => {
      clearInterval(interval); // Clear interval on component destroy
    };
  });
</script>

<style>
  .weather {
    background-color: #1c1c1e;
    color: white;
    border-radius: 0.5rem;
    max-width: 400px;
    text-align: center;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  .weather-header {
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
    font-weight: bold;
  }

  .location {
    font-size: 0.875rem;
    color: #ccc;
  }

  .weather-summary {
    font-size: 1rem;
  }

  .weather-detail {
    font-size: 1rem;
  }

  .error {
    color: red;
    font-size: 1.25rem;
  }

  .weather-icon {
    width: 100px;
    height: 100px;
    margin: auto;
  }
</style>

{#if !isDashboard}
  <div class="weather h-full overflow-y-auto p-4">
    <div class="weather-header">Weather Advisory</div>
    <div class="location">Based on MAV location:<br>{locationName}</div>
    {#if error}
      <div class="error">{error}</div>
    {:else}
      <img src={weatherImage} alt={weatherDescription} class="weather-icon" />
      <div class="weather-summary">{weatherDescription}</div>
      <div class="weather-detail">Temp: {temperature}</div>
      <div class="weather-detail">Rain Chance: {rainChance}</div>
    {/if}
  </div>
{:else}
  <div class="min-w-[max-content] h-full max-h-[190px] overflow-y-auto text-center transform -translate-y-[10px]">
    {#if error}
      <div class="error">{error}</div>
    {:else}
      <img src={weatherImage} alt={weatherDescription} class="weather-icon" />
      <div class="weather-summary">{weatherDescription}</div>
      <div class="weather-detail">Temp: {temperature}</div>
      <div class="weather-detail">Rain Chance: {rainChance}</div>
    {/if}
  </div>
{/if}

