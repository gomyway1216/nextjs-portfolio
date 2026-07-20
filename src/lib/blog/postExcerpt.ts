import { htmlToText } from 'html-to-text';

// Turn a post body into a plain-text meta description. Bodies are
// markdown; htmlToText only handles HTML, so markdown syntax (blockquote
// ">", headings, emphasis) would leak into meta descriptions verbatim.
// Drop fenced code blocks first (their contents are noise in a
// description), then strip the inline markers.
export function excerpt(body: string): string {
  return htmlToText(body.replace(/```[\s\S]*?(```|$)/g, ' '), { wordwrap: false })
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[>#\s*-]+/gm, ' ')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}
