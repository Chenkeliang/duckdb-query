/** Regression 2026-10-12: dismissing the non-modal task drawer must retain editor focus. */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../Query/QueryWorkspace', () => ({ QueryWorkspace: ({ taskActions }: { taskActions: React.ReactNode }) => <><div>{taskActions}</div><textarea aria-label="SQL draft" defaultValue="SELECT 1" /></> }));
vi.mock('../Query/AsyncTasks', () => ({ AsyncTaskPanel: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>Close panel</button> }));
import { QueryWorkbenchPage } from '../QueryWorkbenchPage';
function Workbench() {
  const [open, setOpen] = React.useState(false);
  return <QueryWorkbenchPage asyncTasksOpen={open} onAsyncTasksOpenChange={setOpen} />;
}
describe('task drawer focus', () => {
  it('keeps focus in the outside editor when that click dismisses the panel', async () => {
    const user = userEvent.setup(); render(<Workbench />);
    const trigger = screen.getByRole('button', { name: /async.tasksEntry/ });
    await user.click(trigger);
    await screen.findByRole('button', { name: 'Close panel' });
    const editor = screen.getByRole('textbox', { name: 'SQL draft' });
    await user.click(editor);
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    await waitFor(() => expect(editor).toHaveFocus());
    await user.keyboard(' -- draft');
    expect(editor).toHaveValue('SELECT 1 -- draft');
  });
  it('returns focus to Tasks after explicit close', async () => {
    const user = userEvent.setup(); render(<Workbench />);
    const trigger = screen.getByRole('button', { name: /async.tasksEntry/ });
    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Close panel' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
