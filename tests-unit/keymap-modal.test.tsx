import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeymapModal } from '../src/renderer/components/KeymapModal';

describe('<KeymapModal>', () => {
  it('renders nothing when closed', () => {
    render(<KeymapModal open={false} onClose={() => {}} />);
    expect(screen.queryByText('Keyboard shortcuts')).not.toBeInTheDocument();
  });

  it('shows grouped shortcuts when open', () => {
    render(<KeymapModal open={true} onClose={() => {}} />);
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Tabs & windows')).toBeInTheDocument();
    expect(screen.getByText('SQL editor')).toBeInTheDocument();
    expect(screen.getByText('Data grid')).toBeInTheDocument();
  });

  it('filter input narrows the list', async () => {
    render(<KeymapModal open={true} onClose={() => {}} />);
    const filter = screen.getByPlaceholderText(/Filter — try/i);
    await userEvent.type(filter, 'EXPLAIN');
    // The SQL editor section should still be present...
    expect(screen.getByText('SQL editor')).toBeInTheDocument();
    // ...but unrelated rows should be gone. "First / last row" is in Data grid,
    // not SQL editor, so it shouldn't match "EXPLAIN".
    expect(screen.queryByText('First / last row')).not.toBeInTheDocument();
  });

  it('shows "No shortcut matches" when filter has zero hits', async () => {
    render(<KeymapModal open={true} onClose={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText(/Filter — try/i), 'zzzzz_no_match');
    expect(screen.getByText(/No shortcut matches/i)).toBeInTheDocument();
  });
});
