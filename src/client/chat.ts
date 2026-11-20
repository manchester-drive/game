import {
  chatHistoryLimit,
  chatTextLimit,
  type ChatEvent,
  type ChatMessage,
} from '../protocol/chat';
import { el } from './hud';
import { post } from './network';

export function setupChat(releaseControls: () => void) {
  const dialog = el('chat-dialog'),
    toggle = el('chat-toggle'),
    log = el('chat-log');
  const form = el('chat-form'),
    input = el('chat-input'),
    send = el('chat-send');
  const status = el('chat-status'),
    badge = el('chat-unread');
  input.maxLength = chatTextLimit;
  let token: string | undefined,
    online = false,
    sending = false,
    error = '';
  let unread = 0,
    receivedHistory = false;

  function updateBadge() {
    badge.textContent = String(unread);
    badge.hidden = unread === 0;
    toggle.setAttribute('aria-label', unread ? `Global chat, ${unread} unread` : 'Global chat');
  }

  function open() {
    releaseControls();
    dialog.showModal();
    log.scrollTop = log.scrollHeight;
    unread = 0;
    updateBadge();
    if (token) input.focus();
  }
  toggle.onclick = open;
  el('chat-close').onclick = () => dialog.close();

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
    line.dataset.id = message.id;
    line.append(name, ' ', message.text);
    log.append(line);
  }

  function receive(event: ChatEvent) {
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 12;
    if (event.type === 'history') {
      // Reconnects replace the transcript, including any messages missed offline.
      if (receivedHistory && !dialog.open) {
        const lastId = log.lastElementChild?.getAttribute('data-id');
        const last = event.messages.findIndex((m) => m.id === lastId);
        unread = Math.min(event.messages.length, unread + event.messages.length - last - 1);
      }
      receivedHistory = true;
      log.replaceChildren();
      for (const message of event.messages) append(message);
    } else {
      append(event.message);
      if (log.childElementCount > chatHistoryLimit) log.firstElementChild!.remove();
      if (!dialog.open) unread = Math.min(unread + 1, chatHistoryLimit);
    }
    el('chat-empty').hidden = !!log.childElementCount;
    if (dialog.open && atEnd) log.scrollTop = log.scrollHeight;
    updateBadge();
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
  return { dialog, open, receive, updateSession };
}
