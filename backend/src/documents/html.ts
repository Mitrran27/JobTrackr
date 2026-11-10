import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

/**
 * Documents are stored as a small, safe subset of HTML:
 *   blocks: p, h1, h2, h3, ul, ol, li   (blocks may carry style="text-align:…")
 *   inline: strong, em, u, s, a[href], br
 * Everything else is unwrapped or dropped.
 */

export type Align = 'left' | 'center' | 'right' | 'justify';
export type Run = { text: string; b?: boolean; i?: boolean; u?: boolean; s?: boolean; href?: string };
export type Block = {
  type: 'p' | 'h1' | 'h2' | 'h3' | 'li';
  align: Align;
  runs: Run[];
  list?: 'ul' | 'ol';
  listId?: number;
  index?: number; // 1-based position within its ordered list
  level?: number; // nesting depth, 0 = top
};

const ALIGNS: Align[] = ['left', 'center', 'right', 'justify'];
const DROP = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'noscript', 'iframe', 'object', 'embed', 'svg', 'canvas', 'template', 'img', 'video', 'audio', 'input', 'button', 'select', 'textarea', 'form']);
const BLOCKISH = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'section', 'article', 'header', 'footer', 'main', 'pre', 'hr']);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function alignOf(el: Element): Align | null {
  const style = (el.attribs?.style || '').toLowerCase();
  const m = style.match(/text-align\s*:\s*(left|center|right|justify)/);
  const a = (m?.[1] || (el.attribs?.align || '').toLowerCase()) as Align;
  return ALIGNS.includes(a) && a !== 'left' ? a : null;
}

function safeHref(href = ''): string | null {
  const h = href.trim();
  return /^(https?:|mailto:|tel:)/i.test(h) ? h : null;
}

function hasBlockChild(el: Element): boolean {
  return (el.children || []).some((c) => c.type === 'tag' && BLOCKISH.has((c as Element).name));
}

/** Clean arbitrary HTML (pasted, imported from Word, or sent by the client) down to the allowed subset. */
export function sanitizeHtml(input: string): string {
  const $ = cheerio.load(`<body>${input || ''}</body>`);

  const inner = (nodes: AnyNode[]) => nodes.map(clean).join('');

  function clean(node: AnyNode): string {
    if (node.type === 'text') return esc((node as any).data || '');
    if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') return '';
    const el = node as Element;
    const tag = el.name.toLowerCase();
    if (DROP.has(tag)) return '';
    const kids = inner(el.children || []);
    const align = alignOf(el);
    const st = align ? ` style="text-align:${align}"` : '';
    const style = (el.attribs?.style || '').toLowerCase();

    switch (tag) {
      case 'b':
      case 'strong':
        return kids ? `<strong>${kids}</strong>` : '';
      case 'i':
      case 'em':
        return kids ? `<em>${kids}</em>` : '';
      case 'u':
      case 'ins':
        return kids ? `<u>${kids}</u>` : '';
      case 's':
      case 'strike':
      case 'del':
        return kids ? `<s>${kids}</s>` : '';
      case 'br':
        return '<br>';
      case 'a': {
        const href = safeHref(el.attribs?.href);
        return href ? `<a href="${esc(href)}">${kids}</a>` : kids;
      }
      case 'span':
      case 'font': {
        let out = kids;
        if (!out) return '';
        if (/font-weight\s*:\s*(bold|[6-9]00)/.test(style)) out = `<strong>${out}</strong>`;
        if (/font-style\s*:\s*italic/.test(style)) out = `<em>${out}</em>`;
        if (/text-decoration[^;]*underline/.test(style)) out = `<u>${out}</u>`;
        return out;
      }
      case 'h1':
      case 'h2':
      case 'h3':
        return `<${tag}${st}>${kids}</${tag}>`;
      case 'h4':
      case 'h5':
      case 'h6':
        return `<h3${st}>${kids}</h3>`;
      case 'ul':
      case 'ol':
        return `<${tag}>${kids}</${tag}>`;
      case 'li':
        return `<li${st}>${kids}</li>`;
      case 'hr':
        return '<p><br></p>';
      case 'tr':
        // flatten table rows into a paragraph, cells separated by spacing
        return `<p>${(el.children || [])
          .filter((c) => c.type === 'tag')
          .map((c) => inner((c as Element).children || []).replace(/<\/?p[^>]*>/g, ' ').trim())
          .filter(Boolean)
          .join(' &nbsp; ')}</p>`;
      case 'p':
      case 'div':
      case 'blockquote':
      case 'section':
      case 'article':
      case 'header':
      case 'footer':
      case 'main':
      case 'pre':
        // containers of other blocks are unwrapped; leaf blocks become paragraphs
        if (hasBlockChild(el)) return kids;
        return `<p${st}>${kids || '<br>'}</p>`;
      default:
        // unknown tag (table, tbody, td, o:p, …): keep its content only
        return kids;
    }
  }

  return inner($('body').get(0)?.children || [])
    .replace(/\u0000/g, '')
    .trim();
}

/** Parse sanitized HTML into a flat list of blocks for the PDF / Word renderers. */
export function toBlocks(html: string): Block[] {
  const $ = cheerio.load(`<body>${html || ''}</body>`);
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let listSeq = 0;

  type Marks = Omit<Run, 'text'>;
  type ListCtx = { type: 'ul' | 'ol'; id: number; count: number; level: number };

  const start = (b: Omit<Block, 'runs'>) => {
    cur = { ...b, runs: [] };
    blocks.push(cur);
  };
  const push = (text: string, m: Marks) => {
    if (!text) return;
    if (!cur) {
      if (!text.trim()) return; // whitespace between blocks
      start({ type: 'p', align: 'left' });
    }
    const last = cur.runs[cur.runs.length - 1];
    if (last && last.b === m.b && last.i === m.i && last.u === m.u && last.s === m.s && last.href === m.href) last.text += text;
    else cur.runs.push({ text, ...m });
  };

  function walk(node: AnyNode, m: Marks, list: ListCtx | null) {
    if (node.type === 'text') {
      push(((node as any).data || '').replace(/[\s ]+/g, (w: string) => (w.includes(' ') ? ' ' : ' ')), m);
      return;
    }
    if (node.type !== 'tag') return;
    const el = node as Element;
    const tag = el.name.toLowerCase();
    const kids = el.children || [];
    const align = alignOf(el) || 'left';
    switch (tag) {
      case 'strong':
        return kids.forEach((c) => walk(c, { ...m, b: true }, list));
      case 'em':
        return kids.forEach((c) => walk(c, { ...m, i: true }, list));
      case 'u':
        return kids.forEach((c) => walk(c, { ...m, u: true }, list));
      case 's':
        return kids.forEach((c) => walk(c, { ...m, s: true }, list));
      case 'a':
        return kids.forEach((c) => walk(c, { ...m, href: safeHref(el.attribs?.href) || undefined }, list));
      case 'br':
        return push('\n', m);
      case 'p':
      case 'h1':
      case 'h2':
      case 'h3':
        start({ type: tag, align });
        kids.forEach((c) => walk(c, m, list));
        cur = null;
        return;
      case 'ul':
      case 'ol': {
        const ctx: ListCtx = { type: tag, id: ++listSeq, count: 0, level: list ? list.level + 1 : 0 };
        cur = null;
        kids.forEach((c) => walk(c, m, ctx));
        cur = null;
        return;
      }
      case 'li': {
        const ctx = list || { type: 'ul' as const, id: ++listSeq, count: 0, level: 0 };
        ctx.count++;
        start({ type: 'li', align, list: ctx.type, listId: ctx.id, index: ctx.count, level: ctx.level });
        kids.forEach((c) => walk(c, m, ctx));
        cur = null;
        return;
      }
      default:
        kids.forEach((c) => walk(c, m, list));
    }
  }

  ($('body').get(0)?.children || []).forEach((n) => walk(n, {}, null));

  // tidy whitespace at the edges of each block
  for (const b of blocks) {
    if (b.runs.length) {
      b.runs[0].text = b.runs[0].text.replace(/^ +/, '');
      const last = b.runs[b.runs.length - 1];
      last.text = last.text.replace(/[ \n]+$/, '');
      b.runs = b.runs.filter((r) => r.text);
    }
  }
  return blocks;
}

/** Plain text (from a PDF or .txt) to editable HTML, guessing headings, bullets and wrapped lines. */
export function textToHtml(text: string, fromPdf: boolean): string {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').replace(/\t/g, '    ').split('\n').map((l) => l.trimEnd());
  const out: string[] = [];
  let para: string[] = [];
  let bullets: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(esc).join(fromPdf ? ' ' : '<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (bullets.length) out.push(`<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`);
    bullets = [];
  };

  const BULLET = /^\s*([•●▪■◦○‣∙·\-–*]|\d{1,2}[.)])\s+/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const isHeading = line.length <= 40 && /[A-Z]/.test(line) && line === line.toUpperCase() && !/[.,;]$/.test(line);
    if (isHeading) {
      flushPara();
      flushList();
      out.push(`<h2>${esc(line)}</h2>`);
      continue;
    }
    if (BULLET.test(line)) {
      flushPara();
      bullets.push(line.replace(BULLET, ''));
      continue;
    }
    if (bullets.length) {
      // a wrapped continuation of the previous bullet (PDFs hard-wrap lines)
      if (fromPdf && /^[a-z(]/.test(line)) {
        bullets[bullets.length - 1] += ' ' + line;
        continue;
      }
      flushList();
    }
    if (fromPdf && para.length) {
      const prev = para[para.length - 1];
      const continues = prev.length > 55 && !/[.:!?]$/.test(prev);
      if (!continues) flushPara();
    }
    para.push(line);
  }
  flushPara();
  flushList();
  return out.join('\n');
}
