import React from 'react';
import type { SupportedPlatform } from '../types/downloader';

export const PLATFORM_LABELS: Record<SupportedPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  x: 'X',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  snapchat: 'Snapchat',
  direct: 'Direct file',
};

interface PlatformBadgeProps {
  platform: SupportedPlatform;
  className?: string;
}

export const PlatformBadge: React.FC<PlatformBadgeProps> = ({ platform, className = '' }) => (
  <span className={className} data-testid={`platform-badge-${platform}`}>
    {PLATFORM_LABELS[platform] ?? 'Media link'}
  </span>
);
