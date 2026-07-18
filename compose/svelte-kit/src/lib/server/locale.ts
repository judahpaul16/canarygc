import { getSetting } from './settings';
import { baseLocale, isLocale, type Locale } from '$lib/paraglide/runtime';

// The operator's saved UI locale, for server-side flows (alert emails,
// password-reset mail, background jobs) that run with no request cookie to read.
// Falls back to the base locale when nothing valid is stored.
export async function operatorLocale(): Promise<Locale> {
  const saved = await getSetting('ui.locale');
  return saved && isLocale(saved) ? saved : baseLocale;
}
