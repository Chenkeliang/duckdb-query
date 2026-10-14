import { formatShortcutLabel } from '@/Settings/shortcuts';
import { cn } from '@/lib/utils';

/** Quiet, readable key hints shared by toolbar actions. */
export function ShortcutHint({ shortcut, className }: { shortcut: string; className?: string }) {
  if (!shortcut) return null;
  const label = formatShortcutLabel(shortcut)
    .replace(/([⌘⌃⇧⌥])/g, '$1 ')
    .replace(/↵$/, 'Return');
  return <kbd className={cn('inline-flex h-5 shrink-0 items-center rounded-sm border border-current/20 px-1 font-sans text-xs font-normal leading-none whitespace-nowrap', className)}>{label}</kbd>;
}
