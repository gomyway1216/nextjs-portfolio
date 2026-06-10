import DOMPurify from 'dompurify';

// Embed providers the rich-text editor is allowed to iframe. Anything
// else (arbitrary origins, javascript: URLs that survive sanitizing,
// permission-grabbing embeds) is stripped.
const ALLOWED_IFRAME_SRC = [
  /^https:\/\/(www\.)?youtube(-nocookie)?\.com\/embed\//,
  /^https:\/\/player\.vimeo\.com\/video\//,
];

/**
 * Sanitize admin-authored rich text (blog posts, project descriptions)
 * for rendering via dangerouslySetInnerHTML.
 *
 * Compared to a plain DOMPurify pass this also:
 * - restricts <iframe src> to known embed providers,
 * - drops the `allow` attribute, which could grant embeds access to
 *   camera/microphone/geolocation and similar permissions.
 *
 * Client-only (DOMPurify needs a DOM); returns '' during SSR.
 */
export function sanitizeRichHtml(html: string): string {
  if (typeof window === 'undefined') return '';

  const fragment = DOMPurify.sanitize(html, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allowfullscreen', 'frameborder', 'scrolling'],
    RETURN_DOM_FRAGMENT: true,
  });

  fragment.querySelectorAll('iframe').forEach((frame) => {
    const src = frame.getAttribute('src') ?? '';
    if (!ALLOWED_IFRAME_SRC.some((pattern) => pattern.test(src))) {
      frame.remove();
    }
  });

  const container = document.createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
}
