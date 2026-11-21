import {
  character,
  figures,
  hairColours,
  hairStyles,
  jackets,
  skinTones,
  trousers,
  type Character,
} from '../game/garage';
import { el } from './hud';
import { drawCharacter } from './renderer';

const storageKey = 'manchester-drive:character';
const fields = [
  ['hairStyle', hairStyles],
  ['hair', hairColours],
  ['skin', skinTones],
  ['jacket', jackets],
  ['trousers', trousers],
] as const;

function title(key: string, value: unknown) {
  if (typeof value === 'object' && value && 'name' in value) return String(value.name);
  if (typeof value === 'string' && !value.startsWith('#')) return value;
  return key[0].toUpperCase() + key.slice(1);
}

function remembered(): Character {
  try {
    return character(JSON.parse(localStorage.getItem(storageKey) ?? '{}'));
  } catch {
    return character();
  }
}

// Edits the on-foot look. Save decides where it goes: the account or this browser.
export function setupCreator(save: (look: Character) => Promise<string | null>) {
  const dialog = el('creator'),
    form = el('creator-form'),
    error = el('creator-error');
  let look = remembered(),
    draft = look,
    saving = false,
    frame = 0;
  const tiles = new Map<keyof typeof figures, HTMLCanvasElement>();

  for (const [key, name] of Object.entries(figures) as [keyof typeof figures, string][]) {
    const tile = document.createElement('label');
    const radio = Object.assign(document.createElement('input'), {
      type: 'radio',
      name: 'figure',
      value: key,
    });
    const preview = Object.assign(document.createElement('canvas'), { width: 60, height: 60 });
    preview.setAttribute('aria-hidden', 'true');
    tile.append(radio, preview, name);
    el('figure-tiles').append(tile);
    tiles.set(key, preview);
    radio.onchange = () => update({ figure: key });
  }
  for (const [id, palette] of fields) {
    for (const [key, value] of Object.entries(palette)) el(id).add(new Option(title(key, value), key));
    el(id).onchange = () => update({ [id]: el(id).value });
  }

  function update(change: Partial<Character>) {
    draft = character({ ...draft, ...change });
    for (const [id] of fields) el(id).value = draft[id];
    for (const radio of form.querySelectorAll<HTMLInputElement>('input[name=figure]'))
      radio.checked = radio.value === draft.figure;
    for (const [figure, canvas] of tiles) drawCharacter(canvas, { ...draft, figure }, 0);
  }

  function animate(now: number) {
    if (!dialog.open) return;
    drawCharacter(el('creator-preview'), draft, now / 1000, true);
    frame = requestAnimationFrame(animate);
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
      const problem = await save(draft);
      if (problem) return fail(problem);
      set(draft);
      dialog.close();
    } finally {
      saving = false;
    }
  });
  el('creator-cancel').onclick = () => dialog.close();
  dialog.addEventListener('close', () => cancelAnimationFrame(frame));

  function set(next: Character) {
    look = character(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(look));
    } catch {
      /* The look still applies for this page. */
    }
    onChange?.();
  }
  let onChange: (() => void) | undefined;

  return {
    current: () => look,
    set,
    open(start = look) {
      fail('');
      update(start);
      dialog.showModal();
      frame = requestAnimationFrame(animate);
    },
    onChange(listener: () => void) {
      onChange = listener;
    },
  };
}
