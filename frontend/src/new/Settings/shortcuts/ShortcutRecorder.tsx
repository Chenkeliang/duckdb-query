/**
 * ShortcutRecorder - Component for recording new keyboard shortcuts
 * Captures key combinations and validates against conflicts
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/new/components/ui/button';
import { formatShortcut } from './defaultShortcuts';
import { AlertCircle, Check, X } from 'lucide-react';

interface ShortcutRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
  onCancel: () => void;
  existingShortcuts: string[];
}

export function ShortcutRecorder({
  value,
  onChange,
  onCancel,
  existingShortcuts,
}: ShortcutRecorderProps) {
  const { t } = useTranslation('common');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedShortcut, setRecordedShortcut] = useState(value);
  const [conflict, setConflict] = useState<string | null>(null);

  // Check for conflicts
  const checkConflict = useCallback((shortcut: string): string | null => {
    const conflicting = existingShortcuts.find(
      (s) => s.toLowerCase() === shortcut.toLowerCase()
    );
    return conflicting || null;
  }, [existingShortcuts]);

  // Handle key capture
  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Escape cancels recording
      if (event.key === 'Escape') {
        setIsRecording(false);
        setRecordedShortcut(value);
        setConflict(null);
        return;
      }

      // Ignore modifier-only presses
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) {
        return;
      }

      // Must have at least one modifier
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        return;
      }

      const shortcut = formatShortcut(event);
      setRecordedShortcut(shortcut);

      // Check for conflicts
      const conflictingShortcut = checkConflict(shortcut);
      setConflict(conflictingShortcut);
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isRecording, value, checkConflict]);

  // Start recording
  const handleStartRecording = () => {
    setIsRecording(true);
    setRecordedShortcut('');
    setConflict(null);
  };

  // Confirm the new shortcut
  const handleConfirm = () => {
    if (recordedShortcut && !conflict) {
      onChange(recordedShortcut);
      setIsRecording(false);
    }
  };

  // Cancel recording
  const handleCancel = () => {
    setIsRecording(false);
    setRecordedShortcut(value);
    setConflict(null);
    onCancel();
  };

  return (
    <div className="flex items-center gap-2">
      {isRecording ? (
        <>
          <div
            className={`
              px-3 py-1.5 rounded-md border text-sm font-mono min-w-[120px] text-center
              ${conflict 
                ? 'border-destructive bg-destructive/10 text-destructive' 
                : 'border-primary bg-primary/10 text-primary'
              }
            `}
          >
            {recordedShortcut || t('shortcuts.pressKeys', 'Press keys...')}
          </div>
          
          {conflict && (
            <div className="flex items-center gap-1 text-destructive text-xs">
              <AlertCircle className="h-3 w-3" />
              <span>{t('shortcuts.conflict', 'Already in use')}</span>
            </div>
          )}
          
          <Button
            size="sm"
            variant="ghost"
            onClick={handleConfirm}
            disabled={!recordedShortcut || !!conflict}
            className="h-7 w-7 p-0"
          >
            <Check className="h-4 w-4" />
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCancel}
            className="h-7 w-7 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <button
          onClick={handleStartRecording}
          className="px-3 py-1.5 rounded-md border border-border bg-muted text-sm font-mono hover:bg-accent transition-colors min-w-[120px] text-center"
        >
          {value}
        </button>
      )}
    </div>
  );
}

export default ShortcutRecorder;
