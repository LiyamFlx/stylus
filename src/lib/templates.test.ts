import { describe, it, expect } from 'vitest';
import { resolvePageTemplateId, type PageMeta } from './documents';
import { ensureTemplateBitmap, getTemplateBitmap } from './templates';

const page = (templateId: PageMeta['templateId']): Pick<PageMeta, 'templateId'> =>
  templateId === undefined ? {} : { templateId };

describe('resolvePageTemplateId — the three-state contract', () => {
  it('undefined inherits the doc default', () => {
    expect(resolvePageTemplateId('planner-daily-red', page(undefined))).toBe('planner-daily-red');
  });

  it('undefined with no doc default resolves to plain', () => {
    expect(resolvePageTemplateId(undefined, page(undefined))).toBeNull();
  });

  it('null is explicitly plain even with a doc default', () => {
    expect(resolvePageTemplateId('planner-daily-red', page(null))).toBeNull();
  });

  it('a page override wins over the doc default', () => {
    expect(resolvePageTemplateId('planner-daily-red', page('paper-grid-blush'))).toBe(
      'paper-grid-blush',
    );
  });
});

describe('template bitmap cache — non-browser safety', () => {
  it('sync read misses quietly for unknown ids', () => {
    expect(getTemplateBitmap('nope')).toBeNull();
  });

  it('ensure resolves null (not throws) where decode is unavailable (jsdom)', async () => {
    // jsdom has no createImageBitmap — the renderer treats null as "plain
    // paper this frame", never an error. This is the export/test fallback path.
    await expect(ensureTemplateBitmap('planner-daily-red')).resolves.toBeNull();
  });
});
