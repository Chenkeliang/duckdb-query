/** Regression 2026-10-13: Enter should save a connection without an extra test-only step. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DatabaseForm from '../DatabaseForm';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const connection = {
  id: 'orders', name: 'Orders', type: 'mysql', requiresPassword: true,
  params: { host: 'localhost', port: 3306, database: 'orders', username: 'reader' },
};

describe('connection form workflow', () => {
  it('saves on Enter and retains stored-password semantics', async () => {
    const save = vi.fn(); const test = vi.fn();
    render(<DatabaseForm configToLoad={connection} onSave={save} onTest={test} />);
    await userEvent.click(screen.getByLabelText('page.datasource.connection.name'));
    await userEvent.keyboard('{Enter}');
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'orders', useStoredPassword: true }));
    expect(test).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'page.datasource.flow.saveChanges' })).toBeInTheDocument();
  });
  it('keeps test feedback visible, but discards it when settings change', async () => {
    render(<DatabaseForm configToLoad={connection} onTest={vi.fn().mockResolvedValue({ success: true, message: 'Connection verified' })} />);
    await userEvent.click(screen.getByRole('button', { name: 'page.datasource.connection.test' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Connection verified');
    await userEvent.type(screen.getByLabelText('page.datasource.connection.host'), '-changed');
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
  it('does not show a stale response if settings change while the test is running', async () => {
    let finish!: (value: { success: boolean; message: string }) => void;
    const test = vi.fn(() => new Promise<{ success: boolean; message: string }>((resolve) => { finish = resolve; }));
    render(<DatabaseForm configToLoad={connection} onTest={test} />);
    await userEvent.click(screen.getByRole('button', { name: 'page.datasource.connection.test' }));
    await userEvent.type(screen.getByLabelText('page.datasource.connection.host'), '-changed');
    finish({ success: true, message: 'Old settings verified' });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
  it('prevents saving during connection testing and exposes a direct cancel action', async () => {
    const cancel = vi.fn();
    const { rerender } = render(<DatabaseForm configToLoad={connection} onCancel={cancel} testing />);
    expect(screen.getByRole('button', { name: 'page.datasource.flow.saveChanges' })).toBeDisabled();
    rerender(<DatabaseForm configToLoad={connection} onCancel={cancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
    expect(cancel).toHaveBeenCalledOnce();
  });
});
