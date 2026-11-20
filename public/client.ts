import type { Credentials, Player, Position, World } from './game-types';
import type { Commands } from './protocol';
import { gates, heldOnGrid, raceEntry } from './race';
import { HEIGHT, WIDTH, streetAt } from './streets';
import { drawGarage, makeRenderer, viewport } from './art';
import { createWorld, drive, walk, roadUsers, JUNCTION } from './world';

import { appearance, models, jackets, skinTones } from './garage';

function el(id: 'bee' | 'map' | 'garage-preview'): HTMLCanvasElement;
function el(id: 'model' | 'jacket' | 'skin'): HTMLSelectElement;
function el(id: 'name'): HTMLInputElement;
function el(id: 'camera' | 'door' | 'start' | 'race-action'): HTMLButtonElement;
function el(id: string): HTMLElement;
function el(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error('Missing game element ' + id);
  return element;
}
const map = el('map');
const render = makeRenderer(map),
  initial = createWorld();
const keyBits: Record<string, number> = { KeyW: 1, KeyS: 2, KeyA: 4, KeyD: 8 };
let session: Credentials | null = null,
  sequence = 0,
  keyboard = 0,
  touch = 0,
  busy = false;
let frames: { state: World; now: number }[] = [],
  predicted: Player | null = null,
  connected = false;
let freeCam = false;
const panKeys = new Set<string>();
const panDirections: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
let drag: { id: number; x: number; y: number } | null = null;
let focus = { ...JUNCTION },
  lastDraw = performance.now();
const bee = el('bee').getContext('2d')!;
const sprite = [
  '..ww..ww.......',
  '..wWwwWw.......',
  '...wwww........',
  '..yy.bbyybb....',
  '.yyy.bbyybb.yy.',
  'yyyy.bbyybb.yby',
  '.yyy.bbyybb.yy.',
  '..yy.bbyybb....',
  '....b..b..b....',
  '...bb..b..bb...',
];
const beeColors: Record<string, string> = {
  w: '#a3b8ac',
  W: '#e3e8d5',
  y: '#f5c66c',
  b: '#6b6953',
};
for (let y = 0; y < sprite.length; y++)
  for (let x = 0; x < sprite[y].length; x++) {
    const c = beeColors[sprite[y][x]];
    if (c) {
      bee.fillStyle = c;
      bee.fillRect(x + 4, y + 5, 1, 1);
    }
  }

for (const [id, palette] of [
  ['model', models],
  ['jacket', jackets],
  ['skin', skinTones],
] as const) {
  for (const [key, value] of Object.entries(palette)) {
    el(id).add(
      new Option(typeof value === 'string' ? key[0].toUpperCase() + key.slice(1) : value.name, key),
    );
  }
  el(id).onchange = refreshPreview;
}
function outfit() {
  return appearance({
    model: el('model').value,
    jacket: el('jacket').value,
    skin: el('skin').value,
  });
}
function refreshPreview() {
  drawGarage(el('garage-preview'), outfit());
}
el('skin').value = 'tan';
refreshPreview();

function notice(message: string) {
  el('notice').textContent = message;
  el('notice').hidden = !message;
}
const walkingButtons: Record<number, [string, string]> = {
  1: ['▲', 'Walk north'],
  2: ['▼', 'Walk south'],
  4: ['◀', 'Walk west'],
  8: ['▶', 'Walk east'],
};
const drivingButtons: Record<number, [string, string]> = {
  1: ['W', 'Accelerate'],
  2: ['S', 'Brake or reverse'],
  4: ['◀', 'Steer left'],
  8: ['▶', 'Steer right'],
};
let doorBusy = false;
function updateUI() {
  const onFoot = !!predicted?.parkedCar;
  el('join').hidden = !!session || freeCam;
  el('dash').hidden = !session || freeCam;
  el('touch').hidden = !session || freeCam;
  el('camera').textContent = freeCam
    ? session
      ? onFoot
        ? 'Return to player'
        : 'Return to car'
      : 'Back to start'
    : 'Free cam';
  el('camera').disabled = busy;
  el('driving-keys').hidden = freeCam || onFoot;
  el('walking-keys').hidden = freeCam || !onFoot;
  el('readout').hidden = onFoot;
  el('car-location').hidden = !onFoot;
  el('race-action').hidden = onFoot;
  el('leave').hidden = !session;
  const race = frames.at(-1)?.state.race,
    entry = raceEntry(race, session?.id);
  el('door').textContent = onFoot
    ? 'Enter car'
    : entry && !entry.withdrawn && entry.elapsed === null
      ? 'Exit car & race'
      : 'Get out';
  el('door').disabled = !connected || !predicted || doorBusy;
  for (const button of document.querySelectorAll<HTMLButtonElement>('.touch button')) {
    const [caption, label] = (onFoot ? walkingButtons : drivingButtons)[Number(button.dataset.bit)];
    button.textContent = caption;
    button.setAttribute('aria-label', label);
  }
  el('camera-keys').hidden = !freeCam;
  el('start').disabled = busy || !connected;
  el('network').textContent = connected ? 'Live' : 'Connecting';
  el('network').classList.toggle('live', connected);
  updateRaceUI(frames.at(-1)?.state);
}
let raceBusy = false,
  dismissedRace: string | undefined;
function lapTime(seconds: number) {
  const ms = Math.floor(Math.max(0, seconds) * 1000);
  return (
    Math.floor(ms / 60000) +
    ':' +
    String(Math.floor(ms / 1000) % 60).padStart(2, '0') +
    '.' +
    String(ms % 1000).padStart(3, '0')
  );
}
function updateRaceUI(state?: World) {
  const race = state?.race,
    entry = raceEntry(race, session?.id);
  const active = entry && entry.elapsed === null && !entry.withdrawn;
  el('drive-mode').textContent = freeCam
    ? 'Free cam'
    : active && race?.phase !== 'open'
      ? 'One-lap race'
      : predicted?.parkedCar
        ? 'On foot'
        : 'Free drive';
  const button = el('race-action');
  let action = '',
    caption = 'Race in progress';
  if (!race || race.phase === 'results') {
    action = 'open';
    caption = entry ? 'Race again' : 'Open race';
  } else if (active) {
    action = 'withdraw';
    caption = race.phase === 'open' ? 'Cancel race' : 'Leave race';
  } else if (race.phase === 'open') {
    action = 'join';
    caption = 'Join race';
  }
  button.textContent = caption;
  button.dataset.action = action;
  button.dataset.raceId = race?.id ?? '';
  button.disabled = !action || raceBusy || !connected;
  const visible =
    !freeCam && session && race && (entry || race.phase === 'open') && dismissedRace !== race.id;
  el('race-panel').hidden = !visible;
  if (!visible || !state) return;
  let status = '',
    clock = '',
    results = '';
  if (race.phase === 'open')
    status = entry
      ? 'Waiting for a second driver on Piccadilly.'
      : race.racers[0].name + ' opened a race on Piccadilly.';
  else if (race.phase === 'countdown') {
    status = 'On the grid · Get ready';
    clock = String(Math.max(1, Math.ceil(race.startAt! - state.time)));
  } else if (entry) {
    if (race.phase === 'results') status = 'Final results';
    else if (entry.withdrawn) status = 'You left the race';
    else if (entry.elapsed !== null) status = 'Finished · Waiting for the other driver';
    else {
      const gate = gates[entry.next];
      const prefix =
        entry.next === gates.length - 1
          ? 'Finish'
          : 'Gate ' + (entry.next + 1) + '/' + (gates.length - 1);
      status = prefix + ' · ' + gate.street + ' (' + gate.direction + ')';
      const elapsed = state.time - race.startAt!;
      clock = elapsed < 0.8 ? 'GO!' : lapTime(elapsed);
    }
    if (entry.elapsed !== null) clock = lapTime(entry.elapsed);
    if (race.racers.some((r) => r.elapsed !== null || r.withdrawn))
      results = race.racers
        .map((r, i) =>
          r.elapsed !== null
            ? i + 1 + '. ' + r.name + '   ' + lapTime(r.elapsed)
            : r.name + '   ' + (r.withdrawn ? 'DNF' : 'Racing'),
        )
        .join('\n');
  }
  if (el('race-status').textContent !== status) el('race-status').textContent = status;
  el('race-clock').textContent = clock;
  el('race-results').textContent = results;
  el('dismiss-results').hidden = race.phase !== 'results';
}
el('dismiss-results').onclick = () => {
  dismissedRace = frames.at(-1)?.state.race?.id;
  updateRaceUI(frames.at(-1)?.state);
};
el('race-action').onclick = async () => {
  if (!session || raceBusy) return;
  const { action, raceId } = el('race-action').dataset;
  if (action !== 'open' && action !== 'join' && action !== 'withdraw') return;
  raceBusy = true;
  updateRaceUI(frames.at(-1)?.state);
  notice('');
  try {
    const response = await post('/race', { token: session.token, action, raceId: raceId || null });
    if (!response.ok) notice(response.error || 'Could not update race.');
  } catch {
    notice('Could not reach the race. Try again.');
  } finally {
    raceBusy = false;
    updateRaceUI(frames.at(-1)?.state);
  }
};
function reset() {
  session = null;
  predicted = null;
  keyboard = touch = 0;
  document
    .querySelectorAll<HTMLButtonElement>('.touch button')
    .forEach((b) => b.classList.remove('active'));
  updateUI();
}
type Reply<T> =
  { ok: true; status: number; data: T } | { ok: false; status: number; error: string };
async function post<P extends keyof Commands>(
  path: P,
  data: Commands[P],
): Promise<Reply<P extends '/join' ? Credentials : object>> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = (await response.json()) as { error: string };
    return { ok: false, status: response.status, error: body.error };
  }
  return { ok: true, status: response.status, data: await response.json() };
}
async function sendInput() {
  if (!session || doorBusy) return;
  const token = session.token;
  try {
    const result = await post('/input', {
      token,
      keys: keyboard | touch,
      seq: ++sequence,
      onFoot: !!predicted?.parkedCar,
    });
    if (!result.ok && result.status === 401 && session?.token === token) {
      reset();
      notice(result.error);
    }
  } catch {
    /* EventSource reports the connection state and the heartbeat retries. */
  }
}
el('join').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || session || !connected) return;
  busy = true;
  updateUI();
  notice('');
  try {
    const result = await post('/join', { name: el('name').value, ...outfit() });
    if (!result.ok) throw new Error(result.error || 'Could not join.');
    session = result.data;
    sequence = 0;
    el('name').blur();
    sendInput();
  } catch (error) {
    notice(error instanceof Error ? error.message : 'Could not join.');
  } finally {
    busy = false;
    updateUI();
  }
});
async function openDoor() {
  if (!session || !predicted || !connected || doorBusy || freeCam) return;
  doorBusy = true;
  release();
  updateUI();
  notice('');
  try {
    const result = await post('/vehicle', {
      token: session.token,
      seq: ++sequence,
      action: predicted.parkedCar ? 'enter' : 'exit',
    });
    if (!result.ok) notice(result.error || 'Could not use the car door.');
  } catch {
    notice('Could not reach the car. Try again.');
  } finally {
    doorBusy = false;
    updateUI();
  }
}
el('door').onclick = openDoor;
el('leave').onclick = async () => {
  if (!session) return;
  const token = session.token;
  try {
    const result = await post('/leave', { token });
    if (result.status === 200 || result.status === 401) {
      reset();
      notice('');
    } else notice('Could not leave. Try again.');
  } catch {
    notice('Could not reach the junction. Try again.');
  }
};
function release() {
  panKeys.clear();
  if (drag) {
    if (map.hasPointerCapture(drag.id)) map.releasePointerCapture(drag.id);
    drag = null;
  }
  if (!keyboard && !touch) return;
  keyboard = touch = 0;
  document
    .querySelectorAll<HTMLButtonElement>('.touch button')
    .forEach((b) => b.classList.remove('active'));
  sendInput();
}
window.addEventListener('blur', release);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) release();
});
window.addEventListener('pagehide', () => {
  if (session) navigator.sendBeacon('/leave', JSON.stringify({ token: session.token }));
});
function moveCamera(dx = 0, dy = 0) {
  const view = viewport(map);
  focus.x = Math.max(view.width / 2, Math.min(WIDTH - view.width / 2, focus.x + dx));
  focus.y = Math.max(view.height / 2, Math.min(HEIGHT - view.height / 2, focus.y + dy));
}
function toggleCamera() {
  release();
  freeCam = !freeCam;
  map.classList.toggle('free-cam', freeCam);
  if (freeCam) moveCamera();
  else Object.assign(focus, session && predicted ? predicted : JUNCTION);
  updateUI();
}
el('camera').onclick = toggleCamera;
map.addEventListener('pointerdown', (event) => {
  if (!freeCam || !event.isPrimary || event.button !== 0) return;
  map.setPointerCapture(event.pointerId);
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
map.addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId) return;
  const view = viewport(map);
  moveCamera(
    ((drag.x - event.clientX) * view.width) / map.clientWidth,
    ((drag.y - event.clientY) * view.height) / map.clientHeight,
  );
  drag.x = event.clientX;
  drag.y = event.clientY;
});
map.addEventListener('lostpointercapture', (event) => {
  if (drag?.id === event.pointerId) drag = null;
});
for (const type of ['keydown', 'keyup'] as const)
  window.addEventListener(type, (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (freeCam) {
      if (event.code === 'Escape' && type === 'keydown') toggleCamera();
      else if (Object.hasOwn(panDirections, event.code)) {
        event.preventDefault();
        if (type === 'keyup') panKeys.delete(event.code);
        else if (!event.repeat) panKeys.add(event.code);
      }
      return;
    }
    if (session && event.code === 'KeyE' && type === 'keydown' && !event.repeat) {
      event.preventDefault();
      openDoor();
      return;
    }
    if (doorBusy) return;
    const bit = keyBits[event.code];
    if (!session || !bit || (type === 'keydown' && event.repeat)) return;
    event.preventDefault();
    const next = type === 'keydown' ? keyboard | bit : keyboard & ~bit;
    if (next !== keyboard) {
      keyboard = next;
      sendInput();
    }
  });
for (const button of document.querySelectorAll<HTMLButtonElement>('.touch button')) {
  const bit = Number(button.dataset.bit);
  button.onpointerdown = (event) => {
    if (doorBusy) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    touch |= bit;
    button.classList.add('active');
    sendInput();
  };
  button.onlostpointercapture = () => {
    touch &= ~bit;
    button.classList.remove('active');
    sendInput();
  };
}
setInterval(sendInput, 900);

const events = new EventSource('/events');
events.onerror = () => {
  connected = false;
  frames = [];
  release();
  updateUI();
};
events.onmessage = (event) => {
  const state: World = JSON.parse(event.data),
    now = performance.now();
  connected = true;
  frames.push({ state, now });
  if (frames.length > 6) frames.shift();
  const player = state.players.find((p) => p.id === session?.id);
  if (player) predicted = { ...player };
  el('count').textContent = state.players.length + ' / 8 players';
  updateUI();
};

function interpolate<T extends Position & { id: string; angle?: number; parkedCar?: unknown }>(
  list: T[],
  before: T[],
  t: number,
): T[] {
  const prior = new Map(before.map((o) => [o.id, o]));
  return list.map((v) => {
    const p = prior.get(v.id);
    if (!p || !!p.parkedCar !== !!v.parkedCar || Math.hypot(v.x - p.x, v.y - p.y) > 100) return v;
    return {
      ...v,
      x: p.x + (v.x - p.x) * t,
      y: p.y + (v.y - p.y) * t,
      angle:
        v.angle === undefined || p.angle === undefined
          ? undefined
          : p.angle + Math.atan2(Math.sin(v.angle - p.angle), Math.cos(v.angle - p.angle)) * t,
    };
  });
}
function scene(now: number): World {
  if (!frames.length) return initial;
  const target = now - 90;
  const end = frames.findIndex((f) => f.now >= target);
  if (end === 0) return frames[0].state;
  if (end < 0) return frames.at(-1)!.state;
  const a = frames[end - 1],
    b = frames[end],
    t = (target - a.now) / (b.now - a.now);
  return {
    race: b.state.race,
    time: a.state.time + (b.state.time - a.state.time) * t,
    players: interpolate(b.state.players, a.state.players, t),
    traffic: interpolate(b.state.traffic, a.state.traffic, t),
    people: interpolate(b.state.people, a.state.people, t),
  };
}
function draw(now: number) {
  const dt = Math.min(0.05, (now - lastDraw) / 1000);
  lastDraw = now;
  let world = scene(now);
  if (predicted && session && connected) {
    const latest = frames.at(-1)!.state;
    const { vehicles, people } = roadUsers(latest);
    if (predicted.parkedCar) {
      walk(predicted, keyboard | touch, dt, vehicles, people);
      const dx = predicted.parkedCar.x - predicted.x,
        dy = predicted.parkedCar.y - predicted.y;
      const directions = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
      const heading = directions[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
      el('car-location').textContent =
        'Car · ' + Math.round(Math.hypot(dx, dy) / 5) + ' m ' + heading;
    } else if (!heldOnGrid(latest.race, session.id)) {
      drive(predicted, keyboard | touch, dt, vehicles, people, false);
    }
    // Predict the local pose, but render the same lamp signals spectators receive.
    const local = predicted;
    world = {
      ...world,
      players: world.players.map((p) =>
        p.id === local.id ? { ...local, rearLights: p.rearLights } : p,
      ),
    };
    el('speed').textContent = String(Math.round(Math.abs(predicted.speed) * 0.45)).padStart(2, '0');
    el('gear').textContent =
      Math.abs(predicted.speed) < 0.8 ? 'N' : predicted.speed > 0 ? 'D' : 'R';
  }
  if (freeCam) {
    let dx = 0,
      dy = 0;
    for (const key of panKeys) {
      dx += panDirections[key][0];
      dy += panDirections[key][1];
    }
    const distance = (520 * dt) / (Math.hypot(dx, dy) || 1);
    moveCamera(dx * distance, dy * distance);
  } else {
    const target = session && predicted ? predicted : JUNCTION;
    focus.x += (target.x - focus.x) * (1 - Math.exp(-5 * dt));
    focus.y += (target.y - focus.y) * (1 - Math.exp(-5 * dt));
  }
  const street = streetAt(focus.x, focus.y);
  const streetLabel = el('street-name');
  if (streetLabel.textContent !== street) streetLabel.textContent = street;
  render(world, freeCam ? undefined : session?.id, focus);
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
