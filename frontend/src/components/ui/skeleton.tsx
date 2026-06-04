import { cn } from '@/lib/utils';

/** 骨架占位条：加载中用脉冲方块代替转圈 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted-foreground/15', className)}
      {...props}
    />
  );
}

export { Skeleton };
