// Fixed-row-height virtualization math (docs/PERFORMANCE.md §5.1).
// Pure function so we can unit-test it without React.

export interface VirtRange {
  /** Inclusive index of the first row to render. */
  startIndex: number;
  /** Exclusive index of the last row to render. */
  endIndex: number;
  /** Total scrollable height in pixels. */
  totalHeight: number;
  /** Pixel offset to position the rendered slab. */
  offsetTop: number;
}

export interface VirtInput {
  rowCount: number;
  rowHeight: number;
  viewportHeight: number;
  scrollTop: number;
  /** Overscan rows above and below for smooth scrolling. */
  overscan?: number;
}

export function computeVirtRange(input: VirtInput): VirtRange {
  const rowH = Math.max(1, Math.floor(input.rowHeight));
  const overscan = Math.max(0, input.overscan ?? 8);
  const rowCount = Math.max(0, input.rowCount | 0);
  const viewportH = Math.max(0, input.viewportHeight | 0);
  const scrollTop = Math.max(0, input.scrollTop | 0);

  const totalHeight = rowCount * rowH;
  if (rowCount === 0 || viewportH === 0) {
    return { startIndex: 0, endIndex: 0, totalHeight, offsetTop: 0 };
  }

  const first = Math.floor(scrollTop / rowH);
  const visible = Math.ceil(viewportH / rowH);
  const startIndex = Math.max(0, first - overscan);
  const endIndex = Math.min(rowCount, first + visible + overscan);
  return {
    startIndex,
    endIndex,
    totalHeight,
    offsetTop: startIndex * rowH,
  };
}
