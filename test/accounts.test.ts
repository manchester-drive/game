import { expect, test } from 'bun:test';
import { Accounts } from '../src/server/accounts';
import { openDatabase } from '../src/server/db';
import { GameRoom } from '../src/server/room';
import { createRoutes } from '../src/server/routes';

function setup(now = Date.now) {
  const room = new GameRoom();
  const accounts = new Accounts(openDatabase(':memory:'), now);
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
  const me = async () =>
    (await api.request('/account/me', { headers: cookie ? { Cookie: cookie } : {} })).status;
  return { room, post, me, signOut: () => (cookie = '') };
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
