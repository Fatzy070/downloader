import React, { Fragment, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Loader2, X } from 'lucide-react';
import { useVideoInfo } from '../hooks/useVideoInfo';
import type { SupportedPlatform } from '../types/downloader';
import { LoadingState } from './LoadingState';
import { PlatformBadge } from './PlatformBadge';
import { VideoPreview } from './VideoPreview';

const SUPPORTED_PLATFORMS: SupportedPlatform[] = [
  'tiktok',
  'instagram',
  'x',
  'facebook',
  'linkedin',
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

  const { videoInfo, isLoading, isError, error, fetchInfo, reset } = useVideoInfo();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrlInput(e.target.value);
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
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        setUrlInput(text);
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

  const activeErrorMessage = validationError || (isError && error ? error.message : null);
  const showClear = urlInput.length > 0 || Boolean(videoInfo) || Boolean(activeErrorMessage);

  return (
    <div className="mt-8 w-full sm:mt-10">
      <form onSubmit={handleSubmit} noValidate aria-label="Video downloader form">
        <label htmlFor="media-url-input" className="mb-2 block text-[13px] font-medium text-muted">
          Media URL
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
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
              placeholder="https://www.tiktok.com/@user/video/…"
              className="block h-12 w-full rounded-md border border-line bg-surface pl-3.5 pr-20 font-mono text-[16px] sm:pl-4 sm:text-[14px] text-ink placeholder:text-muted/70 transition-colors focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />

            <div className="absolute inset-y-0 right-2 flex items-center">
              {showClear ? (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={isLoading}
                  aria-label="Clear URL and reset"
                  data-testid="clear-button"
                  className="inline-flex h-9 items-center gap-1 rounded px-2 sm:h-8 text-[13px] text-muted transition-colors hover:text-ink disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePaste}
                  disabled={isLoading}
                  aria-label="Paste URL from clipboard"
                  data-testid="paste-button"
                  className="inline-flex h-9 items-center rounded border sm:h-8 border-line px-2.5 text-[13px] text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
                >
                  Paste
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            data-testid="fetch-button"
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-ink px-6 text-[14px] font-medium text-paper transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Fetching
              </>
            ) : (
              <>
                Fetch
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          <span className="mr-1.5">Works with</span>
          {SUPPORTED_PLATFORMS.map((platform, index) => (
            <Fragment key={platform}>
              {index > 0 && <span aria-hidden="true">, </span>}
              <PlatformBadge platform={platform} className="text-ink/80" />
            </Fragment>
          ))}
          .
        </p>
      </form>

      {activeErrorMessage && (
        <div
          role="alert"
          data-testid="error-message"
          className="mt-6 flex items-start gap-3 rounded-md border border-accent/40 bg-accent/[0.06] px-4 py-3 text-[14px]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div>
            <p className="font-medium">Couldn’t read that link</p>
            <p className="mt-0.5 text-muted">{activeErrorMessage}</p>
          </div>
        </div>
      )}

      {isLoading && <LoadingState />}

      {!isLoading && videoInfo && <VideoPreview video={videoInfo} />}
    </div>
  );
};
