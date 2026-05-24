/**
 * Renderer store tests — exercise the Zustand state machine without
 * mounting any React components. The store contains real product logic
 * (tab persistence, favorites, recents, undo of close, etc) that's worth
 * locking down with fast tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(async () => {
  localStorage.clear();
  // Reset module state between tests. Vitest caches imports per worker.
  vi.resetModules();
});

async function freshStore() {
  const m = await import('../src/renderer/store');
  return m.useApp;
}

describe('useApp store — favorites', () => {
  it('starts empty', async () => {
    const s = (await freshStore()).getState();
    expect(s.favorites).toEqual([]);
    expect(s.isFavorite({ connectionId: 'c1', schema: 'public', table: 't' })).toBe(false);
  });

  it('toggle adds, second toggle removes', async () => {
    const u = await freshStore();
    const ref = { connectionId: 'c1', schema: 'public', table: 'orders' };
    u.getState().toggleFavorite(ref);
    expect(u.getState().favorites).toHaveLength(1);
    expect(u.getState().isFavorite(ref)).toBe(true);
    u.getState().toggleFavorite(ref);
    expect(u.getState().favorites).toEqual([]);
  });

  it('persists across re-imports via localStorage', async () => {
    const u1 = await freshStore();
    u1.getState().toggleFavorite({ connectionId: 'c1', schema: 'public', table: 't1' });
    vi.resetModules();
    const u2 = await freshStore();
    expect(u2.getState().favorites).toHaveLength(1);
  });
});

describe('useApp store — recents', () => {
  it('records most recent first, capped at 12', async () => {
    const u = await freshStore();
    for (let i = 0; i < 20; i++) {
      u.getState().recordRecent({ connectionId: 'c', schema: 'public', table: `t${i}` });
    }
    const r = u.getState().recents;
    expect(r).toHaveLength(12);
    expect(r[0].table).toBe('t19');
  });

  it('moving an existing ref to top doesn\'t duplicate it', async () => {
    const u = await freshStore();
    u.getState().recordRecent({ connectionId: 'c', schema: 'public', table: 'a' });
    u.getState().recordRecent({ connectionId: 'c', schema: 'public', table: 'b' });
    u.getState().recordRecent({ connectionId: 'c', schema: 'public', table: 'a' });
    expect(u.getState().recents).toEqual([
      { connectionId: 'c', schema: 'public', table: 'a' },
      { connectionId: 'c', schema: 'public', table: 'b' },
    ]);
  });
});

describe('useApp store — tabs', () => {
  it('newSqlTab creates a tab and activates it', async () => {
    const u = await freshStore();
    const id = u.getState().newSqlTab('conn-1');
    expect(id).toBeTruthy();
    expect(u.getState().tabs).toHaveLength(1);
    expect(u.getState().tabs[0].kind).toBe('sql');
    expect(u.getState().activeTabId).toBe(id);
  });

  it('closing the active tab activates the previous one', async () => {
    const u = await freshStore();
    const a = u.getState().newSqlTab(null);
    const b = u.getState().newSqlTab(null);
    expect(u.getState().activeTabId).toBe(b);
    u.getState().closeTab(b);
    expect(u.getState().activeTabId).toBe(a);
  });

  it('closing the only tab leaves activeTabId null', async () => {
    const u = await freshStore();
    const id = u.getState().newSqlTab(null);
    u.getState().closeTab(id);
    expect(u.getState().activeTabId).toBeNull();
    expect(u.getState().tabs).toEqual([]);
  });

  it('reopenLastClosedTab brings back the most recently closed tab', async () => {
    const u = await freshStore();
    const id = u.getState().newSqlTab(null);
    u.getState().updateTab(id, { sql: 'select 42', title: 'meaning' } as any);
    u.getState().closeTab(id);
    expect(u.getState().tabs).toHaveLength(0);
    u.getState().reopenLastClosedTab();
    expect(u.getState().tabs).toHaveLength(1);
    const restored = u.getState().tabs[0];
    expect(restored.kind).toBe('sql');
    expect((restored as any).sql).toBe('select 42');
    // The restored tab gets a new id so two closes-then-reopens don't collide.
    expect(restored.id).not.toBe(id);
  });

  it('duplicateActiveTab clones SQL + title', async () => {
    const u = await freshStore();
    const id = u.getState().newSqlTab(null);
    u.getState().updateTab(id, { sql: 'SELECT 1', title: 'q' } as any);
    u.getState().duplicateActiveTab();
    expect(u.getState().tabs).toHaveLength(2);
    expect((u.getState().tabs[1] as any).sql).toBe('SELECT 1');
  });
});

describe('useApp store — openTableTab', () => {
  it('reuses the existing tab when re-opening the same table', async () => {
    const u = await freshStore();
    const id1 = u.getState().openTableTab('c', 'public', 'orders');
    const id2 = u.getState().openTableTab('c', 'public', 'orders');
    expect(id1).toBe(id2);
    expect(u.getState().tabs).toHaveLength(1);
  });

  it('opens distinct tabs for distinct (schema,table) pairs', async () => {
    const u = await freshStore();
    u.getState().openTableTab('c', 'public', 'orders');
    u.getState().openTableTab('c', 'public', 'users');
    u.getState().openTableTab('c', 'analytics', 'orders');
    expect(u.getState().tabs).toHaveLength(3);
  });
});

describe('useApp store — notifications', () => {
  it('toast also appends to the notifications history', async () => {
    const u = await freshStore();
    u.getState().showToast('error', 'Boom');
    u.getState().showToast('success', 'OK');
    const n = u.getState().notifications;
    expect(n).toHaveLength(2);
    // Most recent first.
    expect(n[0].kind).toBe('success');
    expect(n[1].message).toBe('Boom');
  });

  it('clearNotifications empties history but doesn\'t cancel the active toast', async () => {
    const u = await freshStore();
    u.getState().showToast('info', 'hi');
    u.getState().clearNotifications();
    expect(u.getState().notifications).toEqual([]);
    expect(u.getState().toast?.message).toBe('hi');
  });
});

describe('useApp store — pinned schemas', () => {
  it('toggles per (connectionId, schema)', async () => {
    const u = await freshStore();
    u.getState().togglePinnedSchema('c1', 'public');
    expect(u.getState().isPinnedSchema('c1', 'public')).toBe(true);
    expect(u.getState().isPinnedSchema('c1', 'analytics')).toBe(false);
    expect(u.getState().isPinnedSchema('c2', 'public')).toBe(false);
    u.getState().togglePinnedSchema('c1', 'public');
    expect(u.getState().isPinnedSchema('c1', 'public')).toBe(false);
  });
});
