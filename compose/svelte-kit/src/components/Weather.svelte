<script lang="ts">
  import { onMount } from 'svelte';
  import weatherCodes from '../lib/weathercodes.json';
  import { mavLocationStore } from '../stores/mavlinkStore';
  import { m } from '$lib/paraglide/messages';

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

  // The weathercodes.json descriptions are English data; map each to its
  // translated message so the summary follows the selected locale.
  const WEATHER_DESC: Record<string, () => string> = {
    'Clear': m.weather_desc_clear,
    'Mainly Clear': m.weather_desc_mainly_clear,
    'Sunny': m.weather_desc_sunny,
    'Mainly Sunny': m.weather_desc_mainly_sunny,
    'Partly Cloudy': m.weather_desc_partly_cloudy,
    'Cloudy': m.weather_desc_cloudy,
    'Foggy': m.weather_desc_foggy,
    'Rime Fog': m.weather_desc_rime_fog,
    'Light Drizzle': m.weather_desc_light_drizzle,
    'Drizzle': m.weather_desc_drizzle,
    'Heavy Drizzle': m.weather_desc_heavy_drizzle,
    'Light Freezing Drizzle': m.weather_desc_light_freezing_drizzle,
    'Freezing Drizzle': m.weather_desc_freezing_drizzle,
    'Light Rain': m.weather_desc_light_rain,
    'Rain': m.weather_desc_rain,
    'Heavy Rain': m.weather_desc_heavy_rain,
    'Light Freezing Rain': m.weather_desc_light_freezing_rain,
    'Freezing Rain': m.weather_desc_freezing_rain,
    'Light Showers': m.weather_desc_light_showers,
    'Showers': m.weather_desc_showers,
    'Heavy Showers': m.weather_desc_heavy_showers,
    'Light Snow': m.weather_desc_light_snow,
    'Snow': m.weather_desc_snow,
    'Heavy Snow': m.weather_desc_heavy_snow,
    'Snow Grains': m.weather_desc_snow_grains,
    'Light Snow Showers': m.weather_desc_light_snow_showers,
    'Snow Showers': m.weather_desc_snow_showers,
    'Thunderstorm': m.weather_desc_thunderstorm,
    'Thunderstorm With Hail': m.weather_desc_thunderstorm_hail,
    'Light Thunderstorms With Hail': m.weather_desc_light_thunderstorms_hail
  };
  const describeWeather = (desc: string): string => (WEATHER_DESC[desc] ?? (() => desc))();

  interface Props {
    isDashboard?: boolean;
    mavLocation: L.LatLng | { lat: number; lng: number };
  }

  let { isDashboard = false, mavLocation = $bindable() }: Props = $props();  $effect(() => {
    mavLocation = $mavLocationStore;
  });

  let temperature = $state('');
  let weatherDescription = $state('');
  let weatherImage = $state('');
  let rainChance = $state('');
  let windSpeed = $state('');
  let windDirection = $state('');
  let error = $state('');

  async function fetchWeather() {
    try {
      const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${mavLocation.lat}&longitude=${mavLocation.lng}&current_weather=true&hourly=precipitation_probability&wind_speed_unit=ms`);
      const weatherData = await weatherResponse.json();

      if (weatherResponse.ok) {
        const { temperature: temp, weathercode } = weatherData.current_weather;
        const isDaytime = new Date().getHours() >= 6 && new Date().getHours() < 18;
        const weatherCode = weatherCodesTyped[weathercode];

        if (weatherCode) {
          weatherDescription = describeWeather(isDaytime ? weatherCode.day.description : weatherCode.night.description);
          weatherImage = isDaytime ? weatherCode.day.image : weatherCode.night.image;
        } else {
          weatherDescription = m.weather_unknown();
          weatherImage = '';
        }

        temperature = `${temp}°C / ${(temp * 1.8 + 32).toFixed(1)}°F`;

        const rainData = weatherData.hourly.precipitation_probability;
        if (rainData && rainData.length > 0) {
          rainChance = `${rainData[0]}%`;
        } else {
          rainChance = 'N/A';
        }
        windSpeed = weatherData.current_weather.windspeed;
        windDirection = weatherData.current_weather.winddirection;
        if (parseFloat(windDirection.toString()) > 337.5 || parseFloat(windDirection.toString()) < 22.5) {
          windDirection += '° N';
        } else if (parseFloat(windDirection.toString()) > 22.5 && parseFloat(windDirection.toString()) < 67.5) {
          windDirection += '° NE';
        } else if (parseFloat(windDirection.toString()) > 67.5 && parseFloat(windDirection.toString()) < 112.5) {
          windDirection += '° E';
        } else if (parseFloat(windDirection.toString()) > 112.5 && parseFloat(windDirection.toString()) < 157.5) {
          windDirection += '° SE';
        } else if (parseFloat(windDirection.toString()) > 157.5 && parseFloat(windDirection.toString()) < 202.5) {
          windDirection += '° S';
        } else if (parseFloat(windDirection.toString()) > 202.5 && parseFloat(windDirection.toString()) < 247.5) {
          windDirection += '° SW';
        } else if (parseFloat(windDirection.toString()) > 247.5 && parseFloat(windDirection.toString()) < 292.5) {
          windDirection += '° W';
        } else if (parseFloat(windDirection.toString()) > 292.5 && parseFloat(windDirection.toString()) < 337.5) {
          windDirection += '° NW';
        }
      } else {
        error = weatherData.reason || m.weather_fetch_error();
      }
    } catch (err) {
      error = (err as Error).message || m.weather_fetch_error();
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

{#if isDashboard}
  <div class="weather min-w-[max-content] h-full max-h-[190px] overflow-y-visible text-center transform -translate-y-[10px]">
    {#if error}
      <div class="error">{error}</div>
    {:else}
      <div class="weather-detail wind">{m.weather_wind_speed({ speed: windSpeed })}</div>
      <div class="weather-detail wind">{m.weather_wind_direction({ direction: windDirection })}</div>
      <img src={weatherImage} alt={weatherDescription} class="weather-icon" />
      <div class="weather-summary">{weatherDescription}</div>
      <div class="weather-detail rain">{m.weather_rain_chance({ chance: rainChance })}</div>
      <div class="weather-detail temp">{m.weather_temp({ temp: temperature })}</div>
    {/if}
  </div>
{:else}
  <div
    class="weather rounded-2xl h-full overflow-y-auto p-4"
  >
  <div class="weather-header">{m.weather_advisory()}</div>
    {#if error}
      <div class="error">{error}</div>
    {:else}
      <div class="weather-detail wind">{m.weather_wind_speed({ speed: windSpeed })}</div>
      <div class="weather-detail wind">{m.weather_wind_direction({ direction: windDirection })}</div>
      <div class="weather-summary">{weatherDescription}</div>
      <div class="weather-detail rain">{m.weather_rain_chance({ chance: rainChance })}</div>
      <div class="weather-detail temp">{m.weather_temp({ temp: temperature })}</div>
    {/if}
    <div class="location-badge"><i class="fas fa-location-dot"></i> {m.weather_based_on()}</div>
  </div>
{/if}

<style>
  .weather {
    color: var(--fontColor);
    background-color: var(--primaryColor);
    max-width: 400px;
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .weather > img {
    filter: brightness(0.95);
  }

  .weather-header {
    font-size: 13pt;
    margin-bottom: 0.5rem;
    font-weight: bold;
  }

  .location-badge {
    margin-top: 0.6rem;
    align-self: center;
    width: fit-content;
    font-size: 0.7rem;
    color: #838383;
    border: 1px solid var(--tertiaryColor);
    border-radius: 9999px;
    padding: 0.15rem 0.6rem;
  }

  .weather-summary {
    font-size: 0.85rem;
  }

  .weather-detail {
    font-size: 0.85rem;
  }

  .error {
    color: red;
    font-size: 1.25rem;
  }

  .weather-icon {
    width: 100px;
    height: 100px;
    margin-inline: auto;
  }

  .weather-detail.wind {
    color: #66e1ff;
  }
</style>