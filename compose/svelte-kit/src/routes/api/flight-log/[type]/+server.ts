import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { appendFlightLog, listFlightLogs, readFlightLog, deleteFlightLog } from '$lib/server/flight-log';

export const GET: RequestHandler = async ({ params, url }) => {
  if (params.type === 'list') {
    return json(await listFlightLogs());
  }
  if (params.type === 'download') {
    const name = url.searchParams.get('name') ?? '';
    try {
      const body = new Uint8Array(await readFlightLog(name));
      return new Response(body, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${name}"`
        }
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }
  return new Response('Unknown flight-log request', { status: 404 });
};

export const POST: RequestHandler = async ({ params, request }) => {
  if (params.type === 'append') {
    const body = (await request.json()) as { id?: unknown; lines?: unknown };
    if (typeof body.id !== 'string' || !Array.isArray(body.lines)) {
      return new Response('Bad request', { status: 400 });
    }
    try {
      await appendFlightLog(
        body.id,
        body.lines.filter((l): l is string => typeof l === 'string')
      );
      return new Response('ok');
    } catch (err) {
      return new Response((err as Error).message, { status: 400 });
    }
  }
  return new Response('Unknown flight-log request', { status: 404 });
};

export const DELETE: RequestHandler = async ({ url }) => {
  const name = url.searchParams.get('name') ?? '';
  try {
    await deleteFlightLog(name);
    return new Response('ok');
  } catch {
    return new Response('Not found', { status: 404 });
  }
};
