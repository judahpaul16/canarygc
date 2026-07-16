import { db } from './db';

export async function getSetting(key: string): Promise<string | null> {
  const result = await db.execute({ sql: 'SELECT value FROM app_setting WHERE key = ?', args: [key] });
  const row = result.rows[0] as unknown as { value: string } | undefined;
  return row ? row.value : null;
}

export async function getSettings(prefix: string): Promise<Record<string, string>> {
  const result = await db.execute({ sql: 'SELECT key, value FROM app_setting WHERE key LIKE ?', args: [`${prefix}%`] });
  const out: Record<string, string> = {};
  for (const row of result.rows as unknown as { key: string; value: string }[]) out[row.key] = row.value;
  return out;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.execute({
    sql: 'INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    args: [key, value]
  });
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

// SMTP settings come from the integrations table first, then the environment as
// a fallback, matching the host/port/secure/user/pass/from shape. An empty
// value at either level means unset, so it falls through to the next default.
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const s = await getSettings('smtp.');
  const host = s['smtp.host'] || process.env.SMTP_HOST || '';
  const user = s['smtp.user'] || process.env.SMTP_USER || '';
  const pass = s['smtp.pass'] || process.env.SMTP_PASS || '';
  const port = Number(s['smtp.port'] || process.env.SMTP_PORT || 587);
  const from = s['smtp.from'] || process.env.MAIL_FROM || user;
  const secureRaw = s['smtp.secure'] || process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false');
  if (!host || !user || !pass) return null;
  return { host, port, secure: secureRaw === 'true', user, pass, from };
}

export async function getEnabledAlerts(): Promise<Set<string>> {
  const s = await getSettings('alert.');
  const enabled = new Set<string>();
  for (const [key, value] of Object.entries(s)) {
    if (key.startsWith('alert.enabled.') && value === 'true') enabled.add(key.slice('alert.enabled.'.length));
  }
  return enabled;
}
