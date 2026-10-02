import { test } from 'node:test';
import assert from 'node:assert/strict';
import { purgeDrop, purgeExpired } from './purge.ts';

type Event = string;

function deps(opts: { failKeys?: string[]; drops?: { id: string; keys: string[] }[] } = {}) {
  const events: Event[] = [];
  return {
    events,
    deps: {
      list: async () => opts.drops ?? [],
      deleteObject: async (key: string) => {
        if (opts.failKeys?.includes(key)) throw new Error(`boom ${key}`);
        events.push(`obj:${key}`);
      },
      deleteRow: async (id: string) => {
        events.push(`row:${id}`);
      },
    },
  };
}

test('purgeDrop deletes every object before its row', async () => {
  const { deps: d, events } = deps();
  await purgeDrop(d, { id: 'a', keys: ['drops/a/1.jpg', 'drops/a/2.pdf'] });
  assert.deepEqual(events, ['obj:drops/a/1.jpg', 'obj:drops/a/2.pdf', 'row:a']);
});

test('purgeDrop keeps the row when an object cannot be deleted', async () => {
  // The row is the only record of which keys to retry. Dropping it after a
  // failed delete would orphan the bytes for good.
  const { deps: d, events } = deps({ failKeys: ['drops/a/2.pdf'] });
  await assert.rejects(() => purgeDrop(d, { id: 'a', keys: ['drops/a/1.jpg', 'drops/a/2.pdf'] }), /boom/);
  assert.ok(!events.includes('row:a'));
});

test('purgeDrop removes the row of a transfer that has no files', async () => {
  const { deps: d, events } = deps();
  await purgeDrop(d, { id: 'empty', keys: [] });
  assert.deepEqual(events, ['row:empty']);
});

test('purgeExpired purges every listed transfer', async () => {
  const { deps: d, events } = deps({
    drops: [
      { id: 'a', keys: ['drops/a/1.jpg'] },
      { id: 'b', keys: ['drops/b/1.jpg'] },
    ],
  });
  const result = await purgeExpired(d);
  assert.deepEqual(result.purged, ['a', 'b']);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(events, ['obj:drops/a/1.jpg', 'row:a', 'obj:drops/b/1.jpg', 'row:b']);
});

test('one failing transfer does not stop the rest, and is reported', async () => {
  const { deps: d, events } = deps({
    failKeys: ['drops/a/1.jpg'],
    drops: [
      { id: 'a', keys: ['drops/a/1.jpg'] },
      { id: 'b', keys: ['drops/b/1.jpg'] },
    ],
  });
  const result = await purgeExpired(d);
  assert.deepEqual(result.purged, ['b']);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].id, 'a');
  assert.match(result.failed[0].error, /boom/);
  assert.ok(!events.includes('row:a'));
  assert.ok(events.includes('row:b'));
});

test('a run is capped so one morning cannot exhaust the Worker', async () => {
  const drops = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, keys: [`drops/d${i}/f`] }));
  const { deps: d } = deps({ drops });
  const result = await purgeExpired(d, 2);
  assert.deepEqual(result.purged, ['d0', 'd1']);
  assert.equal(result.remaining, 3);
});

test('nothing expired is a clean no-op', async () => {
  const { deps: d, events } = deps();
  const result = await purgeExpired(d);
  assert.deepEqual(result, { purged: [], failed: [], remaining: 0 });
  assert.deepEqual(events, []);
});
