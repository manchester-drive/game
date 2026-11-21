import type { AccountProfile } from '../protocol/commands';
import { el } from './hud';
import { post } from './network';

// Shows who is signed in and runs the sign-up and log-in dialog.
export function setupAccount(
  onChange: (account: AccountProfile | null, signedUp: boolean) => void,
) {
  const dialog = el('account-dialog'),
    form = el('account-form'),
    error = el('account-error');
  let account: AccountProfile | null = null,
    busy = false;

  function show(next: AccountProfile | null, signedUp = false) {
    account = next;
    const status = el('account-status');
    status.replaceChildren();
    if (account) {
      const name = document.createElement('strong');
      name.textContent = account.username;
      status.append('Signed in as ', name);
    } else status.textContent = 'Playing as a guest';
    el('account-open').hidden = !!account;
    el('account-logout').hidden = !account;
    el('name').hidden = el('name-label').hidden = !!account;
    onChange(account, signedUp);
  }

  function fail(message: string) {
    error.textContent = message;
    error.hidden = !message;
  }

  el('account-open').onclick = () => {
    fail('');
    dialog.showModal();
  };
  el('account-cancel').onclick = () => dialog.close();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const mode = (event.submitter as HTMLButtonElement | null)?.value === 'signup' ? 'signup' : 'login';
    busy = true;
    fail('');
    try {
      const result = await post(mode === 'signup' ? '/account/signup' : '/account/login', {
        username: el('account-username').value.trim(),
        password: el('account-password').value,
      });
      if (!result.ok) return fail(result.error);
      el('account-password').value = '';
      dialog.close();
      show(result.data, mode === 'signup');
    } catch {
      fail('Could not reach the server. Try again.');
    } finally {
      busy = false;
    }
  });
  el('account-logout').onclick = async () => {
    try {
      await post('/account/logout', {});
      show(null);
    } catch {
      /* Still signed in; the button stays available. */
    }
  };

  fetch('/account/me')
    .then((response) => (response.ok ? response.json() : null))
    .then(show, () => show(null));

  return { current: () => account };
}
