import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotifyStore } from './notify.ts';

test('toasts are added, deduplicated and dismissed', () => {
  const n = createNotifyStore();
  let changes = 0;
  n.subscribe(() => changes++);
  const a = n.error('Falhou');
  const b = n.error('Falhou');
  assert.equal(a, b, 'Same message is not stacked twice');
  n.success('Salvo');
  assert.deepEqual(n.getToasts().map((t) => t.kind), ['error', 'success']);
  n.dismiss(a);
  assert.deepEqual(n.getToasts().map((t) => t.message), ['Salvo']);
  assert.ok(changes >= 4);
  n.dismiss(n.getToasts()[0].id);
});

test('at most 4 toasts are visible', () => {
  const n = createNotifyStore();
  for (let i = 0; i < 6; i++) n.info(`m${i}`);
  assert.deepEqual(n.getToasts().map((t) => t.message), ['m2', 'm3', 'm4', 'm5']);
  n.getToasts().forEach((t) => n.dismiss(t.id));
});

test('confirm resolves with the user choice and leaves the queue', async () => {
  const n = createNotifyStore();
  const p = n.confirm({ title: 'Abrir?', message: 'Há alterações não salvas.' });
  const req = n.getConfirm()!;
  assert.equal(req.title, 'Abrir?');
  req.resolve(true);
  assert.equal(await p, true);
  assert.equal(n.getConfirm(), null);
});
