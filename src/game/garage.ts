// Dimensions are half-extents in world pixels. Speeds are pixels per second.
export const models = {
  hatch: {
    name: 'Hatchback',
    length: 9.5,
    width: 4.8,
    topSpeed: 128,
    acceleration: 80,
    turn: 2.45,
  },
  coupe: {
    name: 'Sports coupé',
    length: 10,
    width: 4.8,
    topSpeed: 154,
    acceleration: 98,
    turn: 2.65,
  },
  van: { name: 'Panel van', length: 11, width: 5.2, topSpeed: 104, acceleration: 62, turn: 1.95 },
};
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
  model: keyof typeof models;
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

export function appearance(options: GarageOptions = {}): Appearance {
  return { model: choice(models, options.model, 'hatch'), ...character(options) };
}
