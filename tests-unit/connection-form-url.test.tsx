/**
 * ConnectionForm has a small postgres:// URL parser. We drive the actual
 * component to verify it.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionForm } from '../src/renderer/components/ConnectionForm';
import { useApp } from '../src/renderer/store';

beforeEach(() => {
  // Open the form before each test and provide a default no-op showToast.
  useApp.setState({
    showConnectionForm: 'new',
    showToast: () => {},
  });
});

describe('<ConnectionForm> URL parser', () => {
  it('parses host/port/db/user/password from a postgres:// URL', async () => {
    render(<ConnectionForm />);
    await userEvent.type(
      screen.getByPlaceholderText(/Paste postgres:\/\//),
      'postgresql://alice:secret123@db.example.com:6543/orders',
    );
    await userEvent.click(screen.getByText('Parse'));
    // Use label text to disambiguate (Name and Host both got "db.example.com").
    expect((screen.getByLabelText('Host') as HTMLInputElement).value).toBe('db.example.com');
    expect((screen.getByLabelText('Database') as HTMLInputElement).value).toBe('orders');
    expect((screen.getByLabelText('User') as HTMLInputElement).value).toBe('alice');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('secret123');
    expect((screen.getByLabelText('Port') as HTMLInputElement).value).toBe('6543');
  });

  it('flips SSL to require when ?sslmode=require is set', async () => {
    render(<ConnectionForm />);
    await userEvent.type(
      screen.getByPlaceholderText(/Paste postgres:\/\//),
      'postgres://u@h/db?sslmode=require',
    );
    await userEvent.click(screen.getByText('Parse'));
    const ssl = screen.getByLabelText('SSL') as HTMLSelectElement;
    expect(ssl.value).toBe('require');
  });

  it('rejects non-postgres URLs via a toast', async () => {
    const showToast = vi.fn();
    useApp.setState({ showToast });
    render(<ConnectionForm />);
    await userEvent.type(
      screen.getByPlaceholderText(/Paste postgres:\/\//),
      'mysql://u@h/db',
    );
    await userEvent.click(screen.getByText('Parse'));
    expect(showToast).toHaveBeenCalled();
    const [kind, msg] = showToast.mock.calls[0];
    expect(kind).toBe('error');
    expect(msg).toMatch(/postgres/i);
  });
});
