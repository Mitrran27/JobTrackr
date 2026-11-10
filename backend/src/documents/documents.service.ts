import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocKind } from '@prisma/client';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { PrismaService } from '../prisma/prisma.service';
import { renderDocx, renderPdf } from './export';
import { sanitizeHtml, textToHtml, toBlocks } from './html';

const MAX_DOCS = 100;
const MAX_HTML = 400_000;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const LIST_FIELDS = { id: true, kind: true, title: true, sourceName: true, createdAt: true, updatedAt: true } as const;

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.document.findMany({ where: { userId }, select: LIST_FIELDS, orderBy: { updatedAt: 'desc' } });
  }

  async get(userId: string, id: string) {
    const d = await this.prisma.document.findFirst({ where: { id, userId } });
    if (!d) throw new NotFoundException('Document not found');
    return d;
  }

  async create(userId: string, data: { kind: DocKind; title: string; html?: string; sourceName?: string }) {
    const count = await this.prisma.document.count({ where: { userId } });
    if (count >= MAX_DOCS) throw new BadRequestException(`You can keep up to ${MAX_DOCS} documents. Delete some first.`);
    return this.prisma.document.create({
      data: {
        userId,
        kind: data.kind,
        title: (data.title || 'Untitled').slice(0, 150),
        html: this.clean(data.html ?? ''),
        sourceName: (data.sourceName || '').slice(0, 200),
      },
    });
  }

  async update(userId: string, id: string, data: { kind?: DocKind; title?: string; html?: string }) {
    await this.get(userId, id);
    return this.prisma.document.update({
      where: { id },
      data: {
        ...(data.kind ? { kind: data.kind } : {}),
        ...(data.title !== undefined ? { title: data.title.slice(0, 150) || 'Untitled' } : {}),
        ...(data.html !== undefined ? { html: this.clean(data.html) } : {}),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.prisma.document.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  async duplicate(userId: string, id: string) {
    const d = await this.get(userId, id);
    return this.create(userId, { kind: d.kind, title: `${d.title} (copy)`, html: d.html });
  }

  /** Import a PDF, Word (.docx) or text file as a new editable document */
  async upload(userId: string, file: Express.Multer.File, kind: DocKind) {
    if (!file) throw new BadRequestException('No file uploaded');
    const name = file.originalname || 'document';
    const ext = name.toLowerCase().split('.').pop();
    let html = '';

    if (ext === 'docx' || file.mimetype === DOCX_MIME) {
      try {
        html = (await mammoth.convertToHtml({ buffer: file.buffer })).value;
      } catch {
        throw new BadRequestException('Could not read that Word file');
      }
    } else if (ext === 'pdf' || file.mimetype === 'application/pdf') {
      let text = '';
      try {
        text = (await pdfParse(file.buffer)).text || '';
      } catch {
        throw new BadRequestException('Could not read that PDF');
      }
      if (text.trim().length < 20) throw new BadRequestException('No readable text found. Is this a scanned image PDF?');
      html = textToHtml(text, true);
    } else if (ext === 'txt' || ext === 'md' || file.mimetype.startsWith('text/')) {
      html = textToHtml(file.buffer.toString('utf8'), false);
    } else if (ext === 'doc') {
      throw new BadRequestException('Old .doc files are not supported. Save it as .docx or PDF and try again.');
    } else {
      throw new BadRequestException('Upload a PDF, Word (.docx) or text file');
    }

    const title = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || (kind === 'CV' ? 'My CV' : 'Cover letter');
    return this.create(userId, { kind, title, html, sourceName: name });
  }

  async export(userId: string, id: string, format: 'pdf' | 'docx') {
    const d = await this.get(userId, id);
    const blocks = toBlocks(d.html);
    const data = format === 'pdf' ? await renderPdf(blocks, d.title) : await renderDocx(blocks, d.title);
    const mime = format === 'pdf' ? 'application/pdf' : DOCX_MIME;
    return { data, mime, filename: `${d.title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'document'}.${format}` };
  }

  private clean(html: string) {
    const out = sanitizeHtml(html);
    if (out.length > MAX_HTML) throw new BadRequestException('This document is too large');
    return out;
  }
}
