import type { RequestHandler } from '@sveltejs/kit';
import { getSetting } from '$lib/server/settings';
import { buildTuningPrompt, parseTuningResponse, type TuningContext } from '$lib/pid-tuning';

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

// Asks an OpenAI-compatible chat endpoint (LiteLLM, OpenAI, Ollama, or any
// gateway that speaks the same wire format) to review the current PID gains
// against recent vibration and attitude telemetry.
export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) return json({ message: 'Unauthorized' }, 401);

	const apiKey = (await getSetting('ai.apiKey')) ?? process.env.AI_API_KEY ?? '';
	if (!apiKey) {
		return json(
			{ message: 'The AI assistant is not configured. Add an API key on the Integrations page.' },
			400
		);
	}

	const baseUrl = ((await getSetting('ai.baseUrl')) ?? process.env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(
		/\/+$/,
		''
	);
	const model = (await getSetting('ai.model')) ?? process.env.AI_MODEL ?? 'gpt-4o-mini';

	const context = (await event.request.json()) as TuningContext;
	if (!context || !Array.isArray(context.pids) || context.pids.length === 0) {
		return json({ message: 'No PID parameters were provided. Refresh parameters and try again.' }, 400);
	}

	const { system, user } = buildTuningPrompt(context);

	let content: string;
	try {
		const response = await fetch(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
			body: JSON.stringify({
				model,
				temperature: 0.2,
				response_format: { type: 'json_object' },
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user }
				]
			})
		});
		if (!response.ok) {
			return json({ message: `The tuning provider rejected the request (${response.status}).` }, 502);
		}
		const data = await response.json();
		content = data?.choices?.[0]?.message?.content ?? '';
	} catch (err) {
		return json({ message: `Could not reach the tuning provider: ${(err as Error).message}` }, 502);
	}

	try {
		return json(parseTuningResponse(content));
	} catch (err) {
		return json({ message: (err as Error).message }, 502);
	}
};
