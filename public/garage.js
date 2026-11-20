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
export const jackets = { teal: '#48b5a9', mustard: '#edba55', plum: '#ba81bd', brick: '#d96c58' };
export const skinTones = { light: '#edc2a1', tan: '#c48b63', brown: '#935e42', deep: '#684231' };

export function appearance(options = {}) {
  function choice(palette, key, fallback) {
    return typeof key === 'string' && Object.hasOwn(palette, key) ? key : fallback;
  }
  return {
    model: choice(models, options.model, 'hatch'),
    jacket: choice(jackets, options.jacket, 'teal'),
    skin: choice(skinTones, options.skin, 'tan'),
  };
}
