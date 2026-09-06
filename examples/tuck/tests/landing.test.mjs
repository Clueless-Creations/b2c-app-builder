import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLanding, PRIMARY, BACKUP, RECOVERY } from './landing-harness.mjs';

test('packing, undo, and reload preserve exact item and count state', async () => {
  const page = loadLanding();
  const before = page.state();
  page.pack('item-0');
  assert.equal(page.element('#progress-label').textContent, '1 of 6 packed');
  assert.equal(page.element('#items').children[0].children[0].attributes.get('aria-pressed'), 'true');
  assert.deepEqual(loadLanding(page.storage).state(), page.state());
  await page.click('#undo');
  assert.deepEqual(page.state(), before);
  assert.deepEqual(loadLanding(page.storage).state(), before);
});

test('list and table invoke the same packing transition and empty bags never complete', async () => {
  const page = loadLanding();
  await page.click('#list-view');
  await page.element('#items').children[1].children[0].click();
  assert.equal(page.state().trip.items[1].packed, true);
  await page.click('#table-view');
  assert.equal(page.element('#progress-label').textContent, '1 of 6 packed');
  const empty = page.state();
  empty.trip.items = [];
  await page.importFile(JSON.stringify(empty));
  assert.equal(page.element('#completion').hidden, true);
  assert.equal(page.element('#progress-label').textContent, '0 of 0 packed');
});

test('cancelled or outside drops do not pack; a bag drop changes exactly one item', async () => {
  for (const outcome of ['outside', 'cancelled', 'inside']) {
    const page = loadLanding();
    const button = page.element('#items').children[0].children[0];
    await button.dispatch('pointerdown', { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    const point = outcome === 'outside' ? 100 : 250;
    await button.dispatch('pointermove', { pointerId: 1, clientX: point, clientY: point });
    await button.dispatch(outcome === 'cancelled' ? 'pointercancel' : 'pointerup', { pointerId: 1, clientX: point, clientY: point });
    assert.equal(page.state().trip.items.filter((item) => item.packed).length, outcome === 'inside' ? 1 : 0);
    assert.equal(page.element('#bag-zone').classList.contains('drag-over'), false);
    assert.equal(button.listeners.get('pointermove').size, 0);
  }
});

test('invalid, unsupported, oversized and unreadable imports preserve primary and backup', async () => {
  for (const input of ['{broken', JSON.stringify({ version: 9 }), JSON.stringify({ version: 1, trip: { name: 'Bad', nights: 3, items: [null] } })]) {
    const page = loadLanding();
    page.pack('item-0');
    const before = new Map(page.storage);
    await page.importFile(input);
    assert.deepEqual(page.storage, before);
    assert.equal(page.element('#import-error').hidden, false);
    assert.doesNotMatch(page.element('#import-error').textContent, /Cannot read properties|TypeError|SyntaxError/, 'invalid data needs authored recovery copy, not JavaScript internals');
    assert.equal(page.element('#import-list').value, '');
  }
  const page = loadLanding();
  const before = new Map(page.storage);
  await page.importFile('{}', 128 * 1024 + 1);
  assert.deepEqual(page.storage, before);
  const input = page.element('#import-list');
  input.files = [{ size: 10, text: async () => { throw new Error('Cannot read selected file'); } }];
  await input.dispatch('change');
  assert.equal(page.element('#import-error').hidden, false);
  assert.deepEqual(page.storage, before);
});

test('import cancellation is a no-op and valid replacement remains recoverable by restore', async () => {
  const page = loadLanding();
  page.pack('item-0');
  const original = page.state();
  page.element('#import-list').files = [];
  await page.element('#import-list').dispatch('change');
  assert.deepEqual(page.state(), original);
  const imported = structuredClone(original);
  imported.trip.name = 'A separate saved bag';
  await page.importFile(JSON.stringify(imported));
  assert.deepEqual(page.state(), imported);
  await page.click('#restore-backup');
  assert.deepEqual(page.state(), original);
  assert.deepEqual(JSON.parse(page.storage.get(BACKUP)), imported);
  await page.click('#restore-backup');
  assert.deepEqual(page.state(), imported);
});

test('ordinary actions cannot overwrite malformed startup data or its valid backup', async () => {
  const valid = loadLanding().storage.get(PRIMARY);
  const page = loadLanding(new Map([[PRIMARY, '{damaged'], [BACKUP, valid]]));
  const before = new Map(page.storage);
  page.pack('item-0');
  assert.deepEqual(page.storage, before);
  assert.equal(page.element('#data-dialog').open, true);
  assert.equal(page.state().trip.items[0].packed, false);
  await page.click('#restore-backup');
  assert.equal(page.storage.get(RECOVERY), '{damaged');
  assert.deepEqual(page.state(), JSON.parse(valid));
  assert.equal(page.storage.get(BACKUP), valid);
});

test('startup read and initial write failures never claim that the visible bag was saved', async () => {
  for (const options of [{ failRead: true }, { failWrite: PRIMARY }]) {
    const page = loadLanding(new Map(), options);
    const startupCopy = [
      page.element('#save-status').textContent,
      page.element('#status-message span').textContent,
      page.element('#recovery-notice-copy').textContent,
    ].join(' ');

    assert.equal(page.storage.size, 0);
    assert.equal(page.element('#recovery-notice').hidden, false);
    assert.match(startupCopy, /has not been saved/);
    assert.doesNotMatch(startupCopy, /previous save is safe|saved on this device|unreadable save is kept/i);

    await page.click('#open-recovery');
    const recoveryCopy = [page.element('#recovery-copy').textContent, page.element('#start-fresh').textContent].join(' ');
    assert.match(recoveryCopy, /has not been saved|try saving this fresh bag again/i);
    assert.doesNotMatch(recoveryCopy, /previous save is safe|unreadable save is kept/i);

    await page.importFile('{broken');
    assert.match(page.element('#import-error').textContent, /bag shown here is unchanged/i);
    assert.doesNotMatch(page.element('#import-error').textContent, /current bag is safe/i);

    page.options.failRead = false;
    page.options.failWrite = undefined;
    await page.click('#start-fresh');
    assert.deepEqual(JSON.parse(page.storage.get(PRIMARY)), page.state());
    assert.equal(page.element('#save-status').textContent, 'Saved on this device');
    assert.match(page.element('#status-message span').textContent, /ready and saved on this device/);
  }
});

test('corrupt startup copy distinguishes retained unreadable data from the unsaved visible bag', async () => {
  const page = loadLanding(new Map([[PRIMARY, '{damaged']]));
  const startupCopy = [page.element('#status-message span').textContent, page.element('#recovery-notice-copy').textContent].join(' ');

  assert.equal(page.storage.get(PRIMARY), '{damaged');
  assert.match(startupCopy, /unreadable data remains in this browser/i);
  assert.match(startupCopy, /has not been saved/i);
  assert.doesNotMatch(startupCopy, /previous save is safe/i);

  await page.click('#open-recovery');
  assert.match(page.element('#recovery-copy').textContent, /unreadable data remains in this browser/i);
  assert.equal(page.element('#start-fresh').textContent, 'Keep the unreadable save and start fresh');
  await page.click('#start-fresh');
  assert.equal(page.storage.get(RECOVERY), '{damaged');
  assert.deepEqual(JSON.parse(page.storage.get(PRIMARY)), page.state());
  assert.match(page.element('#status-message span').textContent, /unreadable save is kept separately/i);
});

test('failed primary write preserves visible state and previous recovery backup', async () => {
  const page = loadLanding();
  page.pack('item-0');
  page.pack('item-1');
  const beforeState = page.state();
  const beforeStorage = new Map(page.storage);
  page.options.failWrite = PRIMARY;
  page.pack('item-2');
  assert.deepEqual(page.state(), beforeState);
  assert.equal(page.storage.get(PRIMARY), beforeStorage.get(PRIMARY));
  assert.equal(page.storage.get(BACKUP), beforeStorage.get(BACKUP), 'failed save must not overwrite the prior recovery point');
  assert.match(page.element('#save-status').textContent, /Couldn’t save/);
});

test('failed backup write prevents primary replacement and leaves editor input available', async () => {
  const page = loadLanding();
  await page.click('#edit-trip');
  page.element('#trip-input').value = 'Keep this entered name';
  page.element('#nights-input').value = '4';
  const before = new Map(page.storage);
  page.options.failWrite = BACKUP;
  await page.element('#edit-form').dispatch('submit');
  assert.deepEqual(page.storage, before);
  assert.equal(page.element('#edit-dialog').open, true);
  assert.equal(page.element('#trip-input').value, 'Keep this entered name');
  assert.match(page.element('#save-status').textContent, /Couldn’t save/);
});

test('only the latest backup selection can replace the bag or report an error', async () => {
  for (const olderOutcome of ['success', 'failure']) {
    const page = loadLanding();
    const input = page.element('#import-list');
    let resolveOlder, rejectOlder;
    const older = new Promise((resolve, reject) => { resolveOlder = resolve; rejectOlder = reject; });
    input.files = [{ size: 100, text: () => older }];
    const pending = input.dispatch('change');
    const newest = page.state();
    newest.trip.name = 'The bag I chose last';
    await page.importFile(JSON.stringify(newest));
    const saved = new Map(page.storage);
    if (olderOutcome === 'success') resolveOlder(JSON.stringify(loadLanding().state()));
    else rejectOlder(new Error('Stale read failed'));
    await pending;
    assert.deepEqual(page.state(), newest);
    assert.deepEqual(page.storage, saved);
    assert.equal(page.element('#import-error').hidden, true);
    assert.equal(input.value, '');
  }
});

test('closing, cancelling, editing, or restoring a bag invalidates pending backup reads', async () => {
  for (const action of ['close', 'cancel', 'edit', 'restore']) {
    const page = loadLanding();
    page.pack('item-0');
    let resolveRead;
    page.element('#import-list').files = [{ size: 100, text: () => new Promise((resolve) => { resolveRead = resolve; }) }];
    const pending = page.element('#import-list').dispatch('change');
    if (action === 'edit') page.pack('item-1');
    else if (action === 'restore') await page.click('#restore-backup');
    else await page.element('#data-dialog').dispatch(action);
    const saved = new Map(page.storage);
    const current = page.state();
    const stale = structuredClone(current);
    stale.trip.name = 'This read was cancelled';
    resolveRead(JSON.stringify(stale));
    await pending;
    assert.deepEqual(page.state(), current);
    assert.deepEqual(page.storage, saved);
  }
});
