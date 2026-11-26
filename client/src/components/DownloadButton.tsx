import React, { useEffect, useState } from 'react';
import { Check, Download } from 'lucide-react';
import { buildDownloadUrl } from '../services/api';
import type { DownloadOption } from '../types/downloader';

interface DownloadButtonProps {
  url: string;
  title: string;
  selectedOption: DownloadOption;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({ url, title, selectedOption }) => {
  const [downloadTriggered, setDownloadTriggered] = useState(false);

  useEffect(() => {
    if (!downloadTriggered) return;
    const timer = window.setTimeout(() => setDownloadTriggered(false), 4000);
    return () => window.clearTimeout(timer);
  }, [downloadTriggered]);

  const downloadHref = buildDownloadUrl({ url, option: selectedOption.id, title });

  return (
    <div>
      <a
        href={downloadHref}
        onClick={() => setDownloadTriggered(true)}
        data-testid="download-button"
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent px-5 text-[14px] font-medium text-accent-ink transition-opacity hover:opacity-90"
      >
        <Download className="h-4 w-4 shrink-0" />
        Download {selectedOption.ext.toUpperCase()}
      </a>

      <p
        role="status"
        aria-live="polite"
        className="mt-2 flex h-5 items-center justify-center gap-1.5 text-[13px] text-muted"
      >
        {downloadTriggered && (
          <span data-testid="download-started-feedback" className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Download started. Your browser will save the file.
          </span>
        )}
      </p>
    </div>
  );
};
