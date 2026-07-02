import type { IOptions } from 'sanitize-html'

// sanitize-html is CommonJS-only and this project's tsconfig has no
// esModuleInterop, so `import sanitizeHtml from 'sanitize-html'` compiles to
// code that reads a nonexistent `.default` property and crashes at module
// load — same interop issue already documented in routers.service.ts for
// the `crypto` import. require() sidesteps it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sanitizeHtml = require('sanitize-html') as ((dirty: string, options?: IOptions) => string) & {
  simpleTransform: (tagName: string, attribs: Record<string, string>) => (tagName: string, attribs: Record<string, string>) => { tagName: string; attribs: Record<string, string> }
}

// Allowlist mirrors the Tiptap extension set enabled in the admin editor —
// headings, marks, lists, blockquote/code, links, images, tables, and the
// inline `text-align` style produced by the TextAlign extension. No script,
// iframe, event handlers, or arbitrary styles pass through.
const options: IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr',
    'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'span', 'div',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    span: ['style'],
    div: ['style'],
    p: ['style'],
    h1: ['style'],
    h2: ['style'],
    h3: ['style'],
    h4: ['style'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
  },
}

export function sanitizeBlogHtml(dirty: string): string {
  return sanitizeHtml(dirty, options)
}
