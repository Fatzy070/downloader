import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Downloader } from '../components/Downloader';
import { GitHubIcon } from '../components/GitHubIcon';

export const GITHUB_REPO_URL = 'https://github.com/Fatzy070/downloader';

export const Home: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    // White (light) theme is the default; dark only when the visitor picked it.
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('fatzy-theme') === 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', darkMode);
    window.localStorage.setItem('fatzy-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="border-b border-line">
        <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-8 lg:px-12">
          <a href="/" className="flex items-baseline gap-2 rounded-sm">
            <span className="font-mono text-[15px] font-medium tracking-tight">fatzy</span>
            <span className="text-[13px] text-muted">/ downloader</span>
          </a>

          <nav className="flex items-center gap-2">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="github-link"
              aria-label="View source on GitHub"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-2.5 text-[13px] font-medium transition-colors hover:bg-ink/[0.04] sm:h-8 sm:px-3"
            >
              <GitHubIcon className="h-4 w-4" />
              <span className="hidden min-[360px]:inline">GitHub</span>
            </a>
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line transition-colors hover:bg-ink/[0.04] sm:h-8 sm:w-8"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </nav>
        </div>
      </header>

      <main className="w-full flex-1 px-4 pb-16 pt-10 sm:px-8 sm:pb-20 sm:pt-20 lg:px-12">
        <h1 className="max-w-2xl text-[2.125rem] font-semibold leading-[1.04] tracking-[-0.035em] min-[400px]:text-[2.5rem] sm:text-6xl">
          Paste a link.
          <br />
          <span className="text-muted">Keep the video.</span>
        </h1>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted sm:mt-5">
          Public posts from TikTok, Instagram, X, Facebook, LinkedIn and Snapchat, or
          any direct HTTPS media file. Watch it here first, then save the format you
          want.
        </p>

        <Downloader />
      </main>

      <footer className="border-t border-line">
        <div className="flex w-full flex-col gap-2 px-4 py-6 sm:px-8 lg:px-12 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Public posts only. Files stream through the server and are never stored.</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>yt-dlp + FFmpeg</span>
            <span aria-hidden="true">·</span>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-line underline-offset-4 transition-colors hover:text-ink"
            >
              Source on GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};
