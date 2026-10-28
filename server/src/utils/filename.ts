/**
 * Sanitizes an arbitrary title string into a safe, portable filename.
 */
export function sanitizeFilename(
  rawTitle: string | undefined | null,
  extension = 'mp4',
  fallbackBase = 'media-download'
): string {
  const cleanExt = extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp4';

  if (!rawTitle || typeof rawTitle !== 'string') {
    return `${fallbackBase}.${cleanExt}`;
  }

  // Strip control characters, path separators, reserved filesystem characters, and collapse whitespace
  const sanitizedBase = rawTitle
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove combining diacritics
    .replace(/[^\x20-\x7E]/g, '') // keep printable ASCII for broad header compatibility
    .replace(/[<>:"/\\|?*#%&{}$!'`=@+]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100);

  const finalBase = sanitizedBase.length > 0 ? sanitizedBase : fallbackBase;
  return `${finalBase}.${cleanExt}`;
}

/**
 * Builds a standards-compliant Content-Disposition header value with both
 * ASCII fallback and UTF-8 RFC 5987 encoding.
 */
export function buildContentDisposition(
  rawTitle: string | undefined | null,
  extension = 'mp4'
): string {
  const asciiFilename = sanitizeFilename(rawTitle, extension);
  const cleanExt = extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp4';

  const utf8Base =
    rawTitle && rawTitle.trim().length > 0
      ? rawTitle
          .replace(/[\r\n<>:"/\\|?*\x00-\x1F]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100)
      : asciiFilename.replace(new RegExp(`\\.${cleanExt}$`), '');

  const utf8Filename = `${utf8Base}.${cleanExt}`;
  const encodedUtf8 = encodeURIComponent(utf8Filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedUtf8}`;
}
