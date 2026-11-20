import { gates, gateHalfWidth, raceEntry } from './race.js';
import { corners, gardens, streets, zebra } from './streets.js';
import { WIDTH, HEIGHT, buildings, signals, spawns } from './world.js';

function rect(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), w, h);
}
function label(g, str, x, y, size, ink, align = 'center') {
  g.font = 'bold ' + size + 'px monospace';
  g.textAlign = align;
  g.fillStyle = ink;
  g.fillText(str, Math.round(x), Math.round(y));
}
function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function tree(g, x, y, scale = 1) {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  const R = (x, y, w, h, c) => rect(g, x, y, w, h, c);
  R(-6, 5, 19, 8, '#68735b');
  R(-2, 1, 4, 12, '#504b39');
  R(0, 2, 2, 9, '#876a47');
  R(-11, -7, 22, 12, '#334f42');
  R(-8, -12, 16, 21, '#334f42');
  R(-5, -15, 10, 23, '#47694c');
  R(-12, -6, 20, 9, '#47694c');
  R(-9, -11, 17, 15, '#5d8053');
  R(-5, -14, 10, 16, '#71915c');
  R(-10, -6, 9, 6, '#71915c');
  R(-6, -10, 5, 3, '#91a56d');
  R(2, -7, 4, 3, '#829c62');
  R(4, 0, 4, 3, '#426648');
  g.restore();
}
function bench(g, x, y) {
  rect(g, x + 1, y + 3, 16, 5, '#79816b');
  rect(g, x + 2, y - 2, 2, 9, '#3b4942');
  rect(g, x + 12, y - 2, 2, 9, '#3b4942');
  for (let n = 0; n < 3; n++) rect(g, x, y - 2 + n * 3, 16, 2, n === 0 ? '#ce9f69' : '#976d48');
}
function roof(g, b, rng) {
  const { x, y, w, h, brick, roof, name } = b,
    end = y + h,
    R = (x, y, w, h, c) => rect(g, x, y, w, h, c);
  R(x + 6, y + 7, w, h, '#7a7970');
  R(x + 2, y + 4, w, h, '#91897a');
  R(x, y, w, h, '#4c4542');
  R(x + 2, y + 2, w - 4, h - 4, brick);
  // The street-facing elevation occupies the bottom strip of the footprint.
  const lip = end - 25;
  for (let yy = lip; yy < end - 2; yy += 3)
    for (let xx = x + 3 + (yy % 2) * 3; xx < x + w - 6; xx += 8)
      if (rng() > 0.6) R(xx, yy, 5, 1, '#b08065');
  for (let xx = x + 8; xx < x + w - 10; xx += 14) {
    R(xx, lip + 3, 8, 10, '#c28f70');
    R(xx + 1, lip + 4, 6, 7, '#3b4e51');
    R(xx + 2, lip + 4, 2, 3, '#7b9694');
    R(xx, lip + 11, 8, 1, '#d3b196');
  }
  R(x + 4, end - 11, w - 8, 9, '#414d48');
  for (let xx = x + 7; xx < x + w - 7; xx += 14) {
    R(xx, end - 10, 9, 7, '#728683');
    R(xx, end - 10, 3, 5, '#96a39b');
  }
  const signW = Math.min(w - 12, name.length * 5 + 12);
  R(x + (w - signW) / 2, end - 15, signW, 9, '#364742');
  label(g, name, x + w / 2, end - 8, 7, '#e4d2a2');
  R(x - 1, y - 1, w + 2, h - 23, '#564b48');
  R(x, y, w, h - 25, '#cfab8a');
  R(x + 2, y + 2, w - 4, h - 29, roof);
  R(x + 3, lip - 2, w - 6, 2, '#594f4a');
  for (let yy = y + 11; yy < lip - 3; yy += 12) {
    R(x + 4, yy, w - 8, 1, '#635957');
    R(x + 4, yy + 1, w - 8, 1, '#ffffff14');
    for (let xx = x + 12 + (yy % 3) * 7; xx < x + w - 7; xx += 24) R(xx, yy - 4, 1, 4, '#49413a33');
  }
  for (let i = 0; i < (w * h) / 75; i++)
    R(x + 4 + rng() * (w - 9), y + 3 + rng() * (h - 33), 2, 1, '#352f3b22');
  const skylight = (sx, sy) => {
    R(sx + 3, sy + 4, 25, 14, '#5f5651');
    R(sx, sy, 25, 14, '#c2a78e');
    R(sx + 1, sy + 1, 23, 12, '#414f50');
    for (let j = 0; j < 3; j++) {
      R(sx + 2 + j * 7, sy + 2, 6, 9, '#668184');
      R(sx + 2 + j * 7, sy + 2, 3, 5, '#95a6a0');
    }
    R(sx, sy + 7, 25, 1, '#a39280');
  };
  skylight(x + 10, y + 18);
  if (w > 110) skylight(x + 43, y + 18);
  for (let j = 0; j < 2; j++) {
    const vx = x + w - 22 - j * 15,
      vy = y + h - 60;
    R(vx + 3, vy + 4, 11, 12, '#625754');
    R(vx, vy, 11, 12, '#a4a197');
    for (let k = 0; k < 4; k++) R(vx + 2, vy + 2 + k * 2, 7, 1, '#59645f');
  }
  R(x + 12, y + h - 58, 8, 11, '#625956');
  R(x + 10, y + h - 61, 8, 10, brick);
  R(x + 9, y + h - 62, 10, 3, '#c79d82');
  R(x + 11, y + h - 62, 6, 1, '#493e39');
}
function drawStreets(g, rng) {
  // Paint each layer across the entire network so adjoining roads share open mouths.
  for (const [half, ink] of [
    [31, '#858179'],
    [29, '#d5c8ad'],
    [27, '#575b5b'],
  ]) {
    for (const { x, y, vertical, length } of streets) {
      rect(
        g,
        x - half,
        y - half,
        half * 2 + (vertical ? 0 : length),
        half * 2 + (vertical ? length : 0),
        ink,
      );
    }
  }
  for (const { x, y, vertical, length } of streets) {
    g.save();
    g.translate(x, y);
    if (vertical) g.rotate(Math.PI / 2);
    for (let i = 0; i < length * 3; i++)
      rect(g, rng() * length, rng() * 50 - 25, 2, 1, rng() > 0.5 ? '#5c605f' : '#535757');
    const nearJunction = (d, margin) =>
      corners.some(
        ([cx, cy]) => Math.hypot(x + (vertical ? 0 : d) - cx, y + (vertical ? d : 0) - cy) < margin,
      );
    for (let d = 3; d + 13 < length; d += 29)
      if (!nearJunction(d + 6, 52)) rect(g, d, -1, 13, 2, '#c7c4b4');
    for (let d = 0; d < length; d++)
      if (!nearJunction(d, 34))
        for (const side of [-26, -24, 23, 25]) rect(g, d, side, 1, 1, '#c5ab66');
    g.restore();
  }
  // Give-way lines on the two side-road approaches and the Parker Street zebra.
  for (let offset = 2; offset < 26; offset += 6) {
    rect(g, gardens.west - offset, gardens.north + 32, 3, 2, '#d8d4c4');
    rect(g, gardens.east - 37, gardens.south - offset, 2, 3, '#d8d4c4');
  }
  for (let y = zebra.y - 26; y < zebra.y + 26; y += 8) rect(g, zebra.x - 6, y, 12, 4, '#dedac9');
  for (const y of [zebra.y - 33, zebra.y + 33]) {
    rect(g, zebra.x + 9, y - 5, 2, 9, '#405047');
    rect(g, zebra.x + 9, y - 1, 2, 2, '#eddfc5');
    rect(g, zebra.x + 8, y - 7, 4, 4, '#f3bd58');
  }
}
function streetSign(g, x, y, lines) {
  g.font = 'bold 7px monospace';
  const width = Math.ceil(Math.max(...lines.map((line) => g.measureText(line).width))) + 8;
  rect(g, x - 1, y, 3, 7, '#5b6256');
  rect(g, x - width / 2, y - lines.length * 9, width, lines.length * 9, '#39463e');
  for (const [i, line] of lines.entries())
    label(g, line, x, y - (lines.length - 1 - i) * 9 - 2, 7, '#f6e6c5');
}
function terrain() {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const g = canvas.getContext('2d'),
    rng = random(418);
  const R = (x, y, w, h, c) => rect(g, x, y, w, h, c);
  R(0, 0, WIDTH, HEIGHT, '#b7ac94');
  for (let y = 0; y < HEIGHT; y += 7)
    for (let x = -16 + (y % 2) * 8; x < WIDTH; x += 16) {
      R(x, y, 15, 6, ['#c0b49f', '#bcb09b', '#b6aa96', '#c4b9a3'][Math.floor(rng() * 4)]);
    }
  // Piccadilly Gardens paths and central fountain.
  g.save();
  g.beginPath();
  g.rect(gardens.west + 40, 331, 350 - (gardens.west + 40), 229);
  g.clip();
  R(0, 331, 350, 229, '#858775');
  R(0, 333, 348, 227, '#799361');
  for (let i = 0; i < 3600; i++)
    R(rng() * 348, 333 + rng() * 227, 2, 1, rng() > 0.5 ? '#839b68' : '#738d5c');
  R(0, 377, 347, 12, '#c4b89a');
  R(241, 333, 13, 227, '#c4b89a');
  R(0, 438, 347, 12, '#c4b89a');
  R(86, 332, 9, 228, '#c4b89a');
  R(124, 399, 67, 28, '#b7ac93');
  R(130, 394, 55, 38, '#b7ac93');
  R(133, 399, 49, 28, '#8e9388');
  R(136, 401, 43, 22, '#aec9bc');
  R(138, 403, 39, 18, '#688e89');
  for (let n = 0; n < 12; n++) R(139 + rng() * 34, 404 + rng() * 16, 4, 1, '#91b2a6');
  R(154, 404, 7, 12, '#a5b5a4');
  R(155, 400, 4, 10, '#d3d7c2');
  for (const [x, y] of [
    [53, 369],
    [99, 389],
    [208, 369],
    [270, 390],
    [189, 432],
    [69, 452],
  ])
    bench(g, x, y);
  for (let i = 0; i < 13; i++) {
    const x = 18 + i * 25,
      y = 349 + (i % 2) * 4;
    if (i === 3 || i === 9) continue;
    tree(g, x, y, 0.8);
  }
  for (const [x, y, s] of [
    [39, 412, 1.4],
    [64, 423, 1],
    [281, 414, 1.2],
    [323, 406, 1],
    [29, 486, 1.3],
    [133, 470, 1],
    [196, 490, 1.2],
    [285, 481, 1.4],
    [339, 503, 1],
  ])
    tree(g, x, y, s);
  for (const [x, y] of [
    [101, 343],
    [168, 343],
    [101, 456],
    [268, 450],
  ]) {
    R(x, y, 30, 9, '#586b4d');
    R(x + 1, y + 1, 28, 6, '#74945d');
    for (let n = 0; n < 10; n++)
      R(x + 2 + rng() * 24, y + 1 + rng() * 4, 2, 2, n % 2 ? '#dfad78' : '#c78878');
  }
  g.restore();
  drawStreets(g, rng);
  for (const [x, y, angle] of spawns) {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    R(-15, -7, 30, 20, '#575b5b');
    R(-15, -8, 30, 1, '#d5c8ad');
    for (let mark = -14; mark < 14; mark += 7) R(mark, 7, 4, 1, '#b7b7a7');
    g.restore();
  }
  R(363, 255, 2, 23, '#d8d4c4');
  R(435, 282, 2, 23, '#d8d4c4');
  R(375, 312, 23, 2, '#d8d4c4');
  R(402, 235, 23, 2, '#d8d4c4');
  for (let x = 374; x < 427; x += 5) {
    R(x, 238, 2, 2, '#d8d4c4');
    R(x, 246, 2, 2, '#d8d4c4');
  }
  for (const x of [366, 429]) R(x, 238, 5, 10, '#d3b77c');
  for (const [x, y] of [
    [321, 260],
    [477, 300],
    [380, 177],
    [417, 373],
  ]) {
    R(x, y, 7, 4, '#454e4e');
    R(x + 1, y + 1, 5, 1, '#727670');
  }
  for (const b of buildings) roof(g, b, rng);
  for (const [x, y] of [
    [70, 235],
    [180, 234],
    [481, 230],
    [642, 232],
    [528, 322],
    [694, 324],
    [354, 64],
    [443, 65],
  ]) {
    R(x - 6, y - 4, 12, 13, '#8b8876');
    R(x - 4, y - 2, 8, 9, '#726c58');
    tree(g, x, y, 0.8);
  }
  // Garden entrance plaque, cycle stands and post boxes.
  R(282, 336, 59, 12, '#4a5c50');
  R(284, 338, 55, 8, '#647763');
  label(g, 'PICCADILLY', 312, 344, 7, '#efe0b5');
  for (let j = 0; j < 4; j++) {
    R(244 + j * 6, 229, 3, 5, '#66706a');
    R(245 + j * 6, 230, 1, 4, '#b8b09d');
  }
  R(462, 320, 5, 9, '#9e4d3c');
  R(461, 320, 7, 2, '#be6450');
  R(463, 323, 3, 1, '#483e38');
  streetSign(g, gardens.west + 36, gardens.north + 46, ['PICCADILLY', 'MOSLEY ST']);
  streetSign(g, gardens.west + 42, gardens.south - 35, ['MOSLEY ST', 'PARKER ST']);
  streetSign(g, gardens.east + 67, gardens.south - 43, ['PARKER ST', 'PORTLAND ST']);
  streetSign(g, gardens.east - 77, gardens.north + 53, ['PICCADILLY', 'PORTLAND ST']);
  return canvas;
}

function car(g, v, local, time) {
  g.save();
  g.translate(Math.round(v.x), Math.round(v.y));
  g.rotate(v.angle);
  const R = (x, y, w, h, c) => rect(g, x, y, w, h, c);
  R(-8, -4, 19, 11, '#2b333272');
  R(-8, -5, 16, 10, '#2c3736');
  R(-6, -6, 4, 2, '#293432');
  R(4, -6, 4, 2, '#293432');
  R(-6, 4, 4, 2, '#293432');
  R(4, 4, 4, 2, '#293432');
  R(-9, -4, 18, 8, v.color);
  R(-7, -5, 14, 10, v.color);
  R(-5, -4, 10, 8, '#354b50');
  R(-4, -3, 2, 6, '#79959a');
  R(2, -3, 2, 6, '#a1b8b5');
  R(-2, -4, 4, 8, v.color);
  R(-2, -4, 4, 1, '#ffffff66');
  R(5, -3, 3, 1, '#ffffff66');
  R(8, -4, 1, 2, '#ffe8ab');
  R(8, 2, 1, 2, '#ffe8ab');
  for (const y of [-3, 2]) {
    if (v.rearLights === 'brake' || v.rearLights === 'reverse') {
      const reverse = v.rearLights === 'reverse';
      R(-12, y - 1, 4, 4, reverse ? '#e4f4ff55' : '#ff352b66');
      R(-10, y, 3, 2, reverse ? '#f4fcff' : '#ff493b');
    } else {
      R(-9, y, 1, 2, '#ab493e');
    }
  }
  R(-9, -1, 1, 2, '#efc26d');
  if (v.indicating && Math.floor(time * 3) % 2 === 0) {
    R(7, -5, 3, 2, '#ffd24a');
    R(-9, -5, 3, 2, '#ffd24a');
  }
  if (local) {
    R(-6, -8, 11, 1, '#d0f4d0');
    R(-6, 7, 11, 1, '#d0f4d0');
  }
  g.restore();
}
function drawGate(g, gate, viewX, viewY, width, height) {
  g.save();
  g.translate(gate.x, gate.y);
  g.rotate(Math.atan2(gate.dy, gate.dx));
  const finish = gate === gates.at(-1);
  for (let row = 0; row < 2; row++) {
    for (let n = 0; n < 18; n++) {
      const ink = (n + row) % 2 ? '#27352e' : finish ? '#fff8de' : '#ffcc65';
      rect(g, row * 3 - 3, n * 3 - gateHalfWidth, 3, 3, ink);
    }
  }
  g.restore();
  // Keep a direction marker in view when the next gate is beyond the camera.
  const cx = viewX + width / 2,
    cy = viewY + height / 2;
  const dx = gate.x - cx,
    dy = gate.y - cy;
  const scale = Math.min(
    1,
    (width / 2 - 12) / (Math.abs(dx) || 1),
    (height / 2 - 12) / (Math.abs(dy) || 1),
  );
  g.save();
  g.translate(Math.round(cx + dx * scale), Math.round(cy + dy * scale));
  g.rotate(scale < 1 ? Math.atan2(dy, dx) : Math.atan2(gate.dy, gate.dx));
  rect(g, -7, -7, 14, 14, '#283730');
  rect(g, -4, -1, 8, 3, '#ffcc65');
  for (let i = 0; i < 4; i++) rect(g, i, -4 + i, 1, 9 - 2 * i, '#ffcc65');
  g.restore();
}
function light(g, x, y, state) {
  rect(g, x + 1, y + 1, 3, 13, '#666c60');
  rect(g, x, y - 1, 2, 14, '#3e4841');
  rect(g, x - 2, y - 6, 6, 12, '#313a36');
  for (const [i, s, c] of [
    [0, 'red', '#f07b66'],
    [1, 'amber', '#f2c56a'],
    [2, 'green', '#83d4a3'],
  ])
    rect(g, x, y - 4 + i * 3, 2, 2, state === s ? c : '#575b4f');
}

export function makeRenderer(canvas) {
  const map = terrain(),
    g = canvas.getContext('2d', { alpha: false });
  const buffer = document.createElement('canvas'),
    b = buffer.getContext('2d', { alpha: false });
  return (world, me, focus) => {
    const w = canvas.clientWidth,
      h = canvas.clientHeight,
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const zoom = Math.max(1.7, w / WIDTH, h / HEIGHT);
    const vw = Math.min(WIDTH, Math.ceil(w / zoom)),
      vh = Math.min(HEIGHT, Math.ceil(h / zoom));
    if (buffer.width !== vw || buffer.height !== vh) {
      buffer.width = vw;
      buffer.height = vh;
    }
    const x = Math.round(Math.max(0, Math.min(WIDTH - vw, focus.x - vw / 2)));
    const y = Math.round(Math.max(0, Math.min(HEIGHT - vh, focus.y - vh / 2)));
    b.setTransform(1, 0, 0, 1, -x, -y);
    b.drawImage(map, 0, 0);
    const entry = raceEntry(world.race, me);
    if (entry && !entry.withdrawn && entry.elapsed === null && world.race.phase !== 'open') {
      drawGate(b, gates[entry.next], x, y, vw, vh);
    }
    const lights = signals(world.time);
    light(b, 360, 242, lights.horizontal);
    light(b, 439, 315, lights.horizontal);
    light(b, 361, 316, lights.vertical);
    light(b, 436, 227, lights.vertical);
    for (const v of world.traffic) car(b, v, false, world.time);
    for (const p of world.people) {
      const stride = Math.floor((p.x + p.y) / 3) % 2;
      rect(b, p.x - 2, p.y + 2, 6, 2, '#727468');
      rect(b, p.x - 2, p.y, 1, 3 - stride, '#3e4743');
      rect(b, p.x + 1, p.y, 1, 2 + stride, '#3e4743');
      rect(b, p.x - 2, p.y - 3, 4, 4, p.color);
      rect(b, p.x - 1, p.y - 5, 3, 3, '#b88b68');
      rect(b, p.x - 1, p.y - 6, 3, 2, '#55483e');
    }
    for (const v of world.players) {
      car(b, v, v.id === me);
      const str = v.id === me ? 'YOU' : v.name;
      b.font = 'bold 7px monospace';
      const lw = Math.ceil(b.measureText(str).width) + 6;
      rect(b, v.x - lw / 2, v.y - 20, lw, 10, '#283730');
      label(b, str, v.x, v.y - 13, 7, v.id === me ? '#c6ebac' : '#fff0d4');
    }
    g.imageSmoothingEnabled = false;
    g.drawImage(buffer, 0, 0, canvas.width, canvas.height);
  };
}
