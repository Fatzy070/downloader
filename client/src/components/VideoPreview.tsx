import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Film, Loader2, Play } from 'lucide-react';
import { buildPreviewStreamUrl } from '../services/api';
import type { DownloadOption, VideoMetadata } from '../types/downloader';
import { DownloadButton } from './DownloadButton';
import { PLATFORM_LABELS } from './PlatformBadge';

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
    return `${mb.toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

const FALLBACK_OPTION: DownloadOption = {
  id: 'best',
  label: 'Best Quality (MP4)',
  quality: 'Best Available',
  ext: 'mp4',
  hasAudio: true,
};

export const VideoPreview: React.FC<VideoPreviewProps> = ({ video }) => {
  const [thumbnailError, setThumbnailError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    video.options[0]?.id ?? 'best'
  );

  // Try the direct CDN stream first (fast, seekable). If the browser can't load it
  // (hotlink protection, cookies, codec), fall back to streaming through our server.
  const previewSources = useMemo(() => {
    const sources: string[] = [];
    if (video.previewUrl) sources.push(video.previewUrl);
    sources.push(buildPreviewStreamUrl({ url: video.url, title: video.title }));
    return sources;
  }, [video.previewUrl, video.url, video.title]);

  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    sectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [video]);

  useEffect(() => {
    setThumbnailError(false);
    setIsPlaying(false);
    setIsBuffering(false);
    setSourceIndex(0);
    setPlaybackFailed(false);
    setSelectedOptionId(video.options[0]?.id ?? 'best');
  }, [video]);

  const currentSource = previewSources[sourceIndex];
  const hasThumbnail = Boolean(video.thumbnail) && !thumbnailError;

  const handlePlaybackError = () => {
    if (sourceIndex + 1 < previewSources.length) {
      setSourceIndex((index) => index + 1);
      setIsBuffering(true);
      return;
    }
    setIsPlaying(false);
    setIsBuffering(false);
    setPlaybackFailed(true);
  };

  const startPlayback = () => {
    setIsPlaying(true);
    setIsBuffering(true);
  };

  const selectedOption: DownloadOption =
    video.options.find((opt) => opt.id === selectedOptionId) ??
    video.options[0] ??
    FALLBACK_OPTION;

  const formattedDuration = formatDuration(video.duration);
  const formattedSize = formatBytes(selectedOption.filesizeApprox);
  const platformLabel = PLATFORM_LABELS[video.platform] ?? 'Media link';

  return (
    <section
      ref={sectionRef}
      aria-label="Media preview and download options"
      data-testid="video-preview-card"
      className="mt-8 grid scroll-mt-4 grid-cols-1 gap-6 sm:mt-10 sm:gap-8 border-t border-line pt-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:gap-12"
    >
      <div>
        <div className="relative -mx-4 aspect-[4/5] max-h-[75vh] overflow-hidden bg-black sm:mx-0 sm:aspect-video sm:max-h-none sm:rounded-md">
          {isPlaying && currentSource ? (
            <>
              <video
                key={currentSource}
                data-testid="video-preview-player"
                src={currentSource}
                poster={hasThumbnail ? video.thumbnail ?? undefined : undefined}
                controls
                autoPlay
                playsInline
                preload="auto"
                onPlaying={() => setIsBuffering(false)}
                onCanPlay={() => setIsBuffering(false)}
                onWaiting={() => setIsBuffering(true)}
                onError={handlePlaybackError}
                className="h-full w-full object-contain"
              >
                Your browser does not support HTML5 video playback.
              </video>
              {isBuffering && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="inline-flex items-center gap-2 rounded bg-black/70 px-3 py-1.5 font-mono text-[12px] text-white">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {currentSource === video.previewUrl ? 'Loading…' : 'Preparing preview, this can take a few seconds…'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              {hasThumbnail ? (
                <img
                  src={video.thumbnail ?? undefined}
                  alt=""
                  onError={() => setThumbnailError(true)}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div
                  data-testid="thumbnail-fallback"
                  className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/50"
                >
                  <Film className="h-8 w-8 stroke-[1.5]" />
                  <span className="text-[13px]">No thumbnail</span>
                </div>
              )}

              {!playbackFailed && (
                <button
                  type="button"
                  data-testid="play-preview-button"
                  aria-label="Play video preview"
                  onClick={startPlayback}
                  className="group absolute inset-0 flex items-center justify-center bg-black/10 transition-colors hover:bg-black/25"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-[0_2px_20px_rgba(0,0,0,0.35)] transition-transform group-hover:scale-105">
                    <Play className="ml-1 h-6 w-6 fill-current" />
                  </span>
                </button>
              )}

              {playbackFailed && (
                <div className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-2">
                  <span
                    data-testid="preview-error-notice"
                    className="inline-flex items-center gap-1.5 rounded bg-black/75 px-2 py-1 text-[12px] text-white"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Preview playback unavailable. Download still works.
                  </span>
                  <button
                    type="button"
                    data-testid="retry-preview-button"
                    onClick={() => {
                      setSourceIndex(0);
                      setPlaybackFailed(false);
                      startPlayback();
                    }}
                    className="rounded bg-white px-2 py-1 text-[12px] font-medium text-black transition-opacity hover:opacity-85"
                  >
                    Try again
                  </button>
                </div>
              )}

              {formattedDuration && (
                <span className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[12px] text-white">
                  {formattedDuration}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col">
        <p className="font-mono text-[12px] uppercase tracking-wider text-muted">
          {platformLabel}
          {video.extractor && video.extractor.toLowerCase() !== video.platform && (
            <span className="normal-case tracking-normal"> · {video.extractor}</span>
          )}
        </p>

        <h2 className="mt-2 line-clamp-3 break-words text-lg font-semibold sm:text-xl leading-snug tracking-tight">
          {video.title}
        </h2>

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[14px]">
          {video.uploader && (
            <>
              <dt className="text-muted">By</dt>
              <dd className="truncate">{video.uploader}</dd>
            </>
          )}
          {formattedSize && (
            <>
              <dt className="text-muted">Size</dt>
              <dd className="font-mono text-[13px]">~{formattedSize}</dd>
            </>
          )}
        </dl>

        {video.platform === 'tiktok' && (
          <p className="mt-4 text-[13px] text-muted">
            {video.watermarkFreeAvailable
              ? 'TikTok provided a clean stream, so the file has no watermark.'
              : 'TikTok only offered the watermarked stream for this post.'}
          </p>
        )}

        <fieldset className="mt-6">
          <legend className="mb-2 text-[13px] font-medium text-muted">Format</legend>
          <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
            {video.options.map((option) => {
              const sizeText = formatBytes(option.filesizeApprox);
              const checked = option.id === selectedOption.id;
              return (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-center gap-3 px-4 py-3 text-[14px] transition-colors ${
                    checked ? 'bg-ink/[0.04]' : 'hover:bg-ink/[0.02]'
                  }`}
                >
                  <input
                    type="radio"
                    name="download-format"
                    value={option.id}
                    checked={checked}
                    onChange={() => setSelectedOptionId(option.id)}
                    className="h-4 w-4 accent-[rgb(var(--accent))]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium sm:inline">{option.label}</span>
                    <span className="block text-[13px] text-muted sm:ml-2 sm:inline sm:text-[14px]">
                      {option.quality}
                    </span>
                  </span>
                  {sizeText && <span className="font-mono text-[12px] text-muted">{sizeText}</span>}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-5">
          <DownloadButton url={video.url} title={video.title} selectedOption={selectedOption} />
        </div>
      </div>
    </section>
  );
};
