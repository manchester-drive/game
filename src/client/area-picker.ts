import { startArea, startAreas, type StartArea } from '../game/areas';
import { boundary } from '../game/region';
import { el } from './hud';

const xs = boundary.map(([x]) => x),
  ys = boundary.map(([, y]) => y);
const left = Math.min(...xs),
  top = Math.min(...ys),
  width = Math.max(...xs) - left,
  height = Math.max(...ys) - top;

// Shows the starting areas as pins on the world map. Save decides where the choice goes.
export function setupAreaPicker(save: (area: StartArea) => Promise<string | null>) {
  const dialog = el('area-picker'),
    form = el('area-form'),
    error = el('area-error'),
    plot = form.querySelector<HTMLElement>('.area-plot')!;
  let area: StartArea = 'piccadilly',
    saving = false,
    saved = false,
    onChange: (() => void) | undefined,
    onClose: ((saved: boolean) => void) | undefined;

  plot.style.aspectRatio = width + ' / ' + height;
  plot.querySelector('svg')!.setAttribute('viewBox', [left, top, width, height].join(' '));
  for (const [key, { name, x, y }] of Object.entries(startAreas)) {
    const pin = document.createElement('label');
    pin.style.left = ((x - left) / width) * 100 + '%';
    pin.style.top = ((y - top) / height) * 100 + '%';
    const radio = Object.assign(document.createElement('input'), {
      type: 'radio',
      name: 'area',
      value: key,
    });
    pin.append(radio, name);
    el('area-pins').append(pin);
  }

  function chosen() {
    return startArea(form.querySelector<HTMLInputElement>('input[name=area]:checked')?.value);
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

  function set(next: StartArea) {
    area = startArea(next);
    el('area-open').textContent = 'Start: ' + startAreas[area].name;
    onChange?.();
  }

  return {
    current: () => area,
    set,
    // Resolves true when the player chose an area, false when they cancelled.
    open() {
      fail('');
      saved = false;
      el('area-terrain').setAttribute('href', '/world-map.svg#terrain');
      for (const radio of form.querySelectorAll<HTMLInputElement>('input[name=area]'))
        radio.checked = radio.value === area;
      dialog.showModal();
      return new Promise<boolean>((resolve) => (onClose = resolve));
    },
    onChange(listener: () => void) {
      onChange = listener;
    },
  };
}
