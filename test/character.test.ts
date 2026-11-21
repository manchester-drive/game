import { expect, test } from 'bun:test';
import { character, figures, hairStyles, trousers } from '../src/game/garage';
import { drawCharacter } from '../src/client/renderer';

test('unknown or hostile character keys fall back to defaults', () => {
  expect(
    character({
      figure: 'robot',
      hairStyle: 'constructor',
      hair: '__proto__',
      skin: 42,
      jacket: 'toString',
      trousers: null,
    }),
  ).toEqual(character());
  expect(character({ figure: 'feminine', hairStyle: 'bun' })).toMatchObject({
    figure: 'feminine',
    hairStyle: 'bun',
  });
});

test('every figure, hair style and lower renders with real palette colours', () => {
  const fills: unknown[] = [];
  const context = new Proxy(
    {},
    {
      get: (_, key) => (key === 'fillStyle' ? undefined : () => {}),
      set: (_, key, value) => {
        if (key === 'fillStyle') fills.push(value);
        return true;
      },
    },
  );
  const canvas = { width: 60, height: 60, getContext: () => context } as unknown as HTMLCanvasElement;
  for (const figure of Object.keys(figures) as (keyof typeof figures)[])
    for (const hairStyle of Object.keys(hairStyles) as (keyof typeof hairStyles)[])
      for (const lower of Object.keys(trousers) as (keyof typeof trousers)[])
        for (const time of [0, 0.1, 0.2])
          drawCharacter(canvas, { ...character(), figure, hairStyle, trousers: lower }, time, true);
  expect(fills.length).toBeGreaterThan(0);
  for (const fill of fills) expect(fill).toMatch(/^#[0-9a-f]{6}$/i);
});
