import {
  chatHistoryLimit,
  chatTextLimit,
  localChatMetres,
  withinEarshot,
  type ChatEvent,
  type ChatMessage,
} from '../protocol/chat';
import type { VisiblePlayer } from '../protocol/snapshots';
import { el } from './hud';
import { post } from './network';

export function setupChat(releaseControls: () => void) {
  const panel = el('chat-panel'),
    log = el('chat-log');
  const form = el('chat-form'),
    input = el('chat-input'),
    send = el('chat-send');
  const status = el('chat-status'),
    channel = el('chat-channel'),
    layer = el('speech-bubbles');
  const bubbles = new Map<string, { element: HTMLElement; until: number }>();
  input.maxLength = chatTextLimit;
  let token: string | undefined,
    online = false,
    sending = false,
    error = '';

  panel.addEventListener('focusin', releaseControls);
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      el('map').focus({ preventScroll: true });
    }
  });

  setupResize(panel, el('chat-resize'));

  function refreshForm() {
    form.hidden = !token;
    channel.hidden = !token;
    channel.disabled = sending;
    const local = channel.value === 'local';
    el('chat-title').textContent = local ? 'Local chat' : 'Global chat';
    input.placeholder = local ? `Speak within ${localChatMetres} m…` : 'Message everyone…';
    log.hidden = local;
    el('chat-empty').hidden = local || !!log.childElementCount;
    send.disabled = !online || sending || !input.value.trim();
    status.textContent = !online
      ? 'Reconnecting…'
      : !token
        ? 'Join the game to send a message.'
        : error;
    status.hidden = !status.textContent;
  }
  input.oninput = refreshForm;
  function channelChanged() {
    error = '';
    refreshForm();
  }
  channel.onchange = () => {
    channelChanged();
    input.focus();
  };
  window.addEventListener('keydown', (event) => {
    if (!token || event.key !== 'Enter' || !event.altKey) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (event.repeat || channel.disabled) return;
    channel.value = channel.value === 'global' ? 'local' : 'global';
    channelChanged();
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    const draft = input.value,
      sender = token;
    if (!sender || !online || sending || !draft.trim()) return;
    input.focus();
    sending = true;
    error = '';
    refreshForm();
    try {
      const reply = await post('/chat', {
        token: sender,
        text: draft.trim(),
        channel: channel.value === 'local' ? 'local' : 'global',
      });
      if (sender !== token) return;
      if (!reply.ok) error = reply.error;
      else if (input.value === draft) input.value = '';
    } catch {
      if (sender === token)
        error = 'Message could not be confirmed. Check the chat before retrying.';
    } finally {
      sending = false;
      refreshForm();
    }
  };

  function append(message: ChatMessage) {
    const line = document.createElement('p'),
      name = document.createElement('strong');
    name.style.color = message.color;
    name.textContent = message.name;
    line.append(name, ' ');
    if (message.guest) {
      const tag = document.createElement('small');
      tag.className = 'guest-tag';
      tag.textContent = 'guest';
      line.append(tag);
    }
    line.append(message.text);
    log.append(line);
  }

  function receive(event: ChatEvent) {
    if (event.type === 'local') {
      if (!token) return;
      const element = bubbles.get(event.playerId)?.element ?? document.createElement('span');
      element.className = 'speech-bubble';
      element.hidden = true;
      element.textContent = event.text;
      if (!element.isConnected) layer.append(element);
      bubbles.set(event.playerId, { element, until: performance.now() + 6000 });
      return;
    }
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 12;
    if (event.type === 'history') {
      log.replaceChildren();
      for (const message of event.messages) append(message);
    } else {
      append(event.message);
      if (log.childElementCount > chatHistoryLimit) log.firstElementChild!.remove();
    }
    el('chat-empty').hidden = log.hidden || !!log.childElementCount;
    if (atEnd) log.scrollTop = log.scrollHeight;
  }

  function drawBubbles(
    players: VisiblePlayer[],
    listener: VisiblePlayer | null,
    now: number,
    view: { x: number; y: number; width: number; height: number },
  ) {
    for (const [id, { element, until }] of bubbles) {
      if (now >= until) {
        element.remove();
        bubbles.delete(id);
        continue;
      }
      const speaker = players.find((p) => p.id === id);
      if (!speaker || !listener || !withinEarshot(speaker, listener)) {
        element.hidden = true;
        continue;
      }
      if (element.hidden) {
        element.setAttribute('aria-label', speaker.name + ' says ' + element.textContent);
        element.hidden = false;
      }
      element.style.left = ((speaker.x - view.x) / view.width) * 100 + '%';
      element.style.top = ((speaker.y - view.y - 25) / view.height) * 100 + '%';
    }
  }

  function updateSession(next: string | undefined, connected: boolean) {
    if (next === token && connected === online) return;
    if (next !== token) {
      channel.value = 'global';
      input.value = '';
      error = '';
    }
    if (next !== token || !connected) {
      layer.replaceChildren();
      bubbles.clear();
    }
    token = next;
    online = connected;
    refreshForm();
  }
  return { receive, updateSession, drawBubbles };
}

const sizeKey = 'manchester-drive:chat-size';
const minWidth = 256,
  minLog = 48,
  keyStep = 24;

// The panel sits in the bottom-left corner, so its grip is top-right:
// dragging right widens it and dragging up gives the log more lines.
function setupResize(panel: HTMLElement, grip: HTMLElement) {
  const log = el('chat-log');
  let width = 0,
    height = 0;

  function apply(nextWidth: number, nextHeight: number) {
    const main = el('map').parentElement!;
    width = Math.round(Math.min(Math.max(nextWidth, minWidth), Math.max(minWidth, main.clientWidth - 48)));
    height = Math.round(Math.min(Math.max(nextHeight, minLog), Math.max(minLog, main.clientHeight - 200)));
    panel.style.setProperty('--chat-width', width + 'px');
    panel.style.setProperty('--chat-log-height', height + 'px');
    panel.classList.add('sized');
  }
  function save() {
    try {
      localStorage.setItem(sizeKey, JSON.stringify({ width, height }));
    } catch {}
  }
  try {
    const saved = JSON.parse(localStorage.getItem(sizeKey) ?? 'null');
    if (Number.isFinite(saved?.width) && Number.isFinite(saved?.height)) apply(saved.width, saved.height);
  } catch {}

  let drag: { id: number; x: number; y: number; width: number; height: number } | null = null;
  grip.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    grip.setPointerCapture(event.pointerId);
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: panel.offsetWidth,
      height: log.hidden ? height || minLog : log.offsetHeight,
    };
    panel.classList.add('resizing');
  });
  grip.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    apply(drag.width + event.clientX - drag.x, drag.height - (event.clientY - drag.y));
  });
  grip.addEventListener('lostpointercapture', () => {
    if (!drag) return;
    drag = null;
    panel.classList.remove('resizing');
    if (width) save();
  });
  grip.addEventListener('dblclick', () => {
    panel.classList.remove('sized');
    panel.style.removeProperty('--chat-width');
    panel.style.removeProperty('--chat-log-height');
    width = height = 0;
    try {
      localStorage.removeItem(sizeKey);
    } catch {}
  });
  grip.addEventListener('keydown', (event) => {
    const delta: Record<string, [number, number]> = {
      ArrowRight: [keyStep, 0],
      ArrowLeft: [-keyStep, 0],
      ArrowUp: [0, keyStep],
      ArrowDown: [0, -keyStep],
    };
    const step = delta[event.key];
    if (!step) return;
    event.preventDefault();
    apply(
      (width || panel.offsetWidth) + step[0],
      (height || (log.hidden ? minLog : log.offsetHeight)) + step[1],
    );
    save();
  });
}
