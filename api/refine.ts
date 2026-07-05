import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateText, APICallError } from 'ai';

/**
 * Stylus AI studio backend. Refines recognized handwriting with Claude via the
 * Vercel AI Gateway. Auth is OIDC (no API key in code); on Vercel the token is
 * provisioned automatically, locally via `vercel env pull`.
 *
 * POST { action, text } -> { result }
 */

type Action =
  | 'polish'
  | 'grammar'
  | 'summarize'
  | 'todo'
  | 'formal'
  | 'casual'
  | 'ask'
  | 'translate';

/** When the selection is already English, Translate sends it here instead. */
const DEFAULT_TRANSLATE_TARGET = 'Spanish';

const PROMPTS: Record<Action, (t: string) => string> = {
  polish: (t) =>
    `Polish the following handwritten note into clear, well-structured prose. Keep the meaning, keep it concise, preserve line breaks where sensible. Return only the rewritten text with no preamble.\n\n"""${t}"""`,
  grammar: (t) =>
    `Correct only the spelling and grammar in the following note. Make no other changes. Return only the corrected text.\n\n"""${t}"""`,
  summarize: (t) =>
    `Summarize the following note as 2 to 4 short bullet points, each starting with "• ". Return only the bullets.\n\n"""${t}"""`,
  todo: (t) =>
    `Extract the action items from the following note as a checklist. Put "- [ ] " before each item. Return only the list.\n\n"""${t}"""`,
  formal: (t) =>
    `Rewrite the following note in a polished, professional tone. Return only the rewritten text.\n\n"""${t}"""`,
  casual: (t) =>
    `Rewrite the following note in a warm, friendly, casual tone. Return only the rewritten text.\n\n"""${t}"""`,
  ask: (t) =>
    `You are Stylus, a helpful study assistant. The following is a handwritten note a student selected. Explain it clearly and concisely, answer any question it poses, and point out any mistakes. Use short paragraphs or bullets. Return only your response, no preamble.\n\n"""${t}"""`,
  translate: (t) =>
    `Detect the language of the following note. If it is not English, translate it into clear English. If it is already English, translate it into ${DEFAULT_TRANSLATE_TARGET}. Preserve line breaks. Return only the translation, with no preamble or language labels.\n\n"""${t}"""`,
};

// Haiku is covered by AI Gateway free-tier credits (the Sonnet/Opus tiers are
// not) and is plenty for short note refinement — fast and inexpensive. Falls
// back across a couple of Haiku generations if one is unavailable.
const MODEL = 'anthropic/claude-haiku-4.5';
const FALLBACK_MODELS = ['anthropic/claude-3.5-haiku'];

/** Max characters of recognized text accepted per request. */
const MAX_INPUT_CHARS = 8_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { action, text } = (req.body ?? {}) as {
    action?: string;
    text?: string;
  };

  const build = action ? PROMPTS[action as Action] : undefined;
  if (!build) {
    res.status(400).json({ error: `Unknown action: ${action}` });
    return;
  }
  const source = (text ?? '').trim();
  if (!source) {
    res.status(400).json({ error: 'No text to refine.' });
    return;
  }
  // Cap input length: a note refinement never needs more, and an oversized body
  // would inflate token spend and latency. Recognized handwriting is short.
  if (source.length > MAX_INPUT_CHARS) {
    res.status(413).json({ error: 'Selection is too long to refine.' });
    return;
  }

  try {
    const { text: result } = await generateText({
      model: MODEL,
      prompt: build(source),
      // Bound the response so a long note can't run the function toward its
      // timeout; ample for note refinement, Ask, and Translate.
      maxOutputTokens: 768,
      providerOptions: {
        gateway: {
          models: FALLBACK_MODELS,
          tags: ['feature:stylus-refine', `action:${action}`],
        },
      },
    });
    res.status(200).json({ result: result.trim() });
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
          res
            .status(503)
            .json({ error: 'AI service temporarily unavailable.' });
          return;
      }
    }
    // Log the real error server-side; return a generic message so internal
    // details (stack, provider internals) never reach the client.
    console.error('[stylus/refine] unexpected error', err);
    res.status(500).json({ error: 'Refinement failed. Please try again.' });
  }
}
