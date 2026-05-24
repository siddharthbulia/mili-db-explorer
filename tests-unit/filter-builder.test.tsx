import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBuilder } from '../src/renderer/components/FilterBuilder';
import type { ColumnFilter } from '../src/shared/grid-filters';

const COLUMNS = [
  { name: 'id',    dataType: 'uuid' },
  { name: 'email', dataType: 'text' },
  { name: 'total', dataType: 'numeric' },
];

/**
 * FilterBuilder is controlled — its `filters` prop is the source of truth.
 * For typing tests we wrap it in a stateful host so React actually re-renders
 * the value back into the input each keystroke.
 */
function Harness({ initial = [], onApply, expose }: {
  initial?: ColumnFilter[];
  onApply?: () => void;
  expose?: (filters: ColumnFilter[]) => void;
}) {
  const [filters, setFilters] = useState<ColumnFilter[]>(initial);
  return (
    <FilterBuilder
      columns={COLUMNS}
      filters={filters}
      onChange={(next) => { setFilters(next); expose?.(next); }}
      onApply={onApply}
    />
  );
}

describe('<FilterBuilder>', () => {
  it('renders the apply / clear-all buttons', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /^Apply$/ })).toBeInTheDocument();
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('emits the typed value back through onChange', async () => {
    let latest: ColumnFilter[] = [];
    render(<Harness expose={(f) => { latest = f; }} />);
    const valueBoxes = screen.getAllByRole('textbox');
    await userEvent.type(valueBoxes[0], 'alice');
    expect(latest.length).toBe(1);
    expect(latest[0].value).toBe('alice');
  });

  it('Clear all wipes the existing filters', async () => {
    let latest: ColumnFilter[] = [];
    render(<Harness
      initial={[{ column: 'email', op: 'eq', value: 'x@y' }]}
      expose={(f) => { latest = f; }}
    />);
    await userEvent.click(screen.getByText('Clear all'));
    expect(latest).toEqual([]);
  });

  it('Apply button fires onApply', async () => {
    const onApply = vi.fn();
    render(<Harness onApply={onApply} />);
    await userEvent.click(screen.getByText('Apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('changing the operator on an existing row preserves it', async () => {
    // We start with a real filter (value 'x') so the row is "meaningful" and
    // the FilterBuilder doesn't drop it after the op change.
    let latest: ColumnFilter[] = [];
    render(<Harness
      initial={[{ column: 'email', op: 'contains-i', value: 'x' }]}
      expose={(f) => { latest = f; }}
    />);
    const opSelect = screen.getAllByRole('combobox')[1];
    await userEvent.selectOptions(opSelect, 'eq');
    expect(latest[0].op).toBe('eq');
    expect(latest[0].value).toBe('x');
  });
});
