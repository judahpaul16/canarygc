import type { RequestHandler } from '@sveltejs/kit';
import axios from 'axios';

interface ApiResponse {
  features: unknown[];
}

export const GET: RequestHandler = async ({ url }) => {
  const apiUrl = 'https://api.altitudeangel.com/v2/mapdata/geojson';
  const apiKey = import.meta.env.VITE_ALTITUDE_ANGEL_API_KEY;

  try {
    const response = await axios.get<ApiResponse>(apiUrl, {
      params: url.searchParams,
      headers: {
        'Authorization': `X-AA-ApiKey ${apiKey}`
      }
    });

    return new Response(JSON.stringify(response.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error fetching data from Altitude Angel API:', error);
    const err = error as { message?: string; response?: { status?: number } };

    return new Response(
      JSON.stringify({
        message: err.message || 'Failed to fetch data from Altitude Angel API'
      }),
      {
        status: err.response?.status || 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
};
