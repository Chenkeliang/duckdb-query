import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** One title row and one description row for every settings section. */
export function SettingsSectionHeader({ title, description, icon: Icon, actions }: {
  title: ReactNode;
  description: ReactNode;
  icon: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 space-y-2" data-settings-header>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2" data-aligned-row>
        <h2 className="flex min-h-8 items-center gap-2 text-base font-semibold leading-6 tracking-tight">
          <Icon className="size-4 shrink-0 text-muted-foreground" />{title}
        </h2>
        {actions && <div className="flex min-h-8 shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <p className="text-sm leading-5 text-muted-foreground">{description}</p>
    </header>
  );
}
