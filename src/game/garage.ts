// Dimensions are half-extents in world pixels. Speeds are pixels per second.
// Handling stays tied to the model so races stay fair; liveries are cosmetic.
interface Model {
  name: string;
  kind: 'car' | 'van';
  // Starter models can be a player's free first vehicle.
  starter: boolean;
  price?: number;
  length: number;
  width: number;
  topSpeed: number;
  acceleration: number;
  turn: number;
}
export const models = {
  hatch: {
    name: 'Hatchback',
    kind: 'car',
    starter: true,
    length: 9.5,
    width: 4.8,
    topSpeed: 128,
    acceleration: 80,
    turn: 2.45,
  },
  coupe: {
    name: 'Sports coupé',
    kind: 'car',
    starter: false,
    price: 12000,
    length: 10,
    width: 4.8,
    topSpeed: 154,
    acceleration: 98,
    turn: 2.65,
  },
  van: {
    name: 'Panel van',
    kind: 'van',
    starter: true,
    length: 11,
    width: 5.2,
    topSpeed: 104,
    acceleration: 62,
    turn: 1.95,
  },
} satisfies Record<string, Model>;
export type ModelKey = keyof typeof models;
export const starterModels = (Object.keys(models) as ModelKey[]).filter(
  (key) => models[key].starter,
);

export const paints = {
  teal: '#51ccc2',
  amber: '#f2ba52',
  coral: '#ef8264',
  sky: '#8ba9e4',
  orchid: '#c188bf',
  sage: '#b0c981',
  cream: '#ddd8be',
  rose: '#e596b3',
  crimson: '#c0403c',
  racing: '#2f7351',
  graphite: '#4a5257',
  snow: '#eeeee6',
};
// An empty colour leaves that part in the paint colour.
export const trims = { body: '', black: '#252b2d', white: '#efefe8', silver: '#a9b1b3' };
export const stripes = { none: '', white: '#f4f1e4', black: '#232729', gold: '#e2bb52', red: '#c63a35' };
export const plateLength = 7;

export interface Livery {
  model: ModelKey;
  paint: keyof typeof paints;
  trim: keyof typeof trims;
  stripe: keyof typeof stripes;
  plate: string;
}

export const figures = { feminine: 'Feminine', masculine: 'Masculine' };
export const hairStyles = { short: 'Short', long: 'Long', ponytail: 'Ponytail', bun: 'Bun' };
export const hairColours = {
  black: '#2a2420',
  brown: '#453b35',
  auburn: '#7d3f25',
  blonde: '#d4b26a',
  grey: '#9b968c',
};
export const jackets = {
  teal: '#48b5a9',
  mustard: '#edba55',
  plum: '#ba81bd',
  brick: '#d96c58',
  navy: '#3f5a8a',
  forest: '#4f7a4a',
};
export const skinTones = { light: '#edc2a1', tan: '#c48b63', brown: '#935e42', deep: '#684231' };
// A skirt draws a wider outline over the legs instead of two trouser legs.
export const trousers = {
  charcoal: { name: 'Charcoal trousers', colour: '#29363a', cut: 'trousers' },
  denim: { name: 'Denim', colour: '#3c5878', cut: 'trousers' },
  khaki: { name: 'Khaki trousers', colour: '#7c7454', cut: 'trousers' },
  blackSkirt: { name: 'Black skirt', colour: '#25222a', cut: 'skirt' },
  redSkirt: { name: 'Red skirt', colour: '#9c3a3a', cut: 'skirt' },
} as const;

export interface Character {
  figure: keyof typeof figures;
  skin: keyof typeof skinTones;
  hairStyle: keyof typeof hairStyles;
  hair: keyof typeof hairColours;
  jacket: keyof typeof jackets;
  trousers: keyof typeof trousers;
}
export interface Appearance extends Character {
  model: ModelKey;
}
export type GarageOptions = Partial<Record<keyof Appearance, unknown>>;

function choice<T extends object>(palette: T, key: unknown, fallback: keyof T): keyof T {
  return typeof key === 'string' && Object.hasOwn(palette, key) ? (key as keyof T) : fallback;
}

// Unknown or missing keys fall back to defaults, so stored or sent looks always render.
export function character(options: GarageOptions = {}): Character {
  return {
    figure: choice(figures, options.figure, 'masculine'),
    skin: choice(skinTones, options.skin, 'tan'),
    hairStyle: choice(hairStyles, options.hairStyle, 'short'),
    hair: choice(hairColours, options.hair, 'brown'),
    jacket: choice(jackets, options.jacket, 'teal'),
    trousers: choice(trousers, options.trousers, 'charcoal'),
  };
}

// Plates show on name tags, so keep them short and plain: A–Z, 0–9 and single spaces.
export function plate(text: unknown) {
  if (typeof text !== 'string') return '';
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/ +/g, ' ')
    .trim()
    .slice(0, plateLength)
    .trim();
}

export function livery(options: Partial<Record<keyof Livery, unknown>> = {}): Livery {
  return {
    model: choice(models, options.model, 'hatch'),
    paint: choice(paints, options.paint, 'teal'),
    trim: choice(trims, options.trim, 'body'),
    stripe: choice(stripes, options.stripe, 'none'),
    plate: plate(options.plate),
  };
}

// The colours a vehicle carries in snapshots, so renderers need no palette lookups.
export function liveryColours({ paint, trim, stripe, plate }: Livery) {
  return {
    color: paints[paint],
    ...(trims[trim] && { roof: trims[trim] }),
    ...(stripes[stripe] && { stripe: stripes[stripe] }),
    ...(plate && { plate }),
  };
}

export function appearance(options: GarageOptions = {}): Appearance {
  return { model: choice(models, options.model, 'hatch'), ...character(options) };
}
