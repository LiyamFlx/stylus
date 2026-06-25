import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateText, APICallError } from 'ai';

/**
 * Handwriting recognition backend. Sends a rasterized image of the canvas ink
 * to Claude (vision) via the Vercel AI Gateway and returns the transcription.
 *
 * Claude reads handwriting far more reliably than on-device OCR (Tesseract),
 * which the client keeps only as an offline fallback. Auth is OIDC — no API key
 * in code (provisioned on Vercel automatically, locally via `vercel env pull`).
 *
 * POST { image: "data:image/png;base64,..." } -> { text }
 */

// A vision-capable Claude model on the Gateway. Haiku is fast, cheap, and on
// the free-tier credits; it handles short handwriting transcription well. Fall
// back across a couple of generations if one is unavailable.
const MODEL = 'anthropic/claude-haiku-4.5';
const FALLBACK_MODELS = ['anthropic/claude-3.5-haiku', 'anthropic/claude-3.5-sonnet'];

const PROMPT =
  'This image contains handwriting on a transparent/dark canvas. ' +
  'Transcribe the handwritten text exactly as written — preserve line breaks, ' +
  'punctuation and capitalization. Do not correct spelling or add commentary. ' +
  'If there is no legible handwriting, reply with an empty response. ' +
  'Return only the transcribed text.';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { image } = (req.body ?? {}) as { image?: string };
  if (!image || !image.startsWith('data:image/')) {
    res.status(400).json({ error: 'No image to recognize.' });
    return;
  }

  try {
    const { text } = await generateText({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image', image },
          ],
        },
      ],
      providerOptions: {
        gateway: {
          models: FALLBACK_MODELS,
          tags: ['feature:stylus-recognize'],
        },
      },
    });
    res.status(200).json({ text: text.trim() });
  } catch (err) {
    if (APICallError.isInstance(err)) {
      switch (err.statusCode) {
        case 402:
          res.status(402).json({ error: 'AI budget reached. Try again later.' });
          return;
        case 429:
          res.status(429).json({ error: 'Too many requests. Please slow down.' });
          return;
        case 503:
          res.status(503).json({ error: 'AI service temporarily unavailable.' });
          return;
      }
    }
    const message = err instanceof Error ? err.message : 'Recognition failed.';
    res.status(500).json({ error: message });
  }
}
