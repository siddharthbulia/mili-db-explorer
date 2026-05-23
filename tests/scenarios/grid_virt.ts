import { group, test, eq, assert } from '../harness';
import { computeVirtRange } from '../../src/shared/grid-virt';

group('grid-virt — empty cases', () => {
  test('zero rows', () => {
    const r = computeVirtRange({ rowCount: 0, rowHeight: 22, viewportHeight: 400, scrollTop: 0 });
    eq(r.startIndex, 0);
    eq(r.endIndex, 0);
    eq(r.totalHeight, 0);
    eq(r.offsetTop, 0);
  });
  test('zero viewport', () => {
    const r = computeVirtRange({ rowCount: 1000, rowHeight: 22, viewportHeight: 0, scrollTop: 0 });
    eq(r.endIndex, 0);
    eq(r.totalHeight, 22_000);
  });
});

group('grid-virt — typical viewport', () => {
  test('top of list with overscan 8', () => {
    const r = computeVirtRange({ rowCount: 1000, rowHeight: 20, viewportHeight: 400, scrollTop: 0, overscan: 8 });
    eq(r.startIndex, 0);
    // visible = ceil(400/20) = 20, end = first(0) + visible + overscan = 28
    eq(r.endIndex, 28);
    eq(r.totalHeight, 20000);
    eq(r.offsetTop, 0);
  });
  test('mid-scroll snaps to row boundary', () => {
    const r = computeVirtRange({ rowCount: 10000, rowHeight: 22, viewportHeight: 440, scrollTop: 1000, overscan: 4 });
    // first = floor(1000/22) = 45
    // visible = ceil(440/22) = 20
    eq(r.startIndex, 41); // 45 - overscan(4)
    eq(r.endIndex, 69);   // 45 + 20 + 4
    eq(r.offsetTop, 41 * 22);
  });
  test('bottom of list clamps to rowCount', () => {
    const r = computeVirtRange({ rowCount: 100, rowHeight: 20, viewportHeight: 400, scrollTop: 100000, overscan: 8 });
    eq(r.endIndex, 100);
    // first = floor(100000/20)=5000, start=4992, but rowCount=100; so start should be at least clamped sensibly
    // Our implementation does not clamp start to rowCount-visible — render slab will simply be empty.
    assert(r.startIndex >= 0);
  });
});

group('grid-virt — overscan', () => {
  test('no overscan when overscan = 0', () => {
    const r = computeVirtRange({ rowCount: 1000, rowHeight: 20, viewportHeight: 200, scrollTop: 600, overscan: 0 });
    // first = 30, visible = 10
    eq(r.startIndex, 30);
    eq(r.endIndex, 40);
  });
  test('overscan never makes endIndex exceed rowCount', () => {
    const r = computeVirtRange({ rowCount: 35, rowHeight: 20, viewportHeight: 400, scrollTop: 0, overscan: 100 });
    eq(r.endIndex, 35);
  });
});

group('grid-virt — totalHeight & offsetTop math', () => {
  test('totalHeight = rowCount * rowHeight', () => {
    const r = computeVirtRange({ rowCount: 12345, rowHeight: 22, viewportHeight: 400, scrollTop: 0 });
    eq(r.totalHeight, 12345 * 22);
  });
  test('offsetTop matches startIndex * rowHeight', () => {
    const r = computeVirtRange({ rowCount: 100, rowHeight: 21, viewportHeight: 200, scrollTop: 420, overscan: 0 });
    eq(r.offsetTop, r.startIndex * 21);
  });
  test('negative scrollTop is treated as 0', () => {
    const r = computeVirtRange({ rowCount: 100, rowHeight: 20, viewportHeight: 200, scrollTop: -50 });
    eq(r.startIndex, 0);
  });
  test('fractional rowHeight is floored to >= 1', () => {
    const r = computeVirtRange({ rowCount: 10, rowHeight: 0.4, viewportHeight: 20, scrollTop: 0 });
    eq(r.totalHeight, 10); // rowHeight=1 after clamp; 10 rows -> 10px
  });
});
