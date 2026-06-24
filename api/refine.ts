import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateText, APICallError } from 'ai';

/**
 * Stylus AI studio backend. Refines recognized handwriting with Claude via the
 * Vercel AI Gateway. Auth is OIDC (no API key in code); on Vercel the token is
 * provisioned automatically, locally via `vercel env pull`.
 *
 * POST { action, text } -> { result }
 */

type Action = 'polish' | 'grammar' | 'summarize' | 'todo' | 'formal' | 'casual';

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
};

const MODEL = 'anthropic/claude-sonnet-4.6';

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

  try {
    const { text: result } = await generateText({
      model: MODEL,
      prompt: build(source),
      providerOptions: {
        gateway: { tags: ['feature:stylus-refine', `action:${action}`] },
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
    const message = err instanceof Error ? err.message : 'Refinement failed.';
    res.status(500).json({ error: message });
  }
}
