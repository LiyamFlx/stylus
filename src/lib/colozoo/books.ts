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

/** Circle as a closed SVG path (flood-fillable), in viewBox coords. */
const circle = (cx: number, cy: number, r: number): string =>
  `M${cx} ${cy} m${-r} 0 a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0 Z`;

/** Axis-aligned rectangle as a closed SVG path. */
const rect = (x: number, y: number, w: number, h: number): string =>
  `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;

/** Closed polygon through the given [x,y] points. */
const poly = (pts: Array<[number, number]>): string =>
  pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ') + ' Z';

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

const garbageTruck: ColorZone[] = [
  { id: 'cab', path: rect(110, 210, 150, 110), defaultColor: '#43A047', label: 'cab' },
  { id: 'window', path: rect(135, 230, 100, 55), defaultColor: '#4FC3F7', label: 'window' },
  { id: 'hopper', path: poly([[270, 320], [270, 180], [640, 180], [670, 320]]), defaultColor: '#66BB6A', label: 'garbage box', educationalHint: 'This truck keeps the town clean!' },
  { id: 'bin', path: rect(300, 130, 90, 60), defaultColor: '#795548', label: 'bin' },
  { id: 'wheel-left', path: circle(200, 350, 45), defaultColor: '#212121', label: 'left wheel' },
  { id: 'wheel-right', path: circle(560, 350, 45), defaultColor: '#212121', label: 'right wheel' },
];

const policeCar: ColorZone[] = [
  { id: 'body', path: poly([[120, 360], [170, 250], [620, 250], [680, 360]]), defaultColor: '#1E88E5', label: 'car body', educationalHint: 'Police cars help keep everyone safe!' },
  { id: 'roof', path: poly([[260, 250], [300, 190], [520, 190], [560, 250]]), defaultColor: '#1E88E5', label: 'roof' },
  { id: 'window', path: poly([[300, 250], [330, 200], [490, 200], [520, 250]]), defaultColor: '#4FC3F7', label: 'windows' },
  { id: 'siren', path: rect(370, 150, 60, 40), defaultColor: '#E53935', label: 'siren', educationalHint: 'Whee-ooo! The siren says here I come!' },
  { id: 'wheel-left', path: circle(240, 360, 44), defaultColor: '#212121', label: 'left wheel' },
  { id: 'wheel-right', path: circle(560, 360, 44), defaultColor: '#212121', label: 'right wheel' },
];

const schoolBus: ColorZone[] = [
  { id: 'body', path: rect(90, 190, 620, 160), defaultColor: '#FDD835', label: 'bus body', educationalHint: 'The bus takes kids to school!' },
  { id: 'window1', path: rect(120, 215, 90, 70), defaultColor: '#4FC3F7', label: 'window' },
  { id: 'window2', path: rect(230, 215, 90, 70), defaultColor: '#4FC3F7', label: 'window' },
  { id: 'window3', path: rect(340, 215, 90, 70), defaultColor: '#4FC3F7', label: 'window' },
  { id: 'door', path: rect(620, 220, 70, 130), defaultColor: '#FB8C00', label: 'door' },
  { id: 'wheel-left', path: circle(220, 350, 46), defaultColor: '#212121', label: 'left wheel' },
  { id: 'wheel-right', path: circle(580, 350, 46), defaultColor: '#212121', label: 'right wheel' },
];

const cementMixer: ColorZone[] = [
  { id: 'cab', path: rect(110, 220, 140, 110), defaultColor: '#FB8C00', label: 'cab' },
  { id: 'window', path: rect(135, 240, 90, 55), defaultColor: '#4FC3F7', label: 'window' },
  { id: 'drum', path: circle(470, 240, 110), defaultColor: '#9CCC65', label: 'mixer drum', educationalHint: 'The drum spins to mix the cement!' },
  { id: 'chassis', path: rect(95, 330, 620, 30), label: 'chassis' },
  { id: 'wheel-left', path: circle(210, 375, 42), defaultColor: '#212121', label: 'left wheel' },
  { id: 'wheel-mid', path: circle(430, 375, 42), defaultColor: '#212121', label: 'middle wheel' },
  { id: 'wheel-right', path: circle(600, 375, 42), defaultColor: '#212121', label: 'right wheel' },
];

const tractor: ColorZone[] = [
  { id: 'body', path: rect(230, 250, 260, 110), defaultColor: '#43A047', label: 'tractor body', educationalHint: 'Tractors help farmers grow our food!' },
  { id: 'cab', path: rect(250, 170, 130, 90), defaultColor: '#66BB6A', label: 'cab' },
  { id: 'window', path: rect(270, 185, 90, 65), defaultColor: '#4FC3F7', label: 'window' },
  { id: 'exhaust', path: rect(470, 150, 26, 110), defaultColor: '#212121', label: 'exhaust pipe' },
  { id: 'wheel-big', path: circle(220, 380, 80), defaultColor: '#212121', label: 'big wheel' },
  { id: 'wheel-small', path: circle(480, 400, 48), defaultColor: '#212121', label: 'small wheel' },
];

const dog: ColorZone[] = [
  { id: 'head', path: circle(400, 260, 140), defaultColor: '#A1887F', label: 'dog head', educationalHint: 'Woof! Dogs are our friends!' },
  { id: 'ear-left', path: poly([[280, 180], [230, 320], [320, 300]]), defaultColor: '#8D6E63', label: 'ear' },
  { id: 'ear-right', path: poly([[520, 180], [570, 320], [480, 300]]), defaultColor: '#8D6E63', label: 'ear' },
  { id: 'snout', path: circle(400, 320, 55), defaultColor: '#D7CCC8', label: 'snout' },
  { id: 'nose', path: circle(400, 305, 22), defaultColor: '#212121', label: 'nose' },
  { id: 'body', path: circle(400, 480, 100), defaultColor: '#A1887F', label: 'body' },
];

const rabbit: ColorZone[] = [
  { id: 'ear-left', path: poly([[350, 220], [320, 60], [385, 60], [395, 220]]), defaultColor: '#F8BBD0', label: 'ear', educationalHint: 'Rabbits have long ears to hear well!' },
  { id: 'ear-right', path: poly([[450, 220], [480, 60], [415, 60], [405, 220]]), defaultColor: '#F8BBD0', label: 'ear' },
  { id: 'head', path: circle(400, 300, 110), defaultColor: '#FFFFFF', label: 'head' },
  { id: 'body', path: circle(400, 470, 100), defaultColor: '#FFFFFF', label: 'body' },
  { id: 'eye-left', path: circle(365, 285, 16), defaultColor: '#212121', label: 'eye' },
  { id: 'eye-right', path: circle(435, 285, 16), defaultColor: '#212121', label: 'eye' },
];

const elephant: ColorZone[] = [
  { id: 'body', path: circle(360, 330, 170), defaultColor: '#90A4AE', label: 'elephant body', educationalHint: 'Elephants use their trunk like a hand!' },
  { id: 'ear', path: circle(500, 280, 90), defaultColor: '#B0BEC5', label: 'ear' },
  { id: 'head', path: circle(560, 320, 110), defaultColor: '#90A4AE', label: 'head' },
  { id: 'trunk', path: poly([[640, 320], [710, 400], [690, 500], [630, 500], [650, 410], [590, 380]]), defaultColor: '#78909C', label: 'trunk' },
  { id: 'eye', path: circle(560, 290, 14), defaultColor: '#212121', label: 'eye' },
];

const owl: ColorZone[] = [
  { id: 'body', path: circle(400, 320, 160), defaultColor: '#8D6E63', label: 'owl body', educationalHint: 'Owls are awake at night — hoo hoo!' },
  { id: 'eye-left', path: circle(340, 280, 55), defaultColor: '#FFFFFF', label: 'eye' },
  { id: 'eye-right', path: circle(460, 280, 55), defaultColor: '#FFFFFF', label: 'eye' },
  { id: 'beak', path: poly([[400, 300], [430, 340], [370, 340]]), defaultColor: '#FB8C00', label: 'beak' },
  { id: 'wing-left', path: circle(270, 360, 55), defaultColor: '#6D4C41', label: 'wing' },
  { id: 'wing-right', path: circle(530, 360, 55), defaultColor: '#6D4C41', label: 'wing' },
];

const turtle: ColorZone[] = [
  { id: 'shell', path: circle(400, 330, 150), defaultColor: '#43A047', label: 'shell', educationalHint: 'The turtle carries its home on its back!' },
  { id: 'head', path: circle(590, 320, 55), defaultColor: '#66BB6A', label: 'head' },
  { id: 'leg-front', path: circle(280, 440, 46), defaultColor: '#81C784', label: 'leg' },
  { id: 'leg-back', path: circle(500, 450, 46), defaultColor: '#81C784', label: 'leg' },
  { id: 'eye', path: circle(605, 305, 12), defaultColor: '#212121', label: 'eye' },
];

// ─── Ocean 🐠 ─────────────────────────────────────────────────────────────────

const clownfish: ColorZone[] = [
  { id: 'body', path: circle(380, 300, 150), defaultColor: '#FB8C00', label: 'fish body', educationalHint: 'Clownfish live in coral reefs!' },
  { id: 'stripe1', path: rect(300, 165, 45, 270), defaultColor: '#FFFFFF', label: 'stripe' },
  { id: 'stripe2', path: rect(430, 175, 45, 250), defaultColor: '#FFFFFF', label: 'stripe' },
  { id: 'tail', path: poly([[520, 300], [660, 210], [660, 390]]), defaultColor: '#FB8C00', label: 'tail' },
  { id: 'eye', path: circle(300, 270, 20), defaultColor: '#212121', label: 'eye' },
];

const octopus: ColorZone[] = [
  { id: 'head', path: circle(400, 240, 130), defaultColor: '#8E24AA', label: 'octopus head', educationalHint: 'An octopus has eight wiggly arms!' },
  { id: 'arm1', path: poly([[300, 330], [250, 480], [300, 490], [340, 350]]), defaultColor: '#AB47BC', label: 'arm' },
  { id: 'arm2', path: poly([[370, 360], [360, 500], [410, 500], [420, 360]]), defaultColor: '#AB47BC', label: 'arm' },
  { id: 'arm3', path: poly([[460, 350], [500, 490], [550, 480], [500, 330]]), defaultColor: '#AB47BC', label: 'arm' },
  { id: 'eye-left', path: circle(360, 220, 22), defaultColor: '#FFFFFF', label: 'eye' },
  { id: 'eye-right', path: circle(445, 220, 22), defaultColor: '#FFFFFF', label: 'eye' },
];

const crab: ColorZone[] = [
  { id: 'body', path: circle(400, 320, 130), defaultColor: '#E53935', label: 'crab body', educationalHint: 'Crabs walk sideways on the sand!' },
  { id: 'claw-left', path: circle(210, 290, 55), defaultColor: '#EF5350', label: 'claw' },
  { id: 'claw-right', path: circle(590, 290, 55), defaultColor: '#EF5350', label: 'claw' },
  { id: 'eye-left', path: circle(365, 240, 20), defaultColor: '#212121', label: 'eye' },
  { id: 'eye-right', path: circle(435, 240, 20), defaultColor: '#212121', label: 'eye' },
];

const whale: ColorZone[] = [
  { id: 'body', path: circle(370, 320, 180), defaultColor: '#1E88E5', label: 'whale body', educationalHint: 'The whale is the biggest animal in the sea!' },
  { id: 'tail', path: poly([[540, 320], [700, 240], [660, 320], [700, 400]]), defaultColor: '#1565C0', label: 'tail' },
  { id: 'belly', path: poly([[230, 380], [520, 380], [470, 470], [280, 470]]), defaultColor: '#90CAF9', label: 'belly' },
  { id: 'spout', path: circle(300, 130, 34), defaultColor: '#4FC3F7', label: 'water spout' },
  { id: 'eye', path: circle(280, 300, 16), defaultColor: '#212121', label: 'eye' },
];

const starfish: ColorZone[] = [
  { id: 'star', path: poly([[400, 120], [470, 300], [660, 300], [510, 410], [560, 500], [400, 400], [240, 500], [290, 410], [140, 300], [330, 300]]), defaultColor: '#FDD835', label: 'starfish', educationalHint: 'A starfish has five arms — count them!' },
  { id: 'center', path: circle(400, 330, 55), defaultColor: '#FB8C00', label: 'middle' },
];

const seahorse: ColorZone[] = [
  { id: 'body', path: poly([[420, 130], [500, 170], [470, 320], [380, 400], [430, 470], [340, 500], [300, 420], [370, 340], [350, 200]]), defaultColor: '#FB8C00', label: 'seahorse', educationalHint: 'The seahorse swims standing up!' },
  { id: 'head', path: circle(430, 150, 55), defaultColor: '#FFA726', label: 'head' },
  { id: 'fin', path: circle(510, 300, 40), defaultColor: '#FFD54F', label: 'fin' },
  { id: 'eye', path: circle(445, 140, 12), defaultColor: '#212121', label: 'eye' },
];

const jellyfish: ColorZone[] = [
  { id: 'bell', path: poly([[220, 300], [260, 170], [400, 130], [540, 170], [580, 300]]), defaultColor: '#EC407A', label: 'jellyfish bell', educationalHint: 'Jellyfish float and drift in the water!' },
  { id: 'tentacle1', path: poly([[260, 300], [240, 480], [290, 480], [320, 300]]), defaultColor: '#F06292', label: 'tentacle' },
  { id: 'tentacle2', path: poly([[360, 300], [350, 500], [400, 500], [420, 300]]), defaultColor: '#F06292', label: 'tentacle' },
  { id: 'tentacle3', path: poly([[470, 300], [510, 480], [560, 470], [520, 300]]), defaultColor: '#F06292', label: 'tentacle' },
];

const seaTurtle: ColorZone[] = [
  { id: 'shell', path: circle(400, 320, 150), defaultColor: '#43A047', label: 'shell', educationalHint: 'The turtle carries its home on its back!' },
  { id: 'head', path: circle(590, 300, 55), defaultColor: '#66BB6A', label: 'head' },
  { id: 'flipper-front', path: poly([[280, 400], [200, 470], [300, 480]]), defaultColor: '#81C784', label: 'flipper' },
  { id: 'flipper-back', path: poly([[500, 420], [560, 490], [470, 490]]), defaultColor: '#81C784', label: 'flipper' },
  { id: 'eye', path: circle(605, 285, 12), defaultColor: '#212121', label: 'eye' },
];

// ─── Bugs 🐞 ──────────────────────────────────────────────────────────────────

const ladybug: ColorZone[] = [
  { id: 'body', path: circle(400, 320, 160), defaultColor: '#E53935', label: 'ladybug body', educationalHint: 'Count the ladybug spots!' },
  { id: 'head', path: circle(400, 175, 60), defaultColor: '#212121', label: 'head' },
  { id: 'spot1', path: circle(330, 300, 34), defaultColor: '#212121', label: 'spot' },
  { id: 'spot2', path: circle(470, 300, 34), defaultColor: '#212121', label: 'spot' },
  { id: 'spot3', path: circle(360, 400, 34), defaultColor: '#212121', label: 'spot' },
  { id: 'spot4', path: circle(450, 400, 34), defaultColor: '#212121', label: 'spot' },
];

const bee: ColorZone[] = [
  { id: 'body', path: circle(400, 320, 150), defaultColor: '#FDD835', label: 'bee body', educationalHint: 'Buzz buzz! Bees make honey!' },
  { id: 'stripe1', path: rect(330, 180, 45, 280), defaultColor: '#212121', label: 'stripe' },
  { id: 'stripe2', path: rect(425, 180, 45, 280), defaultColor: '#212121', label: 'stripe' },
  { id: 'wing-left', path: circle(300, 200, 60), defaultColor: '#B3E5FC', label: 'wing' },
  { id: 'wing-right', path: circle(500, 200, 60), defaultColor: '#B3E5FC', label: 'wing' },
];

const ant: ColorZone[] = [
  { id: 'head', path: circle(230, 300, 70), defaultColor: '#6D4C41', label: 'head', educationalHint: 'Ants are super strong for their size!' },
  { id: 'body', path: circle(400, 310, 60), defaultColor: '#795548', label: 'middle' },
  { id: 'abdomen', path: circle(560, 310, 90), defaultColor: '#6D4C41', label: 'body' },
  { id: 'eye', path: circle(210, 285, 14), defaultColor: '#212121', label: 'eye' },
];

const snail: ColorZone[] = [
  { id: 'shell', path: circle(470, 300, 140), defaultColor: '#FB8C00', label: 'shell', educationalHint: 'The snail is slow and carries its shell!' },
  { id: 'swirl', path: circle(470, 300, 75), defaultColor: '#FFB74D', label: 'swirl' },
  { id: 'body', path: poly([[120, 440], [340, 400], [360, 460], [140, 480]]), defaultColor: '#9CCC65', label: 'body' },
  { id: 'horn', path: rect(140, 350, 18, 80), defaultColor: '#9CCC65', label: 'horn' },
];

const spider: ColorZone[] = [
  { id: 'body', path: circle(400, 340, 100), defaultColor: '#5E35B1', label: 'spider body', educationalHint: 'A spider has eight legs!' },
  { id: 'head', path: circle(400, 220, 60), defaultColor: '#7E57C2', label: 'head' },
  { id: 'leg-left', path: poly([[320, 300], [180, 260], [180, 285], [325, 330]]), defaultColor: '#4527A0', label: 'legs' },
  { id: 'leg-right', path: poly([[480, 300], [620, 260], [620, 285], [475, 330]]), defaultColor: '#4527A0', label: 'legs' },
  { id: 'eye-left', path: circle(380, 210, 14), defaultColor: '#FFFFFF', label: 'eye' },
  { id: 'eye-right', path: circle(420, 210, 14), defaultColor: '#FFFFFF', label: 'eye' },
];

// ─── Castle 🏰 ────────────────────────────────────────────────────────────────

const castle: ColorZone[] = [
  { id: 'wall', path: rect(200, 260, 400, 260), defaultColor: '#FFB74D', label: 'castle wall', educationalHint: 'Castles have strong stone walls!' },
  { id: 'tower-left', path: rect(130, 200, 90, 320), defaultColor: '#FFA726', label: 'tower' },
  { id: 'tower-right', path: rect(580, 200, 90, 320), defaultColor: '#FFA726', label: 'tower' },
  { id: 'gate', path: poly([[350, 520], [350, 400], [400, 360], [450, 400], [450, 520]]), defaultColor: '#6D4C41', label: 'gate' },
  { id: 'roof-left', path: poly([[120, 200], [175, 120], [230, 200]]), defaultColor: '#E53935', label: 'roof' },
  { id: 'roof-right', path: poly([[570, 200], [625, 120], [680, 200]]), defaultColor: '#E53935', label: 'roof' },
];

const tower: ColorZone[] = [
  { id: 'tower', path: rect(300, 220, 200, 300), defaultColor: '#90A4AE', label: 'tower', educationalHint: 'The tallest tower can see far away!' },
  { id: 'roof', path: poly([[270, 220], [400, 90], [530, 220]]), defaultColor: '#5E35B1', label: 'roof' },
  { id: 'window', path: poly([[360, 360], [360, 300], [400, 270], [440, 300], [440, 360]]), defaultColor: '#4FC3F7', label: 'window' },
  { id: 'door', path: poly([[365, 520], [365, 430], [400, 400], [435, 430], [435, 520]]), defaultColor: '#6D4C41', label: 'door' },
];

const knightShield: ColorZone[] = [
  { id: 'shield', path: poly([[250, 160], [550, 160], [550, 360], [400, 500], [250, 360]]), defaultColor: '#1E88E5', label: 'shield', educationalHint: 'Knights carried a shield to stay safe!' },
  { id: 'band', path: rect(250, 300, 300, 50), defaultColor: '#FDD835', label: 'band' },
  { id: 'star', path: poly([[400, 200], [425, 265], [495, 265], [440, 305], [460, 370], [400, 330], [340, 370], [360, 305], [305, 265], [375, 265]]), defaultColor: '#FDD835', label: 'star' },
];

const crown: ColorZone[] = [
  { id: 'crown', path: poly([[180, 460], [180, 240], [290, 340], [400, 200], [510, 340], [620, 240], [620, 460]]), defaultColor: '#FDD835', label: 'crown', educationalHint: 'Kings and queens wear a golden crown!' },
  { id: 'band', path: rect(180, 460, 440, 70), defaultColor: '#FFB300', label: 'band' },
  { id: 'jewel-left', path: circle(280, 495, 24), defaultColor: '#E53935', label: 'jewel' },
  { id: 'jewel-mid', path: circle(400, 495, 24), defaultColor: '#43A047', label: 'jewel' },
  { id: 'jewel-right', path: circle(520, 495, 24), defaultColor: '#1E88E5', label: 'jewel' },
];

const dragon: ColorZone[] = [
  { id: 'body', path: circle(360, 340, 150), defaultColor: '#43A047', label: 'dragon body', educationalHint: 'This friendly dragon breathes sparkles!' },
  { id: 'head', path: circle(580, 260, 90), defaultColor: '#66BB6A', label: 'head' },
  { id: 'wing', path: poly([[320, 250], [230, 100], [440, 230]]), defaultColor: '#81C784', label: 'wing' },
  { id: 'tail', path: poly([[220, 360], [90, 300], [110, 420]]), defaultColor: '#66BB6A', label: 'tail' },
  { id: 'fire', path: poly([[665, 250], [760, 230], [740, 270], [760, 290]]), defaultColor: '#FB8C00', label: 'fire' },
  { id: 'eye', path: circle(610, 240, 14), defaultColor: '#212121', label: 'eye' },
];

const flag: ColorZone[] = [
  { id: 'pole', path: rect(230, 120, 26, 400), defaultColor: '#6D4C41', label: 'flag pole' },
  { id: 'flag', path: poly([[256, 140], [620, 190], [256, 300]]), defaultColor: '#E53935', label: 'flag', educationalHint: 'The castle flies its flag up high!' },
  { id: 'hill', path: circle(400, 560, 200), defaultColor: '#66BB6A', label: 'hill' },
  { id: 'finial', path: circle(243, 120, 20), defaultColor: '#FDD835', label: 'top' },
];

// ─── Library ─────────────────────────────────────────────────────────────────

export const COLOZOO_BOOKS: ColozooBook[] = [
  {
    id: 'trucks',
    title: 'Trucks',
    coverEmoji: '🚒',
    thumbSvg: '<rect x="8" y="26" width="40" height="20" rx="3" fill="#EF5B5B"/><rect x="30" y="18" width="18" height="14" rx="2" fill="#EF5B5B"/><rect x="34" y="21" width="10" height="7" fill="#BFE7F5"/><circle cx="18" cy="50" r="6" fill="#333"/><circle cx="44" cy="50" r="6" fill="#333"/>',
    pages: [
      page('trucks', 1, fireTruck),
      page('trucks', 2, dumpTruck),
      page('trucks', 3, iceCreamTruck),
      page('trucks', 4, garbageTruck),
      page('trucks', 5, policeCar),
      page('trucks', 6, schoolBus),
      page('trucks', 7, cementMixer),
      page('trucks', 8, tractor),
    ],
  },
  {
    id: 'animals',
    title: 'Animals',
    coverEmoji: '🦁',
    thumbSvg: '<circle cx="32" cy="32" r="20" fill="#F5943B"/><circle cx="32" cy="34" r="13" fill="#FBD24E"/><circle cx="25" cy="32" r="2.5" fill="#333"/><circle cx="39" cy="32" r="2.5" fill="#333"/><path d="M28 40 q4 4 8 0" stroke="#333" stroke-width="2" fill="none"/>',
    pages: [
      page('animals', 1, cat, catWhiskers),
      page('animals', 2, fish),
      page('animals', 3, butterfly, butterflyAntennae),
      page('animals', 4, dog),
      page('animals', 5, rabbit),
      page('animals', 6, elephant),
      page('animals', 7, owl),
      page('animals', 8, turtle),
    ],
  },
  {
    id: 'ocean',
    title: 'Ocean',
    coverEmoji: '🐠',
    thumbSvg: '<ellipse cx="30" cy="32" rx="18" ry="12" fill="#4A90E2"/><path d="M48 32 l10 -8 v16 z" fill="#4A90E2"/><circle cx="22" cy="30" r="2.5" fill="#fff"/><circle cx="22" cy="30" r="1.2" fill="#333"/>',
    pages: [
      page('ocean', 1, clownfish),
      page('ocean', 2, octopus),
      page('ocean', 3, crab),
      page('ocean', 4, whale),
      page('ocean', 5, starfish),
      page('ocean', 6, seahorse),
      page('ocean', 7, jellyfish),
      page('ocean', 8, seaTurtle),
    ],
  },
  {
    id: 'bugs',
    title: 'Bugs',
    coverEmoji: '🐞',
    thumbSvg: '<circle cx="32" cy="34" r="18" fill="#EF5B5B"/><path d="M32 16 v36" stroke="#333" stroke-width="2"/><circle cx="24" cy="30" r="2.5" fill="#333"/><circle cx="40" cy="30" r="2.5" fill="#333"/><circle cx="26" cy="42" r="2.5" fill="#333"/><circle cx="38" cy="42" r="2.5" fill="#333"/><circle cx="32" cy="14" r="5" fill="#333"/>',
    pages: [
      page('bugs', 1, ladybug),
      page('bugs', 2, butterfly, butterflyAntennae),
      page('bugs', 3, bee),
      page('bugs', 4, ant),
      page('bugs', 5, snail),
      page('bugs', 6, spider),
    ],
  },
  {
    id: 'castle',
    title: 'Castle',
    coverEmoji: '🏰',
    thumbSvg: '<rect x="14" y="28" width="36" height="24" fill="#C3B1E1"/><rect x="12" y="20" width="8" height="12" fill="#C3B1E1"/><rect x="28" y="20" width="8" height="12" fill="#C3B1E1"/><rect x="44" y="20" width="8" height="12" fill="#C3B1E1"/><rect x="28" y="40" width="8" height="12" fill="#6DBE6A"/>',
    pages: [
      page('castle', 1, castle),
      page('castle', 2, tower),
      page('castle', 3, knightShield),
      page('castle', 4, crown),
      page('castle', 5, dragon),
      page('castle', 6, flag),
    ],
  },
];

export function getBook(bookId: string): ColozooBook | undefined {
  return COLOZOO_BOOKS.find((b) => b.id === bookId);
}

export function getPage(bookId: string, pageNumber: number): ColoringPage | undefined {
  return getBook(bookId)?.pages.find((p) => p.pageNumber === pageNumber);
}
