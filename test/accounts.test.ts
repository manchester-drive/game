import { expect, test } from 'bun:test';
import { Accounts } from '../src/server/accounts';
import { openDatabase } from '../src/server/db';
import { GameRoom } from '../src/server/room';
import { createRoutes } from '../src/server/routes';
import { useServerMap } from '../src/server/map';
import { startAreas } from '../src/game/areas';
import { startingPositions } from '../src/game/streets';
import { useCar } from '../src/game/world';

useServerMap();

function setup(now = Date.now) {
  const room = new GameRoom();
  const accounts = new Accounts(openDatabase(':memory:'), now);
  room.onPark = (userId, vehicleId, pose) => accounts.park(userId, vehicleId, pose);
  const api = createRoutes(room, accounts, () => {}, () => true);
  let cookie = '';
  async function post(path: string, body: unknown, withCookie = true) {
    const response = await api.request(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: withCookie && cookie ? { Cookie: cookie } : {},
    });
    const set = response.headers.get('Set-Cookie');
    if (set && withCookie) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    return { status: response.status, body: await response.json(), setCookie: set };
  }
  const account = () => api.request('/account/me', { headers: cookie ? { Cookie: cookie } : {} });
  const me = async () => (await account()).status;
  const profile = async () => (await account()).json();
  function signOut() {
    const previous = cookie;
    cookie = '';
    return previous;
  }
  return { room, post, me, profile, signOut, signIn: (previous: string) => (cookie = previous) };
}

test('signup starts a session, rejects taken or reserved names and logout ends it', async () => {
  const { post, me, signOut } = setup();
  const signup = await post('/account/signup', { username: 'Ada', password: 'correct horse' });
  expect(signup.status).toBe(201);
  expect(signup.setCookie).toContain('HttpOnly');
  expect(signup.setCookie).toContain('SameSite=Lax');
  expect(await me()).toBe(200);

  const other = { password: 'correct horse' };
  expect((await post('/account/signup', { ...other, username: 'ada' }, false)).status).toBe(409);
  expect((await post('/account/signup', { ...other, username: 'Guest' }, false)).status).toBe(409);
  expect((await post('/account/signup', { ...other, username: 'a' }, false)).status).toBe(400);

  await post('/account/logout', {});
  expect(await me()).toBe(401);
  signOut();
  expect((await post('/account/login', { username: 'ADA', password: 'wrong pass' })).status).toBe(
    401,
  );
  expect((await post('/account/login', { username: 'ADA', password: 'correct horse' })).status).toBe(
    200,
  );
  expect(await me()).toBe(200);
});

test('repeated wrong passwords are rate limited even when the right one follows', async () => {
  const { post, signOut } = setup();
  await post('/account/signup', { username: 'Ada', password: 'correct horse' });
  signOut();
  for (let i = 0; i < 5; i++)
    expect((await post('/account/login', { username: 'Ada', password: 'guess ' + i })).status).toBe(
      401,
    );
  expect((await post('/account/login', { username: 'Ada', password: 'correct horse' })).status).toBe(
    429,
  );
});

test('sessions expire after 30 days', async () => {
  let now = 0;
  const { post, me } = setup(() => now);
  await post('/account/signup', { username: 'Ada', password: 'correct horse' });
  now += 29 * 24 * 60 * 60 * 1000;
  expect(await me()).toBe(200);
  now += 2 * 24 * 60 * 60 * 1000;
  expect(await me()).toBe(401);
});

test('an account joins under its username and guests cannot borrow it', async () => {
  const { room, post, signOut } = setup();
  await post('/account/signup', { username: 'Ada', password: 'correct horse' });
  expect((await post('/join', {})).status).toBe(409);
  await post('/account/vehicles/starter', { model: 'hatch' });
  const first = await post('/join', { name: 'Someone else' });
  expect(first.status).toBe(201);
  const ada = room.sessionFor(first.body.token)!.player;
  expect(ada.name).toBe('Ada');
  expect(ada.guest).toBeUndefined();

  // A second tab replaces the first car rather than adding another Ada.
  const second = await post('/join', {});
  expect(room.sessionFor(first.body.token)).toBeUndefined();
  expect(room.world.players.filter((p) => p.name === 'Ada').length).toBe(1);
  expect(room.chat(room.sessionFor(second.body.token)!, 'hi').guest).toBeUndefined();

  signOut();
  expect((await post('/join', { name: ' ada ' })).status).toBe(409);
  const guest = await post('/join', { name: 'Mo' });
  expect(guest.status).toBe(201);
  const session = room.sessionFor(guest.body.token)!;
  expect(session.player.guest).toBe(true);
  expect(room.chat(session, 'hello').guest).toBe(true);
});

test('a saved character is used on join and appearance in the request is ignored', async () => {
  const { room, post } = setup();
  await post('/account/signup', { username: 'Ada', password: 'correct horse' });
  const saved = await post('/account/character', {
    figure: 'feminine',
    hairStyle: 'ponytail',
    hair: 'auburn',
    skin: 'deep',
    jacket: 'plum',
    trousers: 'redSkirt',
  });
  await post('/account/vehicles/starter', { model: 'hatch' });
  expect(saved.body.character).toMatchObject({ figure: 'feminine', hairStyle: 'ponytail' });
  const joined = await post('/join', { figure: 'masculine', jacket: 'teal', hair: 'grey' });
  expect(room.sessionFor(joined.body.token)!.player).toMatchObject({
    figure: 'feminine',
    hairStyle: 'ponytail',
    hair: 'auburn',
    jacket: 'plum',
    trousers: 'redSkirt',
  });
});

test('the first vehicle must be a starter, is free once, and drives with its livery', async () => {
  const { room, post } = setup();
  await post('/account/signup', { username: 'Ada', password: 'correct horse' });
  expect((await post('/account/vehicles/starter', { model: 'coupe' })).status).toBe(409);
  const first = await post('/account/vehicles/starter', {
    model: 'van',
    paint: 'crimson',
    trim: 'white',
    stripe: 'gold',
    plate: ' ad4-x 99z!',
  });
  expect(first.status).toBe(201);
  expect(first.body.vehicles).toEqual([
    expect.objectContaining({ model: 'van', paint: 'crimson', plate: 'AD4X 99', acquiredVia: 'starter' }),
  ]);
  expect(first.body.activeVehicleId).toBe(first.body.vehicles[0].id);
  const again = await post('/account/vehicles/starter', { model: 'hatch' });
  expect(again.status).toBe(409);

  const joined = await post('/join', { model: 'coupe', paint: 'snow', plate: 'FAKE' });
  const session = room.sessionFor(joined.body.token)!;
  expect(session.player).toMatchObject({
    model: 'van',
    color: '#c0403c',
    roof: '#efefe8',
    stripe: '#e2bb52',
    plate: 'AD4X 99',
  });
  expect(room.chat(session, 'hi').color).toBe('#c0403c');
});

test('guests can only drive starter models', async () => {
  const { room, post } = setup();
  const coupe = await post('/join', { name: 'Mo', model: 'coupe', paint: 'sky' });
  expect(room.sessionFor(coupe.body.token)!.player).toMatchObject({ model: 'hatch', color: '#8ba9e4' });
  const van = await post('/join', { name: 'Lee', model: 'van' });
  expect(room.sessionFor(van.body.token)!.player.model).toBe('van');
});

test('guests choose a starting area each time and accounts keep theirs', async () => {
  const { room, post } = setup();
  const near = (token: string, area: keyof typeof startAreas) => {
    const { x, y } = room.sessionFor(token)!.player;
    return Math.hypot(x - startAreas[area].x, y - startAreas[area].y) < 500;
  };
  const guest = await post('/join', { name: 'Mo', area: 'didsbury' });
  expect(near(guest.body.token, 'didsbury')).toBe(true);

  await post('/account/signup', { username: 'Ada', password: 'correct horse' });
  await post('/account/vehicles/starter', { model: 'hatch' });
  expect((await post('/account/area', { area: 'chorlton' })).body.startArea).toBe('chorlton');
  const ada = await post('/join', { area: 'didsbury' });
  expect(near(ada.body.token, 'chorlton')).toBe(true);
});

test('the garage switches between owned vehicles and repaints without changing the model', async () => {
  const { post, signOut } = setup();
  await post('/account/signup', { username: 'Ada', password: 'correct horse' });
  const { body } = await post('/account/vehicles/starter', { model: 'van', paint: 'teal' });
  const [van] = body.vehicles;
  const repainted = await post('/account/vehicles/paint', {
    id: van.id,
    model: 'coupe',
    paint: 'crimson',
    plate: 'ada 1',
  });
  expect(repainted.body.vehicles[0]).toMatchObject({ model: 'van', paint: 'crimson', plate: 'ADA 1' });
  expect((await post('/account/vehicles/active', { id: van.id })).status).toBe(200);

  signOut();
  await post('/account/signup', { username: 'Mona', password: 'correct horse' });
  expect((await post('/account/vehicles/active', { id: van.id })).status).toBe(404);
  expect((await post('/account/vehicles/paint', { id: van.id, paint: 'snow' })).status).toBe(404);
});

test('accounts carry on from where they parked, on foot or driving', async () => {
  const { room, post, profile } = setup();
  await post('/account/signup', { username: 'Ada', password: 'correct horse' });
  await post('/account/vehicles/starter', { model: 'hatch' });
  await post('/account/area', { area: 'chorlton' });
  const first = await post('/join', {});
  const [x, y, angle] = startingPositions(startAreas.deansgate).next().value!;
  Object.assign(room.sessionFor(first.body.token)!.player, { x, y, angle, speed: 0 });

  // A second tab parks the first car and resumes exactly where it stood.
  const second = await post('/join', {});
  expect(room.sessionFor(second.body.token)!.player).toMatchObject({ x, y, angle });
  expect((await profile()).vehicles[0].parked).toMatchObject({ x, y, angle });

  // On foot, the spot is the parked car, not where the player walked to.
  const walker = room.sessionFor(second.body.token)!.player;
  expect(useCar(room.world, walker, 'exit')).toBeUndefined();
  const car = { ...walker.parkedCar! };
  walker.x += 40;
  room.leave(room.sessionFor(second.body.token)!);
  const third = await post('/join', {});
  expect(room.sessionFor(third.body.token)!.player).toMatchObject({
    x: car.x,
    y: car.y,
    angle: car.angle,
  });
});

test('a blocked parking spot falls back to the nearest clear street', async () => {
  const { room, post, signOut, signIn } = setup();
  await post('/account/signup', { username: 'Ada', password: 'correct horse' });
  await post('/account/vehicles/starter', { model: 'hatch' });
  const first = await post('/join', {});
  const spot = { ...room.sessionFor(first.body.token)!.player };
  room.leave(room.sessionFor(first.body.token)!);
  const cookie = signOut();

  // A guest pulls into the empty space.
  const guest = await post('/join', { name: 'Mona' }, false);
  Object.assign(room.sessionFor(guest.body.token)!.player, { x: spot.x, y: spot.y, angle: spot.angle });

  signIn(cookie);
  const back = room.sessionFor((await post('/join', {})).body.token)!.player;
  const distance = Math.hypot(back.x - spot.x, back.y - spot.y);
  expect(distance).toBeGreaterThan(0);
  expect(distance / 5).toBeLessThan(100);
});

test('picking an area applies to the next drive, then the player resumes from parking', async () => {
  const { room, post, profile } = setup();
  await post('/account/signup', { username: 'Ada', password: 'correct horse' });
  await post('/account/vehicles/starter', { model: 'hatch' });
  await post('/account/area', { area: 'didsbury' });
  const first = await post('/join', {});
  expect((await profile()).startArea).toBe('parked');
  room.parkAll();
  expect((await profile()).vehicles[0].parked).not.toBeNull();
  const spot = { ...room.sessionFor(first.body.token)!.player };
  const again = room.sessionFor((await post('/join', {})).body.token)!.player;
  expect(again).toMatchObject({ x: spot.x, y: spot.y });
});
