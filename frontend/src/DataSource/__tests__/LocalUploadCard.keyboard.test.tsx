import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocalUploadCard } from '../upload/LocalUploadCard';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/api', () => ({ CHUNKED_UPLOAD_THRESHOLD_BYTES: 8 * 1024 * 1024 }));

describe('LocalUploadCard keyboard file selection', () => {
  it('opens the file input with Enter and Space without uploading', () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const upload = vi.fn();
    try {
      render(<LocalUploadCard maxFileSizeDisplay="50GB" selectedFile={null} uploadAlias="" uploading={false} uploadProgress={null} dragOver={false} csvOptions={{}} onFileSelect={vi.fn()} onUploadAliasChange={vi.fn()} onDragOver={vi.fn()} onCsvOptionsChange={vi.fn()} onUpload={upload} onClear={vi.fn()} />);
      const picker = screen.getByRole('button', { name: 'page.datasource.desktopPickFileBtn' });
      expect(picker).toHaveAttribute('tabindex', '0');
      fireEvent.keyDown(picker, { key: 'Enter' });
      fireEvent.keyDown(picker, { key: ' ' });
      expect(inputClick).toHaveBeenCalledTimes(2);
      expect(upload).not.toHaveBeenCalled();
    } finally {
      inputClick.mockRestore();
    }
  });
});
