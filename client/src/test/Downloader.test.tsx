import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../lib/queryClient';
import { Home } from '../pages/Home';
import * as api from '../services/api';
import type { VideoMetadata } from '../types/downloader';

function renderWithQueryClient(ui: React.ReactElement) {
  const testQueryClient = createQueryClient();
  return render(
    <QueryClientProvider client={testQueryClient}>{ui}</QueryClientProvider>
  );
}

const MOCK_VIDEO_METADATA: VideoMetadata = {
  id: '7123456789',
  url: 'https://www.tiktok.com/@creator/video/7123456789',
  title: 'Morning Espresso Routine',
  thumbnail: 'https://p16-sign.tiktokcdn.com/espresso.jpg',
  duration: 34,
  uploader: '@coffee_creator',
  platform: 'tiktok',
  extractor: 'TikTok',
  watermarkFreeAvailable: true,
  options: [
    {
      id: 'nowatermark',
      label: 'MP4 (No Watermark)',
      quality: '1080p Clean',
      ext: 'mp4',
      watermarkFree: true,
      hasAudio: true,
      filesizeApprox: 5_242_880,
    },
    {
      id: 'best',
      label: 'Best Quality (MP4)',
      quality: '1080p',
      ext: 'mp4',
      watermarkFree: true,
      hasAudio: true,
      filesizeApprox: 5_242_880,
    },
  ],
};

describe('Personal Universal Video Downloader Frontend', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the main downloader page with branding, URL input, and platform indicators', () => {
    renderWithQueryClient(<Home />);

    expect(
      screen.getByRole('heading', { name: /Universal Media Downloader/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Media URL/i)).toBeInTheDocument();
    expect(screen.getByTestId('fetch-button')).toBeInTheDocument();
    expect(screen.getByTestId('platform-badge-tiktok')).toBeInTheDocument();
    expect(screen.getByTestId('platform-badge-instagram')).toBeInTheDocument();
    expect(screen.getByTestId('platform-badge-x')).toBeInTheDocument();
    expect(screen.getByTestId('platform-badge-direct')).toBeInTheDocument();
  });

  it('accepts text in the URL input field', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<Home />);

    const input = screen.getByLabelText(/Media URL/i) as HTMLInputElement;
    await user.type(input, 'https://x.com/nasa/status/123456');

    expect(input.value).toBe('https://x.com/nasa/status/123456');
  });

  it('prevents empty submission and displays a validation error without calling the API', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(api, 'fetchVideoInfo');

    renderWithQueryClient(<Home />);

    await user.click(screen.getByTestId('fetch-button'));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-message')).toHaveTextContent(
      /Please paste or enter a media URL/i
    );
  });

  it('displays loading state during metadata retrieval and renders the preview card on success', async () => {
    const user = userEvent.setup();

    let resolvePromise!: (val: VideoMetadata) => void;
    vi.spyOn(api, 'fetchVideoInfo').mockImplementation(
      () =>
        new Promise<VideoMetadata>((resolve) => {
          resolvePromise = resolve;
        })
    );

    renderWithQueryClient(<Home />);

    const input = screen.getByLabelText(/Media URL/i);
    await user.type(input, MOCK_VIDEO_METADATA.url);
    await user.click(screen.getByTestId('fetch-button'));

    // Verify loading indicator is shown and Fetch button is disabled
    expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    expect(screen.getByTestId('fetch-button')).toBeDisabled();

    // Resolve the API call
    resolvePromise(MOCK_VIDEO_METADATA);

    await waitFor(() => {
      expect(screen.getByTestId('video-preview-card')).toBeInTheDocument();
    });

    expect(screen.getByText('Morning Espresso Routine')).toBeInTheDocument();
    expect(screen.getByText('@coffee_creator')).toBeInTheDocument();
    expect(screen.getByText('0:34')).toBeInTheDocument();

    const downloadBtn = screen.getByTestId('download-button') as HTMLAnchorElement;
    expect(downloadBtn).toHaveAttribute(
      'href',
      expect.stringContaining('/api/download?')
    );
    expect(downloadBtn).toHaveAttribute(
      'href',
      expect.stringContaining('option=nowatermark')
    );
  });

  it('displays API error messages in the interface when extraction fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'fetchVideoInfo').mockRejectedValue(
      new api.ApiClientError(
        'This content is private or requires platform authentication and cannot be downloaded.',
        403,
        'CONTENT_PRIVATE_OR_RESTRICTED'
      )
    );

    renderWithQueryClient(<Home />);

    const input = screen.getByLabelText(/Media URL/i);
    await user.type(input, 'https://www.instagram.com/reel/Cprivate123/');
    await user.click(screen.getByTestId('fetch-button'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });

    expect(screen.getByTestId('error-message')).toHaveTextContent(
      /private or requires platform authentication/i
    );
  });

  it('clears the current preview card and input when the Clear button is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'fetchVideoInfo').mockResolvedValue(MOCK_VIDEO_METADATA);

    renderWithQueryClient(<Home />);

    const input = screen.getByLabelText(/Media URL/i) as HTMLInputElement;
    await user.type(input, MOCK_VIDEO_METADATA.url);
    await user.click(screen.getByTestId('fetch-button'));

    await waitFor(() => {
      expect(screen.getByTestId('video-preview-card')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('clear-button'));

    expect(input.value).toBe('');
    expect(screen.queryByTestId('video-preview-card')).not.toBeInTheDocument();
  });

  it('plays inline video preview when previewUrl is available and falls back gracefully on playback error', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'fetchVideoInfo').mockResolvedValue({
      ...MOCK_VIDEO_METADATA,
      platform: 'x',
      previewUrl: 'https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/clip.mp4',
    });

    renderWithQueryClient(<Home />);

    const input = screen.getByLabelText(/Media URL/i);
    await user.type(input, 'https://x.com/nasa/status/123456');
    await user.click(screen.getByTestId('fetch-button'));

    const playBtn = await screen.findByTestId('play-preview-button');
    expect(playBtn).toBeInTheDocument();

    await user.click(playBtn);

    const videoPlayer = screen.getByTestId('video-preview-player') as HTMLVideoElement;
    expect(videoPlayer).toBeInTheDocument();
    expect(videoPlayer).toHaveAttribute(
      'src',
      'https://video.twimg.com/ext_tw_video/123/pu/vid/720x1280/clip.mp4'
    );
    expect(videoPlayer).toHaveAttribute('controls');

    // Simulate a media playback error and verify graceful fallback to thumbnail + download controls
    fireEvent.error(videoPlayer);

    await waitFor(() => {
      expect(screen.queryByTestId('video-preview-player')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('preview-error-notice')).toHaveTextContent(
      /Preview playback unavailable/i
    );
    expect(screen.getByTestId('download-button')).toBeInTheDocument();
  });
});
