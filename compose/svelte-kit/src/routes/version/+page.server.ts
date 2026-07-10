import { execSync } from 'node:child_process';
import type { PageServerLoad } from './$types';

export const prerender = true;

function git(args: string): string {
	try {
		return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
	} catch {
		return '';
	}
}

export const load: PageServerLoad = () => {
	const version =
		process.env.CANARYGC_VERSION ||
		git("describe --tags --abbrev=0 --match 'v[0-9]*'") ||
		'dev';
	const commit = process.env.GITHUB_SHA?.slice(0, 7) || git('rev-parse --short HEAD') || 'unknown';
	const buildDate = new Date().toISOString();
	return { version, commit, buildDate };
};
