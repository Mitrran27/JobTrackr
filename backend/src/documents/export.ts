import PDFDocument from 'pdfkit';
import {
  AlignmentType, Document, ExternalHyperlink, HeadingLevel, LevelFormat, Packer, Paragraph, ParagraphChild, TextRun,
} from 'docx';
import type { Align, Block, Run } from './html';

const FS = 11; // body font size (pt)
const SIZES = { h1: 18, h2: 13.5, h3: 12, p: FS, li: FS };

// ---------------------------------------------------------------- PDF

/** The built-in PDF fonts only cover WinAnsi; map common extras and drop what cannot be drawn. */
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const pdfText = (s: string) =>
  s
    .replace(/[●▪■◦○‣∙]/g, '•')
    .replace(/[‐‑‒]/g, '-')
    .replace(/−/g, '-')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[^\n -ÿ]/g, (c) => (WINANSI_EXTRA.has(c) ? c : '?'));

const pdfFont = (r: Run, heading: boolean) => {
  const b = r.b || heading;
  if (b && r.i) return 'Times-BoldItalic';
  if (b) return 'Times-Bold';
  if (r.i) return 'Times-Italic';
  return 'Times-Roman';
};

export function renderPdf(blocks: Block[], title: string): Promise<Buffer> {
  const M = 56; // ~2 cm margins
  const doc = new PDFDocument({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M }, info: { Title: title } });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const W = doc.page.width - 2 * M;

  blocks.forEach((b, idx) => {
    const size = SIZES[b.type];
    const heading = b.type.startsWith('h');
    const prev = blocks[idx - 1];
    // spacing before the block
    if (idx > 0) {
      if (heading) doc.y += 8;
      else if (b.type === 'li' && prev?.type === 'li') doc.y += 1;
      else doc.y += 4;
    }

    if (!b.runs.length) {
      doc.y += size * 0.9; // empty line
      return;
    }
    if (doc.y + size * 1.4 > doc.page.height - M) doc.addPage();

    let x = M;
    let width = W;
    if (b.type === 'li') {
      const indent = 14 + (b.level || 0) * 18;
      const marker = b.list === 'ol' ? `${b.index}.` : (b.level || 0) % 2 ? '–' : '•';
      doc.font('Times-Roman').fontSize(size).text(pdfText(marker), M + indent - 12, doc.y, { width: 14, lineBreak: false });
      x = M + indent + 6;
      width = W - indent - 6;
    }

    const y = doc.y;
    b.runs.forEach((r, k) => {
      const opts: PDFKit.Mixins.TextOptions = {
        width,
        align: b.align === 'justify' ? 'justify' : (b.align as Align),
        continued: k < b.runs.length - 1,
        underline: !!r.u,
        strike: !!r.s,
        link: r.href || null,
        lineGap: 1.5,
      };
      doc.font(pdfFont(r, heading)).fontSize(size).fillColor(r.href ? '#1a0dab' : '#000');
      if (k === 0) doc.text(pdfText(r.text), x, y, opts);
      else doc.text(pdfText(r.text), opts);
    });
    doc.fillColor('#000');

    // a thin rule under level-2 headings, like the CV builder
    if (b.type === 'h2') {
      const ry = doc.y + 1;
      doc.moveTo(M, ry).lineTo(M + W, ry).lineWidth(0.6).strokeColor('#000').stroke();
      doc.y = ry + 3;
    }
  });

  doc.end();
  return done;
}

// ---------------------------------------------------------------- Word

const DOCX_ALIGN: Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};
const HEADINGS = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3 };

function docxRuns(runs: Run[]): ParagraphChild[] {
  return runs.flatMap((r): ParagraphChild[] => {
    // a run may contain line breaks from <br>
    const parts = r.text.split('\n');
    const make = (text: string, i: number) =>
      new TextRun({
        text,
        break: i > 0 ? 1 : undefined,
        bold: r.b || undefined,
        italics: r.i || undefined,
        underline: r.u || r.href ? {} : undefined,
        strike: r.s || undefined,
        color: r.href ? '1A0DAB' : undefined,
      });
    const textRuns = parts.map(make);
    return r.href ? [new ExternalHyperlink({ link: r.href, children: textRuns })] : textRuns;
  });
}

export function renderDocx(blocks: Block[], title: string): Promise<Buffer> {
  const font = 'Times New Roman';
  const half = (pt: number) => Math.round(pt * 2);
  const heading = (pt: number) => ({ run: { font, size: half(pt), bold: true, color: '000000' }, paragraph: { spacing: { before: 200, after: 80 } } });

  const children = blocks.map((b) => {
    const base = { alignment: DOCX_ALIGN[b.align], children: docxRuns(b.runs) };
    if (b.type === 'li') {
      return new Paragraph({
        ...base,
        spacing: { after: 20 },
        ...(b.list === 'ol'
          ? { numbering: { reference: 'ol', level: Math.min(b.level || 0, 8), instance: b.listId } }
          : { bullet: { level: Math.min(b.level || 0, 8) } }),
      });
    }
    if (b.type === 'p') return new Paragraph({ ...base, spacing: { after: 80 } });
    return new Paragraph({ ...base, heading: HEADINGS[b.type] });
  });

  const doc = new Document({
    title,
    creator: 'Landed',
    styles: {
      default: {
        document: { run: { font, size: half(FS) } },
        heading1: heading(SIZES.h1),
        heading2: heading(SIZES.h2),
        heading3: heading(SIZES.h3),
      },
    },
    numbering: {
      config: [
        {
          reference: 'ol',
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children: children.length ? children : [new Paragraph({})],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
