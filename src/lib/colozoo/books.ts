/**
 * ColoZoo starter book library — static, hand-authored SVG coloring pages.
 *
 * Authoring rules:
 *  - viewBox 0 0 800 600 for every page.
 *  - Zone paths are CLOSED regions (flood-fillable). Thick friendly outlines
 *    (stroke-width 5) are derived from the same paths so fills and lines can
 *    never drift apart — plus optional extra detail strokes (whiskers,
 *    windows) that are outline-only, not fillable.
 *  - Zones deliberately simple/chunky: small hands, big targets.
 *
 * Adding a book = appending to COLOZOO_BOOKS. No code changes elsewhere.
 */

import type { ColorZone, ColoringPage, ColozooBook } from './types';

const VIEWBOX = '0 0 800 600';
const OUTLINE = '#1F2430';

/** Derive the locked outline layer from the fill zones (+ extra detail
 *  strokes). Guarantees outline geometry === zone geometry. */
function outlineFromZones(zones: ColorZone[], extraStrokes = ''): string {
  const zonePaths = zones
    .map((z) => `<path d="${z.path}" fill="none" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`)
    .join('');
  return `<g>${zonePaths}${extraStrokes}</g>`;
}

function page(
  bookId: string,
  pageNumber: number,
  zones: ColorZone[],
  extraStrokes = '',
  backgroundSvg?: string,
): ColoringPage {
  return {
    id: `${bookId}-p${pageNumber}`,
    bookId,
    pageNumber,
    viewBox: VIEWBOX,
    zones,
    outlinesSvg: outlineFromZones(zones, extraStrokes),
    ...(backgroundSvg ? { backgroundSvg } : {}),
  };
}

// ─── Trucks 🚒 ────────────────────────────────────────────────────────────────

const fireTruck: ColorZone[] = [
  { id: 'cab', path: 'M120 280 L120 180 Q120 160 140 160 L250 160 Q270 160 270 180 L270 280 Z', defaultColor: '#E53935', label: 'truck cab', educationalHint: 'This is the cab — where the firefighter sits!' },
  { id: 'body', path: 'M270 280 L270 200 L620 200 Q650 200 650 230 L650 280 Z', defaultColor: '#E53935', label: 'truck body', educationalHint: 'Fire trucks are usually red — but yours can be any color!' },
  { id: 'window', path: 'M145 185 L235 185 L235 240 L145 240 Z', defaultColor: '#4FC3F7', label: 'window' },
  { id: 'ladder', path: 'M300 150 L600 110 L605 140 L305 180 Z', label: 'ladder', educationalHint: 'The ladder helps firefighters reach high places!' },
  { id: 'wheel-left', path: 'M180 330 m-48 0 a48 48 0 1 0 96 0 a48 48 0 1 0 -96 0', defaultColor: '#212121', label: 'left wheel', educationalHint: 'This is the wheel! Wheels are usually black — but yours can be any color!' },
  { id: 'wheel-right', path: 'M540 330 m-48 0 a48 48 0 1 0 96 0 a48 48 0 1 0 -96 0', defaultColor: '#212121', label: 'right wheel' },
  { id: 'bumper', path: 'M100 280 L680 280 L680 315 L100 315 Z', label: 'bumper' },
  { id: 'light', path: 'M160 160 L200 160 L200 135 Q180 120 160 135 Z', defaultColor: '#FDD835', label: 'flashing light', educationalHint: 'Whee-ooo! The light flashes when the truck hurries!' },
];

const dumpTruck: ColorZone[] = [
  { id: 'cab', path: 'M110 300 L110 200 Q110 180 130 180 L230 180 Q250 180 250 200 L250 300 Z', defaultColor: '#FDD835', label: 'truck cab' },
  { id: 'window', path: 'M135 205 L225 205 L225 255 L135 255 Z', defaultColor: '#4FC3F7', label: 'window' },
  { id: 'bed', path: 'M270 300 L290 170 L660 150 L680 300 Z', defaultColor: '#FB8C00', label: 'dump bed', educationalHint: 'The bed tips up to dump the dirt out!' },
  { id: 'wheel-left', path: 'M180 350 m-45 0 a45 45 0 1 0 90 0 a45 45 0 1 0 -90 0', defaultColor: '#212121', label: 'left wheel' },
  { id: 'wheel-mid', path: 'M430 350 m-45 0 a45 45 0 1 0 90 0 a45 45 0 1 0 -90 0', defaultColor: '#212121', label: 'middle wheel' },
  { id: 'wheel-right', path: 'M600 350 m-45 0 a45 45 0 1 0 90 0 a45 45 0 1 0 -90 0', defaultColor: '#212121', label: 'right wheel' },
  { id: 'chassis', path: 'M95 300 L695 300 L695 330 L95 330 Z', label: 'chassis' },
];

const iceCreamTruck: ColorZone[] = [
  { id: 'body', path: 'M120 320 L120 180 Q120 150 150 150 L560 150 Q590 150 590 180 L590 320 Z', defaultColor: '#EC407A', label: 'truck body', educationalHint: 'The ice cream truck plays a happy song!' },
  { id: 'window', path: 'M170 190 L320 190 L320 270 L170 270 Z', defaultColor: '#4FC3F7', label: 'serving window' },
  { id: 'cone', path: 'M660 240 L700 240 L680 330 Z', defaultColor: '#6D4C41', label: 'cone', educationalHint: 'A crunchy cone! What flavor goes on top?' },
  { id: 'scoop', path: 'M680 240 m-38 0 a38 38 0 1 0 76 0 a38 38 0 1 0 -76 0', defaultColor: '#EC407A', label: 'ice cream scoop' },
  { id: 'wheel-left', path: 'M210 370 m-45 0 a45 45 0 1 0 90 0 a45 45 0 1 0 -90 0', defaultColor: '#212121', label: 'left wheel' },
  { id: 'wheel-right', path: 'M500 370 m-45 0 a45 45 0 1 0 90 0 a45 45 0 1 0 -90 0', defaultColor: '#212121', label: 'right wheel' },
  { id: 'roof-sign', path: 'M240 150 L470 150 L470 105 Q355 85 240 105 Z', defaultColor: '#FDD835', label: 'roof sign' },
];

// ─── Animals 🦁 ───────────────────────────────────────────────────────────────

const cat: ColorZone[] = [
  { id: 'head', path: 'M400 260 m-130 0 a130 130 0 1 0 260 0 a130 130 0 1 0 -260 0', defaultColor: '#FB8C00', label: 'cat head', educationalHint: 'Meow! Cats come in lots of colors!' },
  { id: 'ear-left', path: 'M300 175 L270 80 L370 130 Z', defaultColor: '#FB8C00', label: 'left ear' },
  { id: 'ear-right', path: 'M500 175 L530 80 L430 130 Z', defaultColor: '#FB8C00', label: 'right ear' },
  { id: 'nose', path: 'M385 275 L415 275 L400 298 Z', defaultColor: '#EC407A', label: 'nose', educationalHint: 'Cats sniff with their little nose!' },
  { id: 'belly', path: 'M400 480 m-110 -60 a110 90 0 1 0 220 0 a110 90 0 1 0 -220 0', defaultColor: '#FFFFFF', label: 'belly' },
  { id: 'eye-left', path: 'M350 230 m-22 0 a22 22 0 1 0 44 0 a22 22 0 1 0 -44 0', defaultColor: '#43A047', label: 'left eye' },
  { id: 'eye-right', path: 'M450 230 m-22 0 a22 22 0 1 0 44 0 a22 22 0 1 0 -44 0', defaultColor: '#43A047', label: 'right eye' },
];
const catWhiskers =
  '<path d="M320 290 L230 275 M320 305 L235 315 M480 290 L570 275 M480 305 L565 315" fill="none" stroke="#1F2430" stroke-width="4" stroke-linecap="round"/>';

const fish: ColorZone[] = [
  { id: 'body', path: 'M400 300 m-190 0 a190 120 0 1 0 380 0 a190 120 0 1 0 -380 0', defaultColor: '#1E88E5', label: 'fish body', educationalHint: 'Blub blub! Fish breathe underwater with gills!' },
  { id: 'tail', path: 'M590 300 L700 210 L700 390 Z', defaultColor: '#4FC3F7', label: 'tail fin', educationalHint: 'The tail pushes the fish through the water!' },
  { id: 'fin-top', path: 'M340 190 Q400 100 470 190 Z', defaultColor: '#4FC3F7', label: 'top fin' },
  { id: 'eye', path: 'M290 270 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0', defaultColor: '#212121', label: 'eye' },
  { id: 'bubble1', path: 'M170 150 m-22 0 a22 22 0 1 0 44 0 a22 22 0 1 0 -44 0', defaultColor: '#4FC3F7', label: 'bubble' },
  { id: 'bubble2', path: 'M120 90 m-15 0 a15 15 0 1 0 30 0 a15 15 0 1 0 -30 0', defaultColor: '#4FC3F7', label: 'small bubble' },
];

const butterfly: ColorZone[] = [
  { id: 'wing-tl', path: 'M390 280 Q220 90 150 190 Q110 280 390 300 Z', defaultColor: '#8E24AA', label: 'top left wing', educationalHint: 'Butterfly wings can be any pattern you like!' },
  { id: 'wing-tr', path: 'M410 280 Q580 90 650 190 Q690 280 410 300 Z', defaultColor: '#8E24AA', label: 'top right wing' },
  { id: 'wing-bl', path: 'M390 310 Q200 400 250 480 Q320 530 395 330 Z', defaultColor: '#EC407A', label: 'bottom left wing' },
  { id: 'wing-br', path: 'M410 310 Q600 400 550 480 Q480 530 405 330 Z', defaultColor: '#EC407A', label: 'bottom right wing' },
  { id: 'body', path: 'M385 240 Q400 225 415 240 L415 430 Q400 450 385 430 Z', defaultColor: '#6D4C41', label: 'body' },
];
const butterflyAntennae =
  '<path d="M392 240 Q370 180 340 160 M408 240 Q430 180 460 160" fill="none" stroke="#1F2430" stroke-width="4" stroke-linecap="round"/><circle cx="340" cy="160" r="7" fill="#1F2430"/><circle cx="460" cy="160" r="7" fill="#1F2430"/>';

// ─── Library ─────────────────────────────────────────────────────────────────

export const COLOZOO_BOOKS: ColozooBook[] = [
  {
    id: 'trucks',
    title: 'Trucks',
    coverEmoji: '🚒',
    pages: [
      page('trucks', 1, fireTruck),
      page('trucks', 2, dumpTruck),
      page('trucks', 3, iceCreamTruck),
    ],
  },
  {
    id: 'animals',
    title: 'Animals',
    coverEmoji: '🦁',
    pages: [
      page('animals', 1, cat, catWhiskers),
      page('animals', 2, fish),
      page('animals', 3, butterfly, butterflyAntennae),
    ],
  },
];

export function getBook(bookId: string): ColozooBook | undefined {
  return COLOZOO_BOOKS.find((b) => b.id === bookId);
}

export function getPage(bookId: string, pageNumber: number): ColoringPage | undefined {
  return getBook(bookId)?.pages.find((p) => p.pageNumber === pageNumber);
}
