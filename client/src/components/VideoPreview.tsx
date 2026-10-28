import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Film,
  HardDrive,
  Play,
  User,
} from 'lucide-react';
import type { DownloadOption, VideoMetadata } from '../types/downloader';
import { DownloadButton } from './DownloadButton';
import { PlatformBadge } from './PlatformBadge';

interface VideoPreviewProps {
  video: VideoMetadata;
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `~${mb.toFixed(1)} MB`;
  }
  const kb = bytes / 1024;
  return `~${Math.round(kb)} KB`;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({ video }) => {
  const [thumbnailError, setThumbnailError] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewPlaybackError, setPreviewPlaybackError] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    video.options[0]?.id ?? 'best'
  );

  useEffect(() => {
    setThumbnailError(false);
    setIsPlayingPreview(false);
    setPreviewPlaybackError(false);
    setSelectedOptionId(video.options[0]?.id ?? 'best');
  }, [video]);

  const canPlayPreview = Boolean(video.previewUrl) && !previewPlaybackError;

  const selectedOption: DownloadOption =
    video.options.find((opt) => opt.id === selectedOptionId) ??
    video.options[0] ?? {
      id: 'best',
      label: 'Best Quality (MP4)',
      quality: 'Best Available',
      ext: 'mp4',
      hasAudio: true,
    };

  const formattedDuration = formatDuration(video.duration);
  const formattedSize = formatBytes(selectedOption.filesizeApprox);

  return (
    <section
      aria-label="Media preview and download options"
      data-testid="video-preview-card"
      className="mt-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition-all dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 md:grid-cols-12">
        
        <div className="md:col-span-5">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-200/60 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/80">
            {isPlayingPreview && canPlayPreview && video.previewUrl ? (
              <video
                data-testid="video-preview-player"
                src={video.previewUrl}
                poster={video.thumbnail && !thumbnailError ? video.thumbnail : undefined}
                controls
                autoPlay
                playsInline
                preload="metadata"
                onError={() => {
                  setIsPlayingPreview(false);
                  setPreviewPlaybackError(true);
                }}
                className="h-full w-full bg-slate-950 object-contain"
              >
                Your browser does not support HTML5 video playback.
              </video>
            ) : (
              <>
                {video.thumbnail && !thumbnailError ? (
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    onError={() => setThumbnailError(true)}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    data-testid="thumbnail-fallback"
                    className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500"
                  >
                    <Film className="h-10 w-10 stroke-[1.5]" />
                    <span className="text-xs font-medium">Preview Unavailable</span>
                  </div>
                )}

                {canPlayPreview && (
                  <button
                    type="button"
                    data-testid="play-preview-button"
                    aria-label="Play video preview"
                    onClick={() => setIsPlayingPreview(true)}
                    className="group absolute inset-0 flex items-center justify-center bg-slate-950/25 transition hover:bg-slate-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                  >
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-950/80 px-3.5 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-sm transition group-hover:scale-105 group-hover:bg-indigo-600">
                      <Play className="h-3.5 w-3.5 fill-current" />
                      Play Preview
                    </span>
                  </button>
                )}

                {previewPlaybackError && (
                  <span
                    data-testid="preview-error-notice"
                    className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-md bg-slate-950/80 px-2 py-0.5 text-[11px] font-medium text-amber-300 backdrop-blur-sm"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    Preview playback unavailable
                  </span>
                )}

                {formattedDuration && (
                  <span className="pointer-events-none absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-slate-950/80 px-2 py-0.5 font-mono text-xs font-medium text-white backdrop-blur-sm">
                    <Clock className="h-3 w-3" />
                    {formattedDuration}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-between space-y-4 md:col-span-7">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <PlatformBadge platform={video.platform} />

              {video.platform === 'tiktok' && video.watermarkFreeAvailable && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
             
                  Watermark-Free Available
                </span>
              )}

              {video.platform === 'tiktok' && !video.watermarkFreeAvailable && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" />
                  Source Only Provides Watermarked Stream
                </span>
              )}
            </div>

            <h2 className="line-clamp-2 text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">
              {video.title}
            </h2>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              {video.uploader && (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  {video.uploader}
                </span>
              )}

              {formattedSize && (
                <span className="inline-flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-slate-400" />
                  {formattedSize}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {video.options.length > 1 && (
              <div>
                <label
                  htmlFor="download-format-select"
                  className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Format & Quality
                </label>
                <select
                  id="download-format-select"
                  value={selectedOption.id}
                  onChange={(e) => setSelectedOptionId(e.target.value)}
                  className="block w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
                >
                  {video.options.map((option) => {
                    const sizeText = formatBytes(option.filesizeApprox);
                    return (
                      <option key={option.id} value={option.id}>
                        {option.label} — {option.quality}
                        {sizeText ? ` (${sizeText})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <DownloadButton
              url={video.url}
              title={video.title}
              selectedOption={selectedOption}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
