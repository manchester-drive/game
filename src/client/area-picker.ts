import { startAreas, startChoice, type StartChoice } from '../game/areas';
import type { Position } from '../game/game-types';
import { boundary } from '../game/region';
import { el } from './hud';

const xs = boundary.map(([x]) => x),
  ys = boundary.map(([, y]) => y);
const left = Math.min(...xs),
  top = Math.min(...ys),
  width = Math.max(...xs) - left,
  height = Math.max(...ys) - top;

// Shows the starting areas as pins on the world map. Save decides where the choice goes.
export function setupAreaPicker(save: (area: StartChoice) => Promise<string | null>) {
  const dialog = el('area-picker'),
    form = el('area-form'),
    error = el('area-error'),
    plot = form.querySelector<HTMLElement>('.area-plot')!;
  let area: StartChoice = 'piccadilly',
    parked: Position | null = null,
    saving = false,
    saved = false,
    onChange: (() => void) | undefined,
    onClose: ((saved: boolean) => void) | undefined;

  plot.style.aspectRatio = width + ' / ' + height;
  plot.querySelector('svg')!.setAttribute('viewBox', [left, top, width, height].join(' '));
  function addPin(key: string, name: string) {
    const pin = document.createElement('label');
    const radio = Object.assign(document.createElement('input'), {
      type: 'radio',
      name: 'area',
      value: key,
    });
    pin.append(radio, name);
    el('area-pins').append(pin);
    return pin;
  }
  function place(pin: HTMLElement, { x, y }: Position) {
    pin.style.left = ((x - left) / width) * 100 + '%';
    pin.style.top = ((y - top) / height) * 100 + '%';
  }
  // Only accounts with a parked vehicle see this pin.
  const parkedPin = addPin('parked', 'Your car');
  parkedPin.classList.add('parked');
  parkedPin.hidden = true;
  for (const [key, centre] of Object.entries(startAreas)) place(addPin(key, centre.name), centre);

  function chosen() {
    return startChoice(form.querySelector<HTMLInputElement>('input[name=area]:checked')?.value);
  }
  // Without a parking spot, the server starts the player at Piccadilly.
  function effective(choice: StartChoice) {
    return choice === 'parked' && !parked ? 'piccadilly' : choice;
  }

  function fail(message: string) {
    error.textContent = message;
    error.hidden = !message;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    fail('');
    try {
      const next = chosen();
      const problem = await save(next);
      if (problem) return fail(problem);
      set(next);
      saved = true;
      dialog.close();
    } finally {
      saving = false;
    }
  });
  el('area-cancel').onclick = () => dialog.close();
  dialog.addEventListener('close', () => onClose?.(saved));

  function set(next: StartChoice) {
    area = startChoice(next);
    const shown = effective(area);
    el('area-open').textContent =
      'Start: ' + (shown === 'parked' ? 'where you parked' : startAreas[shown].name);
    onChange?.();
  }

  function setParked(spot: Position | null) {
    parked = spot;
    parkedPin.hidden = !spot;
    if (spot) place(parkedPin, spot);
    set(area);
  }

  return {
    current: () => area,
    set,
    setParked,
    // Resolves true when the player chose an area, false when they cancelled.
    open() {
      fail('');
      saved = false;
      el('area-terrain').setAttribute('href', '/world-map.svg#terrain');
      const shown = effective(area);
      for (const radio of form.querySelectorAll<HTMLInputElement>('input[name=area]'))
        radio.checked = radio.value === shown;
      dialog.showModal();
      return new Promise<boolean>((resolve) => (onClose = resolve));
    },
    onChange(listener: () => void) {
      onChange = listener;
    },
  };
}
