const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SECRET_ASSIGNMENT = /\b(password|passphrase|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\b(\s*[:=]\s*)(["']?)(?:[^\s"'&,;]+|"[^"]*"|'[^']*')/gi;
const BEARER_TOKEN = /\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi;
const URL_SECRET = /([?&](?:token|key|secret|password|code|access_token)=)[^&#\s]+/gi;
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

/** Scrubs common credentials and contact details before text reaches a log sink. */
export function sanitizeDiagnosticText(value: unknown, maxLength = 2048): string {
  let text: string;
  try { text = String(value ?? ''); } catch { text = '[unprintable value]'; }
  return text
    .replace(CONTROL_CHARS, '')
    .replace(SECRET_ASSIGNMENT, '$1$2$3[REDACTED]')
    .replace(BEARER_TOKEN, '$1[REDACTED]')
    .replace(URL_SECRET, '$1[REDACTED]')
    .replace(EMAIL_ADDRESS, '[EMAIL]')
    .slice(0, maxLength);
}
