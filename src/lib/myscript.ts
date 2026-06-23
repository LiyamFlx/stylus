import type { Stroke } from '../types';

/**
 * MyScript iink REST client — handwriting → text recognition.
 *
 * Uses the v4 batch endpoint:
 *   POST {host}/api/v4.0/iink/batch
 *
 * Authentication
 * --------------
 * MyScript signs requests with an application key + HMAC. The HMAC is computed
 * over the application key concatenated with the *raw JSON body*, keyed by
 * `applicationKey + hmacKey`, using HMAC-SHA512. Headers sent:
 *   applicationKey: <APP_KEY>
 *   hmac:           <hex HMAC-SHA512 of (APP_KEY + HMAC_KEY) over the body>
 *
 * ⚠️  WHERE TO PUT YOUR KEYS
 * --------------------------
 * Copy `.env.example` → `.env.local` and set:
 *   VITE_MYSCRIPT_APP_KEY   — your application key
 *   VITE_MYSCRIPT_HMAC_KEY  — your HMAC key
 *   VITE_MYSCRIPT_HOST      — optional, defaults to https://cloud.myscript.com
 * Get free developer keys at https://developer.myscript.com/
 *
 * ⚠️  PRODUCTION NOTE
 * -------------------
 * Because Vite inlines VITE_* vars into the client bundle, the HMAC key would
 * be exposed to anyone who opens devtools. For production, move this call
 * behind a backend proxy that holds the secret and signs requests server-side.
 * The body shape below is identical; only the signing location changes.
 */

const HOST =
  import.meta.env.VITE_MYSCRIPT_HOST ?? 'https://cloud.myscript.com';
const APP_KEY = import.meta.env.VITE_MYSCRIPT_APP_KEY ?? '';
const HMAC_KEY = import.meta.env.VITE_MYSCRIPT_HMAC_KEY ?? '';

const PLACEHOLDER = 'your-application-key-here';

export interface RecognitionResult {
  /** The recognized plain text. */
  text: string;
}

export class MyScriptError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'no-keys'
      | 'empty'
      | 'http'
      | 'network'
      | 'parse',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MyScriptError';
  }
}

/** True when real (non-placeholder) credentials are configured. */
export function hasMyScriptKeys(): boolean {
  return (
    APP_KEY.length > 0 &&
    HMAC_KEY.length > 0 &&
    APP_KEY !== PLACEHOLDER
  );
}

/** Compute the iink HMAC: HMAC-SHA512 over the body, keyed by appKey+hmacKey. */
async function computeHmac(body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(APP_KEY + HMAC_KEY),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build the iink batch request body from our stroke model.
 *
 * iink expects per-stroke parallel arrays: x[], y[], and t[] (timestamps).
 * We map our InkPoint[] directly. `configuration.lang` controls the language;
 * "TEXT" recognition is requested via contentType.
 */
function buildBody(strokes: Stroke[]) {
  return {
    contentType: 'Text',
    configuration: {
      lang: 'en_US',
      text: {
        guides: { enable: false },
        smartGuide: false,
      },
      export: { jiix: { strokes: false } },
    },
    strokeGroups: [
      {
        strokes: strokes.map((stroke) => ({
          x: stroke.points.map((p) => Math.round(p.x)),
          y: stroke.points.map((p) => Math.round(p.y)),
          t: stroke.points.map((p) => Math.round(p.t)),
          pointerType: 'PEN',
        })),
      },
    ],
  };
}

/**
 * Recognize handwriting from the given strokes.
 *
 * @throws {MyScriptError} when keys are missing, there's no ink, or the request
 *         fails. Callers should surface `err.message` to the user.
 */
export async function recognizeText(
  strokes: Stroke[],
): Promise<RecognitionResult> {
  if (!hasMyScriptKeys()) {
    throw new MyScriptError(
      'MyScript API keys are not configured. Add them to .env.local — see README.',
      'no-keys',
    );
  }
  if (strokes.length === 0) {
    throw new MyScriptError('Nothing to recognize — the canvas is empty.', 'empty');
  }

  const body = JSON.stringify(buildBody(strokes));
  const hmac = await computeHmac(body);

  let res: Response;
  try {
    res = await fetch(`${HOST}/api/v4.0/iink/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/plain,application/json',
        applicationKey: APP_KEY,
        hmac,
      },
      body,
    });
  } catch (err) {
    throw new MyScriptError(
      `Network error contacting MyScript: ${(err as Error).message}`,
      'network',
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new MyScriptError(
      `MyScript returned ${res.status} ${res.statusText}${
        detail ? `: ${detail.slice(0, 200)}` : ''
      }`,
      'http',
      res.status,
    );
  }

  // The batch endpoint returns plain text for Text content (or JIIX JSON if
  // requested). Handle both: try JSON first, fall back to raw text.
  const raw = await res.text();
  try {
    const json = JSON.parse(raw) as { label?: string; text?: string };
    const text = json.label ?? json.text ?? '';
    return { text };
  } catch {
    return { text: raw };
  }
}
