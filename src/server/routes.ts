import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { z } from 'zod';
import type { LiveChatEvent } from '../protocol/chat';
import type { AccountProfile } from '../protocol/commands';
import type { Player } from '../game/game-types';
import {
  chatCommand,
  inputCommand,
  doorCommand,
  raceCommandBody,
  viewCommand,
} from '../protocol/commands';
import type { GameRoom, RoomSession } from './room';
import { character } from '../game/garage';
import {
  credentialsBody,
  LoginLimiter,
  sessionDays,
  type Accounts,
  type User,
} from './accounts';

type Variables = { body: Record<string, unknown>; session: RoomSession };
type Env = { Variables: Variables; Bindings: { requestIP?(req: Request): { address: string } | null } };
const commandBody = z.record(z.string(), z.unknown());
export const accountCookie = 'md_account';

function clientIP(c: Context<Env>) {
  // Fly's proxy sets this header. Direct connections fall back to the socket address.
  return c.req.header('Fly-Client-IP') ?? c.env?.requestIP?.(c.req.raw)?.address ?? 'unknown';
}

// Browsers keep Secure cookies over HTTPS and on loopback, so only plain-HTTP LAN rooms skip it.
function secureRequest(c: Context<Env>) {
  const url = new URL(c.req.url);
  const proto = c.req.header('X-Forwarded-Proto') ?? url.protocol.slice(0, -1);
  return proto === 'https' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}


export function createRoutes(
  room: GameRoom,
  accounts: Accounts,
  publishChat: (event: LiveChatEvent, sender: Player) => void,
  updateView: (view: z.output<typeof viewCommand>) => boolean,
) {
  const api = new Hono<Env>();
  const limiter = new LoginLimiter();
  api.use(async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  const authenticatedCommands = ['/input', '/leave', '/race', '/vehicle', '/chat'];
  api.on(
    'POST',
    [
      '/join',
      '/view',
      '/account/signup',
      '/account/login',
      '/account/logout',
      '/account/character',
      ...authenticatedCommands,
    ],
    bodyLimit({ maxSize: 2048, onError: (c) => c.json({ error: 'Request too large.' }, 413) }),
    async (c, next) => {
      const origin = c.req.header('Origin');
      if (origin && URL.parse(origin)?.host !== c.req.header('Host'))
        return c.json({ error: 'Open the game on this host.' }, 403);
      // pagehide sends /leave as a text/plain beacon containing JSON.
      const body = commandBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ error: 'Invalid request.' }, 400);
      c.set('body', body.data);
      await next();
    },
  );

  api.post('/view', (c) => {
    const view = viewCommand.safeParse(c.var.body);
    if (!view.success) return c.json({ error: 'Invalid camera area.' }, 400);
    return updateView(view.data) ? c.json({}) : c.json({ error: 'View disconnected.' }, 404);
  });
  function publicUser(user: User): AccountProfile {
    return { username: user.username, character: accounts.character(user.id) };
  }
  function signedIn(c: Context<Env>) {
    return accounts.userForToken(getCookie(c, accountCookie));
  }
  function startSession(c: Context<Env>, token: string) {
    setCookie(c, accountCookie, token, {
      path: '/',
      httpOnly: true,
      secure: secureRequest(c),
      sameSite: 'Lax',
      maxAge: sessionDays * 24 * 60 * 60,
    });
  }
  api.post('/account/signup', async (c) => {
    const body = credentialsBody.safeParse(c.var.body);
    if (!body.success) return c.json({ error: body.error.issues[0].message }, 400);
    const result = await accounts.signup(body.data);
    if ('error' in result) return c.json(result, 409);
    startSession(c, result.token);
    return c.json(publicUser(result.user), 201);
  });
  api.post('/account/login', async (c) => {
    const body = credentialsBody.safeParse(c.var.body);
    const ip = clientIP(c);
    const username = typeof c.var.body.username === 'string' ? c.var.body.username.trim() : '';
    if (limiter.blocked(ip, username))
      return c.json({ error: 'Too many failed logins. Try again later.' }, 429);
    const result = body.success ? await accounts.login(body.data) : null;
    if (!result) {
      limiter.fail(ip, username);
      return c.json({ error: 'Wrong username or password.' }, 401);
    }
    startSession(c, result.token);
    return c.json(publicUser(result.user));
  });
  api.post('/account/logout', (c) => {
    const token = getCookie(c, accountCookie);
    if (token) accounts.logout(token);
    deleteCookie(c, accountCookie, { path: '/', secure: secureRequest(c) });
    return c.json({});
  });
  api.get('/account/me', (c) => {
    const user = signedIn(c);
    return user ? c.json(publicUser(user)) : c.json({ error: 'Not signed in.' }, 401);
  });
  api.post('/account/character', (c) => {
    const user = signedIn(c);
    if (!user) return c.json({ error: 'Log in to save a character.' }, 401);
    accounts.saveCharacter(user.id, character(c.var.body));
    return c.json(publicUser(user));
  });
  api.post('/join', (c) => {
    const body = c.var.body;
    const user = signedIn(c);
    if (user) {
      // The stored character wins over anything the request sends.
      const look = { model: body.model, ...character(accounts.character(user.id) ?? {}) };
      const result = room.join(user.username, look, undefined, user.id);
      return 'error' in result ? c.json(result, 409) : c.json(result, 201);
    }
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 16) : '';
    if (name && accounts.usernameTaken(name))
      return c.json({ error: 'That name belongs to a registered player. Log in or pick another.' }, 409);
    const result = room.join(name, body);
    return 'error' in result ? c.json(result, 409) : c.json(result, 201);
  });
  api.on('POST', authenticatedCommands, async (c, next) => {
    const { token } = c.var.body;
    const session = typeof token === 'string' && room.sessionFor(token);
    if (!session) return c.json({ error: 'Your car left the junction. Join again.' }, 401);
    c.set('session', session);
    await next();
  });
  api.post('/input', (c) => {
    const result = inputCommand.safeParse(c.var.body);
    if (result.success) room.input(c.var.session, result.data);
    return c.json({});
  });
  api.post('/vehicle', (c) => {
    const result = doorCommand.safeParse(c.var.body);
    if (!result.success) return c.json({ error: 'Please try the door again.' }, 409);
    const error = room.vehicle(c.var.session, result.data);
    return error ? c.json({ error }, 409) : c.json({});
  });
  api.post('/chat', (c) => {
    const result = chatCommand.safeParse(c.var.body);
    if (!result.success)
      return c.json({ error: 'Enter a message within the character limit.' }, 400);
    const { text, channel } = result.data;
    const { player } = c.var.session;
    publishChat(
      channel === 'local'
        ? { type: 'local', playerId: player.id, text }
        : { type: 'message', message: room.chat(c.var.session, text) },
      player,
    );
    return c.json({}, 201);
  });
  api.post('/race', (c) => {
    const result = raceCommandBody.safeParse(c.var.body);
    if (!result.success) return c.json({ error: 'Invalid race command.' }, 409);
    const error = room.race(c.var.session, result.data);
    return error ? c.json({ error }, 409) : c.json({});
  });
  api.post('/leave', (c) => {
    room.leave(c.var.session);
    return c.json({});
  });
  api.notFound((c) => c.json({ error: 'Unknown route.' }, 404));
  return api;
}
