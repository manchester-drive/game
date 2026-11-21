import { livery, models, paints, starterModels, stripes, trims, type Livery } from '../game/garage';
import { el } from './hud';
import { drawVehicle } from './renderer';

const storageKey = 'manchester-drive:car';
const fields = [
  ['paint', paints],
  ['trim', trims],
  ['stripe', stripes],
] as const;
const names: Record<string, string> = { body: 'Paint colour', none: 'None' };

function remembered(): Livery {
  try {
    return livery(JSON.parse(localStorage.getItem(storageKey) ?? '{}'));
  } catch {
    return livery();
  }
}

// Picks a starter model and its livery. Save decides where it goes: the account or this browser.
// Repainting an owned vehicle keeps its model, so the model tiles are hidden.
export function setupCarPicker(
  save: (ride: Livery, repaintId: string | undefined) => Promise<string | null>,
) {
  const dialog = el('car-picker'),
    form = el('car-form'),
    error = el('car-error');
  let ride = remembered(),
    draft = ride,
    saving = false,
    saved = false,
    repaintId: string | undefined,
    onChange: (() => void) | undefined,
    onClose: ((saved: boolean) => void) | undefined;

  for (const key of starterModels) {
    const model = models[key];
    const tile = document.createElement('label');
    const radio = Object.assign(document.createElement('input'), {
      type: 'radio',
      name: 'model',
      value: key,
    });
    const stats = document.createElement('small');
    stats.textContent = Math.round(model.topSpeed * 0.45) + ' mph top speed';
    tile.append(radio, model.name, stats);
    el('model-tiles').append(tile);
    radio.onchange = () => update({ model: key });
  }
  for (const [id, palette] of fields) {
    for (const key of Object.keys(palette))
      el(id).add(new Option(names[key] ?? key[0].toUpperCase() + key.slice(1), key));
    el(id).onchange = () => update({ [id]: el(id).value });
  }
  el('plate').oninput = () => update({ plate: el('plate').value }, false);

  function update(change: Partial<Livery>, syncPlate = true) {
    draft = livery({ ...draft, ...change });
    for (const [id] of fields) el(id).value = draft[id];
    if (syncPlate) el('plate').value = draft.plate;
    for (const radio of form.querySelectorAll<HTMLInputElement>('input[name=model]'))
      radio.checked = radio.value === draft.model;
    drawVehicle(el('car-preview'), draft);
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
      const problem = await save(draft, repaintId);
      if (problem) return fail(problem);
      if (!repaintId) set(draft);
      saved = true;
      dialog.close();
    } finally {
      saving = false;
    }
  });
  el('car-cancel').onclick = () => dialog.close();
  dialog.addEventListener('close', () => onClose?.(saved));

  function set(next: Livery) {
    ride = livery(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(ride));
    } catch {
      /* The car still applies for this page. */
    }
    onChange?.();
  }

  return {
    current: () => ride,
    set,
    // Resolves true when the player saved a car, false when they cancelled.
    open(start = ride, repaint?: string) {
      fail('');
      saved = false;
      repaintId = repaint;
      el('car-title').textContent = repaint ? 'Repaint ' + models[start.model].name.toLowerCase() : 'Your first car';
      form.querySelector<HTMLElement>('.figure-tiles')!.hidden = !!repaint;
      // Only starters can be picked as a first car, so a stored model outside them falls back.
      update(repaint || starterModels.includes(start.model) ? start : { ...start, model: 'hatch' });
      dialog.showModal();
      return new Promise<boolean>((resolve) => (onClose = resolve));
    },
    onChange(listener: () => void) {
      onChange = listener;
    },
  };
}
