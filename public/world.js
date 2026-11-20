// World coordinates are pixels, heading is measured clockwise from east.
import { WIDTH, HEIGHT, JUNCTION, circuit, gardens, zebra } from './streets.js';
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
export const buildings = [
  { x: 8, y: 30, w: 112, h: 192, brick: '#965c48', roof: '#73655d', name: 'MILL' },
  { x: 124, y: 64, w: 94, h: 158, brick: '#a46b53', roof: '#968073', name: 'RECORDS' },
  { x: 228, y: 88, w: 122, h: 134, brick: '#985845', roof: '#766963', name: 'OLDHAM ST' },
  { x: 449, y: 39, w: 141, h: 179, brick: '#985f49', roof: '#86776a', name: 'TEXTILE HOUSE' },
  { x: 596, y: 58, w: 189, h: 160, brick: '#ab7660', roof: '#8a7469', name: 'WAREHOUSE' },
  { x: 449, y: 345, w: 119, h: 177, brick: '#9a624a', roof: '#8c7768', name: 'COFFEE' },
  { x: 573, y: 345, w: 81, h: 150, brick: '#ac7662', roof: '#746765', name: 'BOOKS' },
  { x: 663, y: 345, w: 130, h: 179, brick: '#855a49', roof: '#867366', name: 'ARCADE' },
  { x: 9, y: 636, w: 121, h: 62, brick: '#ad7155', roof: '#807263', name: 'MARKET' },
  { x: 138, y: 642, w: 88, h: 56, brick: '#95604c', roof: '#776c65', name: 'FLORIST' },
  { x: 251, y: 637, w: 99, h: 62, brick: '#ab7659', roof: '#907b69', name: 'PARKER HOUSE' },
  { x: 457, y: 561, w: 131, h: 119, brick: '#966651', roof: '#716860', name: 'PORTLAND MILL' },
  { x: 601, y: 563, w: 181, h: 128, brick: '#ab725a', roof: '#897765', name: 'PRINT WORKS' },
];
export const spawns = [
  [321, 248, 0],
  [478, 313, Math.PI],
  [367, 364, -Math.PI / 2],
  [433, 181, Math.PI / 2],
  [258, 248, 0],
  [550, 313, Math.PI],
  [367, 423, -Math.PI / 2],
  [433, 128, Math.PI / 2],
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
const walls = buildings.map((b) => box(b.x + b.w / 2, b.y + b.h / 2, 0, b.w / 2, b.h / 2));
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
  for (const wall of walls) {
    const hit = contact(body, wall);
    if (hit) return hit;
  }
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
  for (const x of [310, 278, 246, 214]) {
    const slots = [262, 276].map((y) => ({ x, y, angle: 0 }));
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

const lanes = [
  { x: 0, y: 266, angle: 0, length: WIDTH, line: 354, signal: 'horizontal' },
  { x: WIDTH, y: 294, angle: Math.PI, length: WIDTH, line: 354, signal: 'horizontal' },
  {
    x: 386,
    y: HEIGHT,
    angle: -Math.PI / 2,
    length: HEIGHT,
    line: HEIGHT - (JUNCTION.y + 42),
    signal: 'vertical',
  },
  { x: 414, y: 0, angle: Math.PI / 2, length: HEIGHT, line: 226, signal: 'vertical' },
];
function onLane(lane, d) {
  return {
    x: lane.x + Math.cos(lane.angle) * d,
    y: lane.y + Math.sin(lane.angle) * d,
    angle: lane.angle,
  };
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
    if (car.lane === 'gardens' && leader.lane === 'gardens') {
      ahead = (leader.d - car.d + circuit.length) % circuit.length;
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
    const free = Math.max(0, ahead - body.hx - radius(other, body.ux, body.uy) - standstillGap);
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
const oldhamCrossingRoute = 0,
  parkerCrossingRoute = 7;
const walks = [
  [
    [359, 242],
    [441, 242],
    [518, 238],
    [441, 242],
    [359, 242],
    [284, 238],
  ],
  [
    [348, 321],
    [271, 321],
    [241, 347],
    [271, 321],
  ],
  [
    [443, 327],
    [517, 327],
    [569, 333],
    [517, 327],
  ],
  [
    [351, 210],
    [359, 153],
    [358, 81],
    [359, 153],
  ],
  [
    [340, 235],
    [251, 235],
    [198, 240],
    [251, 235],
  ],
  [
    [444, 202],
    [438, 145],
    [441, 99],
    [438, 145],
  ],
  [
    [310, 383],
    [251, 383],
    [251, 441],
    [310, 441],
  ],
  [
    [zebra.x, gardens.south - 39],
    [zebra.x, gardens.south + 39],
    [291, gardens.south + 39],
    [zebra.x, gardens.south + 39],
    [zebra.x, gardens.south - 39],
    [185, gardens.south - 39],
  ],
];

export function createWorld() {
  const traffic = lanes.flatMap((lane, i) =>
    [0, 1].map((slot) => {
      const d = slot === 0 ? 44 + i * 18 : lane.length - 92 - i * 11;
      return {
        id: 't' + i + slot,
        lane: i,
        d,
        ...onLane(lane, d),
        speed: 0,
        rearLights: 'tail',
        color: COLORS[(i * 2 + slot + 1) % 8],
      };
    }),
  );
  for (const [index, d] of [165, circuit.crossing - 64, circuit.lights - 104].entries()) {
    traffic.push({
      id: 'loop' + index,
      lane: 'gardens',
      d,
      ...circuit.pose(d),
      speed: 0,
      rearLights: 'tail',
      color: COLORS[index * 2],
    });
  }
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
        !walls.some((w) => overlap(bounds, w)) &&
        !vehicles.some((v) => overlap(bounds, vehicleBox(v)))
      ) {
        Object.assign(p, next);
        continue;
      }
    }
    const route = walks[p.route],
      [tx, ty] = route[p.next];
    const crossLeg = p.next === 1 || p.next === 4;
    const crosses =
      (p.route === oldhamCrossingRoute || p.route === parkerCrossingRoute) && crossLeg;
    if (p.route === oldhamCrossingRoute && crosses && !p.crossing && !lights.walk) continue;
    const dx = tx - p.x,
      dy = ty - p.y,
      distance = Math.hypot(dx, dy);
    const move = Math.min(distance, (crosses ? 29 : 11 + p.route) * dt);
    const next = { x: p.x + (dx * move) / (distance || 1), y: p.y + (dy * move) / (distance || 1) };
    if (vehicles.some((v) => overlap(personBox(next), vehicleBox(v)))) continue;
    Object.assign(p, next);
    p.crossing = crosses;
    if (distance <= move) {
      p.next = (p.next + 1) % route.length;
      p.crossing = false;
    }
  }

  for (const car of world.traffic) {
    const lane = lanes[car.lane];
    const following = followTraffic(car, vehicles, lane ? 38 + car.lane * 2 : 40);
    let stop = Infinity;
    if (lane) {
      const wait =
        lights[lane.signal] !== 'green' ||
        (car.lane >= 2 && world.people.some((p) => p.route === oldhamCrossingRoute && p.crossing));
      if (wait && car.d <= lane.line) stop = lane.line;
    } else {
      if (
        car.d <= circuit.crossing &&
        world.people.some(
          (p) => p.route === parkerCrossingRoute && (p.crossing || p.next === 1 || p.next === 4),
        )
      )
        stop = circuit.crossing;
      // Traffic already travelling north on Portland Street has priority at the merge.
      if (
        car.d <= circuit.merge &&
        vehicles.some(
          (v) =>
            v.id !== car.id &&
            Math.abs(v.x - (gardens.east - 14)) < 10 &&
            v.y > gardens.south - 4 &&
            v.y < gardens.south + 86 &&
            -Math.sin(v.angle) * v.speed > 1,
        )
      )
        stop = Math.min(stop, circuit.merge);
      if (car.d <= circuit.lights && lights.vertical !== 'green')
        stop = Math.min(stop, circuit.lights);
    }
    const free = Math.min(following.travel, stop - car.d);
    const target = Math.min(following.limit, Math.sqrt(2 * trafficBraking * free));
    const speed = Math.max(car.speed - trafficBraking * dt, Math.min(car.speed + 42 * dt, target));
    const travel = Math.min(free, speed * dt);
    const nextSpeed = travel / dt;
    car.rearLights = free < 0.001 || nextSpeed < car.speed - 0.001 ? 'brake' : 'tail';
    dampSlide(car, dt);
    const slideX = (car.slideX || 0) * dt,
      slideY = (car.slideY || 0) * dt;
    const ux = Math.cos(car.angle),
      uy = Math.sin(car.angle);
    const along = slideX * ux + slideY * uy;
    let d = car.d + travel + along;
    const poseAt = (distance) => (lane ? onLane(lane, distance) : circuit.pose(distance));
    if (lane && d > lane.length + 14) {
      const entry = { ...car, ...poseAt(-14), d: -14, speed: 0, slideX: 0, slideY: 0 };
      if (
        !obstacle(entry, vehicles, world.people, false) &&
        followTraffic(entry, vehicles, 40).travel > 0
      )
        Object.assign(car, entry);
      else car.speed = 0;
      continue;
    }
    if (!lane) d = d < 0 ? (d + circuit.length) % circuit.length : d % circuit.length;
    const origin = poseAt(car.d),
      next = poseAt(d);
    // Fold longitudinal impact travel into route progress. Steer lateral displacement
    // back onto the lane gradually so a side impact survives the next AI update.
    const recovery = Math.exp(-1.4 * dt);
    next.x += (car.x - origin.x) * recovery + slideX - along * ux;
    next.y += (car.y - origin.y) * recovery + slideY - along * uy;
    moveCar(car, { ...car, ...next, d, speed: nextSpeed }, dt, vehicles, world.people, !lane, true);
  }
}
