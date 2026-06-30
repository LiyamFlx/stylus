/** One tour step. `target` omitted → a centered card (welcome / finish). */
export interface TourStep {
  id: string;
  /** `data-tour` value to spotlight; omitted = centered card. */
  target?: string;
  title: string;
  body: string;
  /** Card placement relative to the target. Defaults to 'bottom'. */
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Stylus',
    body: 'Your universal digital notebook. Take a 30-second tour of the essentials?',
  },
  {
    id: 'pen',
    target: 'pen',
    title: 'Write and draw',
    body: 'Use the pen with your mouse, finger, or stylus. Tap the pen again to switch between fountain, ballpoint, brush, and highlighter.',
    placement: 'bottom',
  },
  {
    id: 'select',
    target: 'select',
    title: 'Select with the lasso',
    body: 'Circle some ink to select it. A floating toolbar pops up to recolor, duplicate, or run AI on just that selection.',
    placement: 'bottom',
  },
  {
    id: 'convert',
    target: 'convert',
    title: 'Handwriting → text, and Ask Stylus',
    body: 'Turn your handwriting into typed text, or ask Stylus to explain and answer — powered by AI.',
    placement: 'bottom',
  },
  {
    id: 'menu',
    target: 'menu',
    title: 'Documents & settings',
    body: 'Your notebooks, Night Mode, the stabilizer, and this tour all live in the menu.',
    placement: 'right',
  },
  {
    id: 'finish',
    title: "You're all set!",
    body: 'That’s the tour. Start writing — everything saves on this device automatically.',
  },
];
