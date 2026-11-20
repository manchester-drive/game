// A compressed street plan with the original Oldham Street crossing at its north-east corner.
export const WIDTH = 800,
  HEIGHT = 700;
export const gardens = { west: 48, east: 400, north: 280, south: 588 };
const { west, east, north, south } = gardens;
export const JUNCTION = { x: east, y: north };
export const zebra = { x: 237, y: south };
export const corners = [
  [west, north],
  [east, north],
  [west, south],
  [east, south],
];
export const streets = [
  { name: 'Piccadilly', x: 0, y: north, length: WIDTH, vertical: false },
  { name: 'Oldham Street', x: east, y: 0, length: north, vertical: true },
  { name: 'Portland Street', x: east, y: north, length: HEIGHT - north, vertical: true },
  { name: 'Mosley Street', x: west, y: north, length: south - north, vertical: true },
  { name: 'Parker Street', x: west, y: south, length: east - west, vertical: false },
];
export function streetAt(x, y) {
  let nearest = streets[0],
    best = Infinity;
  for (const street of streets) {
    const along = street.vertical ? y - street.y : x - street.x;
    const across = street.vertical ? x - street.x : y - street.y;
    const distance = across * across + Math.max(-along, 0, along - street.length) ** 2;
    if (distance < best) {
      nearest = street;
      best = distance;
    }
  }
  return best > 48 ** 2 ? 'Piccadilly Gardens' : nearest.name;
}

// Distance along the circulating left-hand lane. Each straight ends in a quarter circle.
const radius = 22,
  turnLength = (radius * Math.PI) / 2,
  offset = 14;
const left = west + offset,
  right = east - offset,
  top = north + offset,
  bottom = south - offset;
let length = 0;
const legs = [
  [right - radius, top, -1, 0, right - left - 2 * radius],
  [left, top + radius, 0, 1, bottom - top - 2 * radius],
  [left + radius, bottom, 1, 0, right - left - 2 * radius],
  [right, bottom - radius, 0, -1, bottom - top - 2 * radius],
].map(([x, y, dx, dy, straight]) => {
  const start = length;
  length += straight + turnLength;
  return { x, y, dx, dy, straight, start, end: length };
});
export const circuit = {
  length,
  crossing: legs[2].start + zebra.x - 20 - legs[2].x,
  merge: legs[2].start + east - 48 - legs[2].x,
  lights: legs[3].start + legs[3].y - (north + 42),
  pose(d) {
    const leg = legs.find((l) => d < l.end) ?? legs[0];
    const along = d - leg.start,
      straight = Math.min(along, leg.straight);
    const turn = Math.max(0, along - leg.straight) / radius;
    const forward = straight + radius * Math.sin(turn);
    const inward = radius * (1 - Math.cos(turn));
    return {
      x: leg.x + leg.dx * forward + leg.dy * inward,
      y: leg.y + leg.dy * forward - leg.dx * inward,
      angle: Math.atan2(leg.dy, leg.dx) - turn,
      indicating: along >= leg.straight - 48,
    };
  },
};
