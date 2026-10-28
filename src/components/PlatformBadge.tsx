import React from 'react';
import { Film, Globe, Instagram, Music2, Twitter } from 'lucide-react';
import type { SupportedPlatform } from '../types/downloader';

interface PlatformBadgeProps {
  platform: SupportedPlatform;
  size?: 'sm' | 'md';
}

const PLATFORM_CONFIG: Record<
  SupportedPlatform,
  {
    label: string;
    classes: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  tiktok: {
    label: 'TikTok',
    classes:
      'bg-rose-500/10 text-rose-700 border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
    icon: Music2,
  },
  instagram: {
    label: 'Instagram',
    classes:
      'bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/20 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30',
    icon: Instagram,
  },
  x: {
    label: 'X (Twitter)',
    classes:
      'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
    icon: Twitter,
  },
  direct: {
    label: 'Direct Media',
    classes:
      'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    icon: Film,
  },
};

export const PlatformBadge: React.FC<PlatformBadgeProps> = ({
  platform,
  size = 'md',
}) => {
  const config = PLATFORM_CONFIG[platform] ?? {
    label: 'Media Link',
    classes:
      'bg-slate-500/10 text-slate-700 border-slate-500/20 dark:text-slate-300',
    icon: Globe,
  };

  const Icon = config.icon;
  const sizeClasses =
    size === 'sm'
      ? 'px-2.5 py-0.5 text-xs gap-1'
      : 'px-3 py-1 text-xs font-medium gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full border ${sizeClasses} ${config.classes}`}
      data-testid={`platform-badge-${platform}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{config.label}</span>
    </span>
  );
};
