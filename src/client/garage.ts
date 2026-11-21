import { livery, models } from '../game/garage';
import type { AccountProfile, OwnedVehicle } from '../protocol/commands';
import { el } from './hud';
import { post } from './network';
import { drawVehicle } from './renderer';

// Lists an account's vehicles, switches the active one and starts a repaint.
export function setupOwnedVehicles(
  profile: () => AccountProfile | null,
  replace: (profile: AccountProfile) => void,
  repaint: (vehicle: OwnedVehicle) => void,
) {
  const dialog = el('garage'),
    list = el('garage-list'),
    error = el('garage-error');

  function fail(message: string) {
    error.textContent = message;
    error.hidden = !message;
  }

  async function use(vehicle: OwnedVehicle) {
    fail('');
    const result = await post('/account/vehicles/active', { id: vehicle.id }).catch(() => null);
    if (!result?.ok) return fail(result?.error ?? 'Could not reach the garage. Try again.');
    replace(result.data);
    draw();
  }

  function draw() {
    const account = profile();
    list.replaceChildren();
    for (const vehicle of account?.vehicles ?? []) {
      const active = vehicle.id === account?.activeVehicleId;
      const item = document.createElement('li');
      item.classList.toggle('active', active);
      const preview = Object.assign(document.createElement('canvas'), { width: 96, height: 36 });
      preview.setAttribute('aria-hidden', 'true');
      drawVehicle(preview, livery(vehicle));
      const name = document.createElement('span');
      name.className = 'vehicle-name';
      name.textContent = models[vehicle.model].name;
      const details = document.createElement('small');
      details.textContent = (vehicle.plate || 'No plate') + (active ? ' · Driving' : '');
      name.append(details);
      const choose = Object.assign(document.createElement('button'), {
        type: 'button',
        textContent: 'Drive this',
        hidden: active,
        onclick: () => use(vehicle),
      });
      const paint = Object.assign(document.createElement('button'), {
        type: 'button',
        className: 'secondary',
        textContent: 'Repaint',
        onclick: () => repaint(vehicle),
      });
      item.append(preview, name, choose, paint);
      list.append(item);
    }
  }

  el('garage-close').onclick = () => dialog.close();
  return {
    open() {
      fail('');
      draw();
      dialog.showModal();
    },
    refresh: draw,
  };
}
