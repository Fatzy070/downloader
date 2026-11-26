import { createSnapchatDownloadStream } from '../adapters/snapchat.adapter.js';
import { createMediaDownloadStream } from '../adapters/ytdlp.adapter.js';
import type { DownloadOptionId, DownloadStreamHandle } from '../types/downloader.js';
import { verifyNetworkSafetyAndRedirects } from '../validators/download.validator.js';

export interface InitiateDownloadParams {
  url: string;
  option: DownloadOptionId;
  title?: string;
  /** Inline preview: pick a stream the browser can decode. */
  inline?: boolean;
}

export async function initiateMediaDownload(
  params: InitiateDownloadParams
): Promise<DownloadStreamHandle> {
  const validated = await verifyNetworkSafetyAndRedirects(params.url);

  const handle =
    validated.platform === 'snapchat'
      ? await createSnapchatDownloadStream(validated.url, params.option)
      : await createMediaDownloadStream(
          validated.url,
          params.option,
          validated.platform,
          params.inline ? { browserPlayable: true } : undefined
        );

  return {
    ...handle,
    suggestedTitle: params.title || `${validated.platform}-video`,
  };
}
