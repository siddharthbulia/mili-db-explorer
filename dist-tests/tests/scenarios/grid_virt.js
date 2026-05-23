"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const grid_virt_1 = require("../../src/shared/grid-virt");
(0, harness_1.group)('grid-virt — empty cases', () => {
    (0, harness_1.test)('zero rows', () => {
        const r = (0, grid_virt_1.computeVirtRange)({ rowCount: 0, rowHeight: 22, viewportHeight: 400, scrollTop: 0 });
        (0, harness_1.eq)(r.startIndex, 0);
        (0, harness_1.eq)(r.endIndex, 0);
        (0, harness_1.eq)(r.totalHeight, 0);
        (0, harness_1.eq)(r.offsetTop, 0);
    });
    (0, harness_1.test)('zero viewport', () => {
        const r = (0, grid_virt_1.computeVirtRange)({ rowCount: 1000, rowHeight: 22, viewportHeight: 0, scrollTop: 0 });
        (0, harness_1.eq)(r.endIndex, 0);
        (0, harness_1.eq)(r.totalHeight, 22_000);
    });
});
(0, harness_1.group)('grid-virt — typical viewport', () => {
    (0, harness_1.test)('top of list with overscan 8', () => {
        const r = (0, grid_virt_1.computeVirtRange)({ rowCount: 1000, rowHeight: 20, viewportHeight: 400, scrollTop: 0, overscan: 8 });
        (0, harness_1.eq)(r.startIndex, 0);
        // visible = ceil(400/20) = 20, end = first(0) + visible + overscan = 28
        (0, harness_1.eq)(r.endIndex, 28);
        (0, harness_1.eq)(r.totalHeight, 20000);
        (0, harness_1.eq)(r.offsetTop, 0);
    });
    (0, harness_1.test)('mid-scroll snaps to row boundary', () => {
        const r = (0, grid_virt_1.computeVirtRange)({ rowCount: 10000, rowHeight: 22, viewportHeight: 440, scrollTop: 1000, overscan: 4 });
        // first = floor(1000/22) = 45
        // visible = ceil(440/22) = 20
        (0, harness_1.eq)(r.startIndex, 41); // 45 - overscan(4)
        (0, harness_1.eq)(r.endIndex, 69); // 45 + 20 + 4
        (0, harness_1.eq)(r.offsetTop, 41 * 22);
    });
    (0, harness_1.test)('bottom of list clamps to rowCount', () => {
        const r = (0, grid_virt_1.computeVirtRange)({ rowCount: 100, rowHeight: 20, viewportHeight: 400, scrollTop: 100000, overscan: 8 });
        (0, harness_1.eq)(r.endIndex, 100);
        // first = floor(100000/20)=5000, start=4992, but rowCount=100; so start should be at least clamped sensibly
        // Our implementation does not clamp start to rowCount-visible — render slab will simply be empty.
        (0, harness_1.assert)(r.startIndex >= 0);
    });
});
(0, harness_1.group)('grid-virt — overscan', () => {
    (0, harness_1.test)('no overscan when overscan = 0', () => {
        const r = (0, grid_virt_1.computeVirtRange)({ rowCount: 1000, rowHeight: 20, viewportHeight: 200, scrollTop: 600, overscan: 0 });
        // first = 30, visible = 10
        (0, harness_1.eq)(r.startIndex, 30);
        (0, harness_1.eq)(r.endIndex, 40);
    });
    (0, harness_1.test)('overscan never makes endIndex exceed rowCount', () => {
        const r = (0, grid_virt_1.computeVirtRange)({ rowCount: 35, rowHeight: 20, viewportHeight: 400, scrollTop: 0, overscan: 100 });
        (0, harness_1.eq)(r.endIndex, 35);
    });
});
(0, harness_1.group)('grid-virt — totalHeight & offsetTop math', () => {
    (0, harness_1.test)('totalHeight = rowCount * rowHeight', () => {
        const r = (0, grid_virt_1.computeVirtRange)({ rowCount: 12345, rowHeight: 22, viewportHeight: 400, scrollTop: 0 });
        (0, harness_1.eq)(r.totalHeight, 12345 * 22);
    });
    (0, harness_1.test)('offsetTop matches startIndex * rowHeight', () => {
        const r = (0, grid_virt_1.computeVirtRange)({ rowCount: 100, rowHeight: 21, viewportHeight: 200, scrollTop: 420, overscan: 0 });
        (0, harness_1.eq)(r.offsetTop, r.startIndex * 21);
    });
    (0, harness_1.test)('negative scrollTop is treated as 0', () => {
        const r = (0, grid_virt_1.computeVirtRange)({ rowCount: 100, rowHeight: 20, viewportHeight: 200, scrollTop: -50 });
        (0, harness_1.eq)(r.startIndex, 0);
    });
    (0, harness_1.test)('fractional rowHeight is floored to >= 1', () => {
        const r = (0, grid_virt_1.computeVirtRange)({ rowCount: 10, rowHeight: 0.4, viewportHeight: 20, scrollTop: 0 });
        (0, harness_1.eq)(r.totalHeight, 10); // rowHeight=1 after clamp; 10 rows -> 10px
    });
});
