import { areas, crossings, furniture, height, roads, routes, trees, width } from './manchester-map.js';

export const WIDTH = width,
  HEIGHT = height;
const byId = new Map(roads.map((road) => [road.id, road]));

function segment(a, b) {
  const x = b[0] - a[0],
    y = b[1] - a[1];
  const length = Math.hypot(x, y);
  return { a, dx: x / length, dy: y / length, length };
}
function project(x, y, s) {
  return Math.max(0, Math.min(s.length, (x - s.a[0]) * s.dx + (y - s.a[1]) * s.dy));
}
const streetSegments = roads
  .filter((r) => r.name)
  .flatMap((road) =>
    road.points
      .slice(1)
      .map((p, i) => ({ ...segment(road.points[i], p), road }))
      .filter((s) => s.length),
  );
const gardens = areas.find((a) => a.kind === 'gardens').points;
function inGardens(x, y) {
  let inside = false;
  for (let i = 0, j = gardens.length - 1; i < gardens.length; j = i++) {
    const [a, b] = gardens[i],
      [c, d] = gardens[j];
    if (b > y !== d > y && x < ((c - a) * (y - b)) / (d - b) + a) inside = !inside;
  }
  return inside;
}
export function streetAt(x, y) {
  let best = Infinity,
    nearest;
  for (const s of streetSegments) {
    const along = project(x, y, s);
    const distance = (x - s.a[0] - along * s.dx) ** 2 + (y - s.a[1] - along * s.dy) ** 2;
    if (distance < best) {
      best = distance;
      nearest = s.road;
    }
  }
  if (best > (nearest.width / 2) ** 2 && inGardens(x, y)) return 'Piccadilly Gardens';
  return nearest.name;
}

// Traverse joined OSM ways in route order. Offset into the left lane of wider roads
// and round corners inside the junction so traffic changes heading over several ticks.
function makeCircuit(legs) {
  const vertices = [];
  for (const [id, first, last] of legs) {
    const road = byId.get(id),
      direction = Math.sign(last - first);
    for (let i = first; i !== last; i += direction) {
      const p = road.points[i],
        next = road.points[i + direction];
      if (p[0] !== next[0] || p[1] !== next[1]) vertices.push({ p, road });
    }
  }
  const edges = vertices.map(({ p }, i) => segment(p, vertices[(i + 1) % vertices.length].p));
  const lane = vertices.map(({ p, road }, i) => {
    const prev = (i + vertices.length - 1) % vertices.length;
    const offset = (r) =>
      r.oneway && r.width < 30 ? 0 : Math.min(9, r.width / 4, Math.max(2, r.width / 2 - 7));
    const a = edges[prev],
      b = edges[i];
    return [
      p[0] + (a.dy * offset(vertices[prev].road) + b.dy * offset(road)) / 2,
      p[1] - (a.dx * offset(vertices[prev].road) + b.dx * offset(road)) / 2,
    ];
  });
  const points = [];
  for (let i = 0; i < lane.length; i++) {
    const p = lane[i],
      prev = lane[(i + lane.length - 1) % lane.length],
      next = lane[(i + 1) % lane.length];
    const a = segment(prev, p),
      b = segment(p, next);
    const trim = Math.min(22, a.length * 0.45, b.length * 0.45);
    for (let j = 0; j <= 5; j++) {
      const t = j / 5;
      points.push([
        p[0] - (1 - t) ** 2 * trim * a.dx + t * t * trim * b.dx,
        p[1] - (1 - t) ** 2 * trim * a.dy + t * t * trim * b.dy,
      ]);
    }
  }
  let length = 0;
  const segments = points.map((p, i) => {
    const start = length,
      s = segment(p, points[(i + 1) % points.length]);
    length += s.length;
    return { ...s, start, end: length };
  });
  const wrap = (d) => ((d % length) + length) % length;
  function at(d) {
    let lo = 0,
      hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segments[mid].end <= d) lo = mid + 1;
      else hi = mid;
    }
    return segments[lo];
  }
  function pose(distance) {
    const d = wrap(distance),
      s = at(d);
    const look = at(wrap(d + 24));
    return {
      x: s.a[0] + (d - s.start) * s.dx,
      y: s.a[1] + (d - s.start) * s.dy,
      angle: Math.atan2(s.dy, s.dx),
      indicating: s.dx * look.dx + s.dy * look.dy < 0.97,
    };
  }
  function nearest(x, y) {
    let best = Infinity,
      d = 0;
    for (const s of segments) {
      const along = project(x, y, s);
      const distance = Math.hypot(x - s.a[0] - along * s.dx, y - s.a[1] - along * s.dy);
      if (distance < best) {
        d = s.start + along;
        best = distance;
      }
    }
    return d;
  }
  return { length, pose, nearest, points, wrap };
}

export const circuits = routes.map(makeCircuit);
export const circuit = circuits[0];
export const JUNCTION = circuit.pose(65);

// The checkpoint centres and widths come from the carriageway. Pick mid-block
// positions so the direction at each gate is unambiguous.
function roadPosition(id, fraction, first = 0, last = byId.get(id).points.length - 1) {
  const road = byId.get(id);
  const points = road.points.slice(Math.min(first, last), Math.max(first, last) + 1);
  if (first > last) points.reverse();
  const segments = points
    .slice(1)
    .map((p, i) => segment(points[i], p))
    .filter((s) => s.length);
  let d = segments.reduce((total, s) => total + s.length, 0) * fraction;
  for (const s of segments) {
    if (d <= s.length)
      return {
        x: s.a[0] + d * s.dx,
        y: s.a[1] + d * s.dy,
        dx: s.dx,
        dy: s.dy,
        angle: Math.atan2(s.dy, s.dx),
        halfWidth: road.width / 2,
        street: road.name,
      };
    d -= s.length;
  }
}
export const gates = [
  [1340157207, 0.55],
  [171879650, 0.5],
  [246124650, 0.5],
  [246124717, 0.5],
  [165381945, 0.47],
].map(([id, fraction]) => {
  const [, first, last] = routes[0].find(([way]) => way === id);
  return roadPosition(id, fraction, first, last);
});
for (const gate of gates) {
  const compass = [
    'east',
    'southeast',
    'south',
    'southwest',
    'west',
    'northwest',
    'north',
    'northeast',
  ];
  gate.direction = compass[(Math.round(Math.atan2(gate.dy, gate.dx) / (Math.PI / 4)) + 8) % 8];
}

const faradayLeg = routes[0].find(([id]) => id === 171879650);
const junction = byId.get(faradayLeg[0]).points[faradayLeg[1]];
export const faradayMerge = circuits.map((route) => route.nearest(...junction));

export const gridDistance = circuit.nearest(gates.at(-1).x, gates.at(-1).y);
export const spawns = [
  [165381945, 0.32],
  [165381945, 0.7],
  [165381945, 0.93],
  [1193719603, 0.55],
  [1050312118, 0.48],
  [1050312118, 0.75],
  [165381361, 0.5],
  [165381361, 0.72],
  [1095281941, 0.35],
  [1095281941, 0.7],
  [3650041, 0.3],
  [3650041, 0.7],
].map(([id, fraction]) => {
  const p = roadPosition(id, fraction);
  return [p.x - p.dy * (p.halfWidth - 3), p.y + p.dx * (p.halfWidth - 3), p.angle];
});

export const crosswalks = crossings.map(({ centre: [x, y], signal, walk }) => {
  const d = circuit.nearest(x, y),
    { angle } = circuit.pose(d);
  const half = Math.hypot(walk[0][0] - walk[1][0], walk[0][1] - walk[1][1]) / 2;
  return { x, y, angle, half, signal, stop: d - 16, walk };
});

export const signalPosts = crosswalks
  .filter((c) => c.signal)
  .flatMap((c) =>
    [-1, 1].map((side) => ({
      kind: 'signal',
      // Stand just behind the stop line, clear of the pedestrian approach.
      x: c.x - 19 * Math.cos(c.angle) - Math.sin(c.angle) * side * (c.half + 3),
      y: c.y - 19 * Math.sin(c.angle) + Math.cos(c.angle) * side * (c.half + 3),
      radius: 1.4,
    })),
  );

// Ground footprints in world pixels, centred on the sprite's base.
const footprints = {
  bench: { hx: 5, hy: 2 },
  planter: { hx: 4, hy: 3 },
  bollard: { radius: 1.2 },
  busStop: { radius: 1.25 },
  guidepost: { radius: 1.25 },
  bin: { radius: 2 },
  postBox: { radius: 2.5 },
};
export const streetObjects = [
  ...furniture.map((item) => ({ ...item, ...footprints[item.kind] })),
  ...trees.map(([x, y]) => {
    const seed = (Math.imul(x + y * WIDTH, 1664525) + 1013904223) >>> 0;
    const scale = 0.75 + (seed / 4294967296) * 0.4;
    return { kind: 'tree', x, y, radius: 2 * scale };
  }),
  ...signalPosts,
];
