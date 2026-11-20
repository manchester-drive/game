// World coordinates are pixels, heading is measured clockwise from east.
import {
  WIDTH,
  HEIGHT,
  circuits,
  circuit,
  crosswalks,
  faradayMerge,
  gridDistance,
  spawns,
} from './streets.js';
import { buildings, garden_walks as gardenWalks } from './manchester-map.js';
import { checkGate, heldOnGrid } from './race.js';
export { WIDTH, HEIGHT, JUNCTION } from './streets.js';
export const COLORS = [
  '#51ccc2',
  '#f2ba52',
  '#ef8264',
  '#8ba9e4',
  '#c188bf',
  '#b0c981',
  '#ddd8be',
  '#e596b3',
];
export function signals(time) {
  const t = time % 24;
  const horizontal = t < 7 ? 'green' : t < 9 ? 'amber' : 'red';
  const vertical = t >= 10 && t < 17 ? 'green' : t >= 17 && t < 19 ? 'amber' : 'red';
  return { horizontal, vertical, walk: t >= 20 && t < 20.8 };
}

function box(x, y, angle, hx, hy) {
  return { x, y, ux: Math.cos(angle), uy: Math.sin(angle), hx, hy };
}
function vehicleBox(v) {
  return box(v.x, v.y, v.angle, 9.5, 4.8);
}
function personBox(p) {
  return box(p.x, p.y, 0, 2.2, 2.2);
}
// Index footprint edges, including courtyards, once for both prediction and the server.
const cells = new Map();
const cellKey = (x, y) => x + ',' + y;
for (const { rings } of buildings) {
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = ring[i],
        [ex, ey] = ring[(i + 1) % ring.length];
      const length = Math.hypot(ex - x, ey - y);
      if (!length) continue;
      const wall = box((x + ex) / 2, (y + ey) / 2, Math.atan2(ey - y, ex - x), length / 2, 0.35);
      // A car's corner is at most 11 pixels from its centre.
      for (
        let cx = Math.floor((Math.min(x, ex) - 12) / 64);
        cx <= (Math.max(x, ex) + 12) / 64;
        cx++
      ) {
        for (
          let cy = Math.floor((Math.min(y, ey) - 12) / 64);
          cy <= (Math.max(y, ey) + 12) / 64;
          cy++
        ) {
          const key = cellKey(cx, cy);
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(wall);
        }
      }
    }
  }
}
function wallContact(body) {
  const walls = cells.get(cellKey(Math.floor(body.x / 64), Math.floor(body.y / 64))) ?? [];
  for (const wall of walls) {
    const hit = contact(body, wall);
    if (hit) return hit;
  }
  return null;
}
function radius(b, x, y) {
  return Math.abs(x * b.ux + y * b.uy) * b.hx + Math.abs(y * b.ux - x * b.uy) * b.hy;
}
// The shallowest separating axis gives the direction of a contact impulse.
function contact(a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  let minimum = Infinity,
    nx = 0,
    ny = 0;
  for (const [x, y] of [
    [a.ux, a.uy],
    [-a.uy, a.ux],
    [b.ux, b.uy],
    [-b.uy, b.ux],
  ]) {
    const side = dx * x + dy * y;
    const depth = radius(a, x, y) + radius(b, x, y) - Math.abs(side);
    if (depth <= 0) return null;
    if (depth < minimum) {
      minimum = depth;
      const sign = side < 0 ? -1 : 1;
      nx = x * sign;
      ny = y * sign;
    }
  }
  return { nx, ny };
}
function overlap(a, b) {
  return contact(a, b) !== null;
}
function obstacle(v, vehicles, people, bounded) {
  const body = vehicleBox(v);
  if (bounded) {
    const rx = radius(body, 1, 0),
      ry = radius(body, 0, 1);
    if (v.x < rx) return { nx: -1, ny: 0 };
    if (v.x > WIDTH - rx) return { nx: 1, ny: 0 };
    if (v.y < ry) return { nx: 0, ny: -1 };
    if (v.y > HEIGHT - ry) return { nx: 0, ny: 1 };
  }
  const wall = wallContact(body);
  if (wall) return wall;
  for (const other of vehicles) {
    if (other.id === v.id) continue;
    const hit = contact(body, vehicleBox(other));
    if (hit) return { ...hit, other };
  }
  for (const person of people) {
    const hit = contact(body, personBox(person));
    if (hit) return { ...hit, person };
  }
  return null;
}
function velocity(car) {
  return {
    x: car.speed * Math.cos(car.angle) + (car.slideX || 0),
    y: car.speed * Math.sin(car.angle) + (car.slideY || 0),
  };
}
function setVelocity(car, x, y) {
  // Tyres regain grip after a sideways hit. NPC route control resumes after the shove.
  const ux = Math.cos(car.angle),
    uy = Math.sin(car.angle);
  car.speed = car.lane === undefined ? x * ux + y * uy : 0;
  car.slideX = x - car.speed * ux;
  car.slideY = y - car.speed * uy;
}
function dampSlide(car, dt) {
  if (!car.slideX && !car.slideY) return;
  const grip = Math.exp(-3.2 * dt);
  car.slideX *= grip;
  car.slideY *= grip;
  if (Math.hypot(car.slideX, car.slideY) < 0.08) car.slideX = car.slideY = 0;
}
function moveCar(car, next, dt, vehicles, people, bounded, transferImpulse) {
  const hit = obstacle(next, vehicles, people, bounded);
  if (!hit) {
    Object.assign(car, next);
    return;
  }
  if (hit.person) {
    setVelocity(car, 0, 0);
    if (car.lane !== undefined) car.rearLights = 'brake';
    return;
  }

  const vx = (next.x - car.x) / dt,
    vy = (next.y - car.y) / dt;
  const target = hit.other ? velocity(hit.other) : { x: 0, y: 0 };
  const closing = (vx - target.x) * hit.nx + (vy - target.y) * hit.ny;
  if (closing <= 0) {
    car.speed = next.speed;
    return;
  }
  // Equal-mass vehicles share the impulse. Masonry absorbs it without moving.
  const restitution = closing > 10 ? 0.24 : 0;
  const impulse = (closing * (1 + restitution)) / (hit.other ? 2 : 1);
  const ix = impulse * hit.nx,
    iy = impulse * hit.ny;
  if (hit.other && transferImpulse) setVelocity(hit.other, target.x + ix, target.y + iy);
  const grip = hit.other ? 1 : 0.88;
  const outX = (vx - ix) * grip,
    outY = (vy - iy) * grip;
  setVelocity(car, outX, outY);
  const slide = { ...car, x: car.x + outX * dt, y: car.y + outY * dt };
  if (!obstacle(slide, vehicles, people, bounded)) Object.assign(car, slide);
}

export function findRaceGrid(world, racers) {
  const traffic = [
    ...world.traffic,
    ...world.players.filter((p) => !racers.some((r) => r.id === p.id)),
  ];
  for (const gap of [6, 30, 54, 78]) {
    const slots = [gap, gap + 24].map((back) => circuit.pose(gridDistance - back));
    if (slots.every((slot) => !obstacle(slot, traffic, world.people, true))) return slots;
  }
  return null;
}

export function placePlayer(id, name, color, world) {
  const vehicles = [...world.players, ...world.traffic];
  for (const [x, y, angle] of spawns) {
    const v = { id, name, color, x, y, angle, speed: 0, rearLights: 'tail' };
    if (!obstacle(v, vehicles, world.people, true)) return v;
  }
  return null;
}

export function drive(car, keys, dt, vehicles, people, transferImpulse = true) {
  if (dt <= 0) return car;
  dampSlide(car, dt);
  // Bits: W 1, S 2, A 4, D 8. Crossing zero under braking consumes a step.
  const pedal = Number(!!(keys & 1)) - Number(!!(keys & 2));
  let speed = car.speed;
  const braking = pedal * speed < 0;
  if (!pedal) speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - 30 * dt);
  else if (braking) speed = Math.sign(speed) * Math.max(0, Math.abs(speed) - 180 * dt);
  else speed = Math.min(128, Math.max(-48, speed + pedal * (pedal > 0 ? 80 : 56) * dt));
  const steer = Number(!!(keys & 8)) - Number(!!(keys & 4));
  const angle = car.angle + steer * Math.sign(speed) * Math.min(Math.abs(speed) / 22, 2.45) * dt;
  const dx = (Math.cos(angle) * speed + (car.slideX || 0)) * dt;
  const dy = (Math.sin(angle) * speed + (car.slideY || 0)) * dt;
  moveCar(
    car,
    { ...car, x: car.x + dx, y: car.y + dy, angle, speed },
    dt,
    vehicles,
    people,
    true,
    transferImpulse,
  );
  if (braking) car.rearLights = 'brake';
  else if (car.speed < 0 && (pedal < 0 || car.rearLights === 'reverse')) car.rearLights = 'reverse';
  else car.rearLights = 'tail';
  return car;
}

// Leave daylight between bumpers, with extra headway when the queue is moving.
const standstillGap = 12,
  headway = 0.65,
  trafficBraking = 64;
function followTraffic(car, vehicles, limit) {
  const body = vehicleBox(car);
  let travel = Infinity;
  for (const leader of vehicles) {
    if (leader.id === car.id) continue;
    const other = vehicleBox(leader);
    const dx = leader.x - car.x,
      dy = leader.y - car.y;
    if (Math.abs(dx) > 110 || Math.abs(dy) > 110) continue;
    let ahead = dx * body.ux + dy * body.uy;
    const sameRoute = car.lane === leader.lane;
    if (sameRoute) {
      ahead = circuits[car.lane].wrap(leader.d - car.d);
      if (ahead > 110) continue;
    } else {
      if (
        ahead <= 0 ||
        Math.abs(dx * body.uy - dy * body.ux) >= body.hy + radius(other, -body.uy, body.ux)
      )
        continue;
      // Cross traffic follows junction priority; it is not a leader in this lane.
      if (leader.lane !== undefined && body.ux * other.ux + body.uy * other.uy < 0.7) continue;
    }
    const leaderLength = sameRoute ? other.hx : radius(other, body.ux, body.uy);
    const free = Math.max(0, ahead - body.hx - leaderLength - standstillGap);
    const v = velocity(leader);
    const leadSpeed = Math.max(0, v.x * body.ux + v.y * body.uy);
    travel = Math.min(travel, free);
    limit = Math.min(
      limit,
      Math.sqrt(leadSpeed ** 2 + 2 * trafficBraking * free),
      4 + free / headway,
    );
  }
  return { travel, limit };
}
// Walkers cross at mapped crossing nodes. Other pedestrians follow the paths in the gardens.
const walks = [
  ...crosswalks.map((c) => c.walk),
  ...gardenWalks.map((points) => [...points, ...points.slice(1, -1).reverse()]),
];
const stops = circuits.map((route) =>
  crosswalks.flatMap((crossing, index) => {
    const d = route.nearest(crossing.x, crossing.y),
      p = route.pose(d);
    if (Math.hypot(p.x - crossing.x, p.y - crossing.y) > crossing.half) return [];
    return [{ d: d - 16, index }];
  }),
);
export function createWorld() {
  const traffic = circuits.flatMap((route, lane) => {
    const count = lane === 0 ? 8 : 3;
    return Array.from({ length: count }, (_, i) => {
      const d = (route.length * (i + 0.65)) / count;
      return {
        id: 't' + lane + '-' + i,
        lane,
        d,
        ...route.pose(d),
        speed: 0,
        rearLights: 'tail',
        color: COLORS[(i + lane) % COLORS.length],
      };
    });
  });
  const people = walks.map((route, i) => ({
    id: 'p' + i,
    route: i,
    next: 1,
    x: route[0][0],
    y: route[0][1],
    crossing: false,
    color: COLORS[(i + 2) % 8],
  }));
  return { time: 0, players: [], traffic, people, race: null };
}

export function step(world, inputs, dt) {
  const tickStart = world.time;
  world.time += dt;
  if (world.race?.phase === 'countdown' && tickStart >= world.race.startAt)
    world.race.phase = 'racing';
  const lights = signals(world.time),
    vehicles = [...world.players, ...world.traffic];
  for (const car of world.players) {
    if (heldOnGrid(world.race, car.id)) {
      car.speed = car.slideX = car.slideY = 0;
      continue;
    }
    const { x, y } = car;
    drive(car, inputs.get(car.id) ?? 0, dt, vehicles, world.people);
    checkGate(world.race, car, x, y, tickStart, dt);
  }

  for (const p of world.people) {
    // Give a driver room to pass after contact, even when the walker is
    // waiting for the crossing signal. Move towards the nearer side of the car.
    const approaching = world.players.find((car) => {
      const keys = inputs.get(car.id) ?? 0;
      const pedal = Number(!!(keys & 1)) - Number(!!(keys & 2));
      if (!pedal) return false;
      return overlap(
        personBox(p),
        vehicleBox({
          ...car,
          x: car.x + Math.cos(car.angle) * pedal * 1.6,
          y: car.y + Math.sin(car.angle) * pedal * 1.6,
        }),
      );
    });
    if (approaching) {
      const nx = -Math.sin(approaching.angle),
        ny = Math.cos(approaching.angle);
      const side = (p.x - approaching.x) * nx + (p.y - approaching.y) * ny < 0 ? -1 : 1;
      const next = { x: p.x + nx * side * 20 * dt, y: p.y + ny * side * 20 * dt };
      const bounds = personBox(next);
      if (
        next.x >= 3 &&
        next.y >= 3 &&
        next.x <= WIDTH - 3 &&
        next.y <= HEIGHT - 3 &&
        !wallContact(bounds) &&
        !vehicles.some((v) => overlap(bounds, vehicleBox(v)))
      ) {
        Object.assign(p, next);
        continue;
      }
    }
    const route = walks[p.route],
      [tx, ty] = route[p.next];
    const crossLeg = p.next === 1 || p.next === 4;
    const crossing = crosswalks[p.route];
    const crosses = !!crossing && crossLeg;
    if (crossing?.signal && crosses && !p.crossing && !lights.walk) continue;
    const dx = tx - p.x,
      dy = ty - p.y,
      distance = Math.hypot(dx, dy);
    const move = Math.min(distance, (crosses ? 29 : 11 + p.route) * dt);
    const next = { x: p.x + (dx * move) / (distance || 1), y: p.y + (dy * move) / (distance || 1) };
    if (
      wallContact(personBox(next)) ||
      vehicles.some((v) => overlap(personBox(next), vehicleBox(v)))
    )
      continue;
    Object.assign(p, next);
    p.crossing = crosses;
    if (distance <= move) {
      p.next = (p.next + 1) % route.length;
      p.crossing = false;
    }
  }

  for (const car of world.traffic) {
    const route = circuits[car.lane];
    const following = followTraffic(car, vehicles, 40);
    let free = following.travel;
    for (const stop of stops[car.lane]) {
      const crossing = crosswalks[stop.index];
      const occupied = world.people.some(
        (p) =>
          p.route === stop.index &&
          (p.crossing || (!crossing.signal && (p.next === 1 || p.next === 4))),
      );
      if (occupied || (crossing.signal && lights.vertical !== 'green')) {
        const distance = stop.d - car.d;
        if (distance >= -1e-7) free = Math.min(free, Math.max(0, distance));
      }
    }
    // Give way when turning off Lever to traffic already on Faraday Street.
    if (
      car.lane === 0 &&
      world.traffic.some(
        (other) => other.lane === 1 && circuits[1].wrap(faradayMerge[1] - other.d + 16) < 80,
      )
    ) {
      const distance = faradayMerge[0] - 26 - car.d;
      if (distance >= 0) free = Math.min(free, distance);
    }
    const target = Math.min(following.limit, Math.sqrt(2 * trafficBraking * free));
    const speed = Math.max(car.speed - trafficBraking * dt, Math.min(car.speed + 42 * dt, target));
    const travel = free < 1e-7 ? 0 : Math.min(free, speed * dt);
    const nextSpeed = travel / dt;
    car.rearLights = free < 0.001 || nextSpeed < car.speed - 0.001 ? 'brake' : 'tail';
    dampSlide(car, dt);
    const slideX = (car.slideX || 0) * dt,
      slideY = (car.slideY || 0) * dt;
    const ux = Math.cos(car.angle),
      uy = Math.sin(car.angle);
    const along = slideX * ux + slideY * uy;
    const d = route.wrap(car.d + travel + along);
    const origin = route.pose(car.d),
      next = route.pose(d);
    // Fold longitudinal impact travel into route progress. Steer lateral displacement
    // back onto the lane gradually so a side impact survives the next AI update.
    const recovery = Math.exp(-1.4 * dt);
    next.x += (car.x - origin.x) * recovery + slideX - along * ux;
    next.y += (car.y - origin.y) * recovery + slideY - along * uy;
    moveCar(car, { ...car, ...next, d, speed: nextSpeed }, dt, vehicles, world.people, true, true);
  }
}
