import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SQLChangePreviewDialog } from '../SQLChangePreviewDialog';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);
it('mounts read-only diff editors after the dialog portal appears and cancels without applying', async () => {
  const apply = vi.fn(); const cancel = vi.fn();
  render(<SQLChangePreviewDialog beforeSql="SELECT 42" afterSql="SELECT 43" targetLabel="SQL 1" stale={false} targetClosed={false} onCancel={cancel} onApply={apply} />);
  await waitFor(() => expect(screen.getByLabelText('query.ai.changePreview.before')).toHaveTextContent('SELECT 42'));
  expect(screen.getByLabelText('query.ai.changePreview.after')).toHaveTextContent('SELECT 43');
  expect(screen.getByLabelText('query.ai.changePreview.before')).toHaveAttribute('contenteditable', 'false');
  expect(document.querySelector('.cm-changedText')).toHaveTextContent(/42|43/);
  fireEvent.click(screen.getByText('actions.cancel'));
  expect(cancel).toHaveBeenCalledOnce(); expect(apply).not.toHaveBeenCalled();
});
