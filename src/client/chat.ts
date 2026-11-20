import {
  chatHistoryLimit,
  chatTextLimit,
  type ChatEvent,
  type ChatMessage,
} from '../protocol/chat';
import { el } from './hud';
import { post } from './network';

export function setupChat(releaseControls: () => void) {
  const panel = el('chat-panel'),
    log = el('chat-log');
  const form = el('chat-form'),
    input = el('chat-input'),
    send = el('chat-send');
  const status = el('chat-status');
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

  function refreshForm() {
    form.hidden = !token;
    send.disabled = !online || sending || !input.value.trim();
    status.textContent = !online
      ? 'Reconnecting…'
      : !token
        ? 'Join the game to send a message.'
        : error;
    status.hidden = !status.textContent;
  }
  input.oninput = refreshForm;
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
      const reply = await post('/chat', { token: sender, text: draft.trim() });
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
    line.append(name, ' ', message.text);
    log.append(line);
  }

  function receive(event: ChatEvent) {
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 12;
    if (event.type === 'history') {
      log.replaceChildren();
      for (const message of event.messages) append(message);
    } else {
      append(event.message);
      if (log.childElementCount > chatHistoryLimit) log.firstElementChild!.remove();
    }
    el('chat-empty').hidden = !!log.childElementCount;
    if (atEnd) log.scrollTop = log.scrollHeight;
  }

  function updateSession(next: string | undefined, connected: boolean) {
    if (next === token && connected === online) return;
    if (next !== token) {
      input.value = '';
      error = '';
    }
    token = next;
    online = connected;
    refreshForm();
  }
  return { receive, updateSession };
}
