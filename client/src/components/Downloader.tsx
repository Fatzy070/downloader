import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ClipboardPaste,
  Link2,
  Loader2,
  X,
} from 'lucide-react';
import { useVideoInfo } from '../hooks/useVideoInfo';
import type { SupportedPlatform } from '../types/downloader';
import { LoadingState } from './LoadingState';
import { PlatformBadge } from './PlatformBadge';
import { VideoPreview } from './VideoPreview';

const SUPPORTED_PLATFORMS: SupportedPlatform[] = [
  'tiktok',
  'instagram',
  'x',
  'snapchat',
  'direct',
];

function validateClientUrl(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return 'Please paste or enter a media URL to continue.';
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'Please enter a valid, complete URL starting with https://';
  }

  if (parsed.protocol !== 'https:') {
    return 'Only secure HTTPS media links are supported.';
  }

  return null;
}

export const Downloader: React.FC = () => {
  const [urlInput, setUrlInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { videoInfo, isLoading, isError, error, fetchInfo, reset } =
    useVideoInfo();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    setUrlInput(nextValue);
    if (validationError) {
      setValidationError(null);
    }
  };

  const handleClear = () => {
    setUrlInput('');
    setValidationError(null);
    reset();
    inputRef.current?.focus();
  };

  const handlePaste = async () => {
    if (!navigator.clipboard?.readText) {
      setValidationError(
        'Clipboard access is not supported in this browser context. Please paste manually (Ctrl+V / Cmd+V).'
      );
      inputRef.current?.focus();
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (trimmed) {
        setUrlInput(trimmed);
        setValidationError(null);
        reset();
      }
      inputRef.current?.focus();
    } catch {
      setValidationError(
        'Clipboard permission was declined. Please paste your link directly into the field.'
      );
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) return;

    const trimmed = urlInput.trim();
    const clientError = validateClientUrl(trimmed);
    if (clientError) {
      setValidationError(clientError);
      return;
    }

    setValidationError(null);
    setUrlInput(trimmed);
    fetchInfo(trimmed);
  };

  const activeErrorMessage =
    validationError || (isError && error ? error.message : null);

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-7 dark:border-slate-800 dark:bg-slate-900">
        <form onSubmit={handleSubmit} noValidate aria-label="Video downloader form">
          <label
            htmlFor="media-url-input"
            className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Media URL
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Link2 className="h-4 w-4" />
              </div>

              <input
                ref={inputRef}
                id="media-url-input"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={urlInput}
                onChange={handleInputChange}
                disabled={isLoading}
                placeholder="https://www.tiktok.com/@user/video/... or Instagram, X, Snapchat Spotlight link"
                className="block w-full rounded-xl border border-slate-300 bg-slate-50/70 py-3.5 pl-10 pr-24 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400 dark:focus:bg-slate-800"
              />

              <div className="absolute inset-y-0 right-1.5 flex items-center gap-1">
                {urlInput.length > 0 || videoInfo || activeErrorMessage ? (
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={isLoading}
                    aria-label="Clear URL and reset"
                    data-testid="clear-button"
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Clear</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePaste}
                    disabled={isLoading}
                    aria-label="Paste URL from clipboard"
                    data-testid="paste-button"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" />
                    <span>Paste</span>
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              data-testid="fetch-button"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Fetching...</span>
                </>
              ) : (
                <>
                  <span>Fetch Media</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          {/* Supported Platforms Indicator Bar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3.5 dark:border-slate-800/80">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Supported:
              </span>
              {SUPPORTED_PLATFORMS.map((platform) => (
                <PlatformBadge key={platform} platform={platform} size="sm" />
              ))}
            </div>

            <span className="text-xs text-slate-400 dark:text-slate-500">
              Public HTTPS posts & direct media
            </span>
          </div>
        </form>
      </div>

      {/* Error Banner */}
      {activeErrorMessage && (
        <div
          role="alert"
          data-testid="error-message"
          className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div className="flex-1">
            <p className="font-medium">Could not process media URL</p>
            <p className="mt-0.5 text-xs leading-relaxed text-rose-700 dark:text-rose-300">
              {activeErrorMessage}
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && <LoadingState />}

      {/* Video Metadata & Download Card */}
      {!isLoading && videoInfo && <VideoPreview video={videoInfo} />}
    </div>
  );
};
