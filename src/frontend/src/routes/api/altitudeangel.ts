import type { RequestHandler } from '@sveltejs/kit';
import axios from 'axios';

interface ApiResponse {
  features: any[];
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
  } catch (error: any) {
    console.error('Error fetching data from Altitude Angel API:', error);

    return new Response(
      JSON.stringify({
        message: error.message || 'Failed to fetch data from Altitude Angel API'
      }),
      {
        status: error.response?.status || 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
};
