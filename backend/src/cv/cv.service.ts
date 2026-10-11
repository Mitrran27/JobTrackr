import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { PrismaService } from '../prisma/prisma.service';
import { categoryOf, findSkills } from '../jobs/skills.dict';

export const CV_SECTIONS = ['summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'publications', 'references'] as const;

@Injectable()
export class CvService {
  constructor(private prisma: PrismaService) {}

  /** Store the uploaded CV, keep its text for matching, and fill empty profile fields / skills from it */
  async upload(userId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    let text = '';
    if (file.mimetype === 'application/pdf') {
      try {
        text = (await pdfParse(file.buffer)).text || '';
      } catch {
        throw new BadRequestException('Could not read that PDF');
      }
    } else if (file.mimetype.startsWith('text/')) {
      text = file.buffer.toString('utf8');
    } else {
      throw new BadRequestException('Upload your CV as a PDF (or plain text) file');
    }
    text = text.replace(/\u0000/g, '').trim();
    if (text.length < 30) throw new BadRequestException('No readable text found. Is this a scanned image PDF?');

    const profile = await this.prisma.profile.upsert({ where: { userId }, update: {}, create: { userId } });
    if (profile.cvFileId) await this.prisma.fileAsset.deleteMany({ where: { id: profile.cvFileId, userId } });
    const asset = await this.prisma.fileAsset.create({
      data: { userId, name: file.originalname.slice(0, 200), mime: file.mimetype, data: file.buffer },
    });

    // contact details, only into empty fields
    const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
    const phone = text.match(/\+?\d[\d\s().-]{8,16}\d/)?.[0];
    const linkedin = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0];
    const github = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s)]+/i)?.[0];
    const fill: any = {};
    if (!profile.email && email) fill.email = email;
    if (!profile.phone && phone) fill.phone = phone.trim();
    if (!profile.linkedin && linkedin) fill.linkedin = linkedin;
    if (!profile.github && github) fill.github = github;

    await this.prisma.profile.update({
      where: { userId },
      data: { cvText: text.slice(0, 60000), cvFileId: asset.id, ...fill },
    });

    // add detected skills that are not saved yet
    const existing = new Set((await this.prisma.skill.findMany({ where: { userId } })).map((s) => s.name.toLowerCase()));
    const detected = findSkills(text).filter((n) => !existing.has(n.toLowerCase()));
    if (detected.length) {
      const base = existing.size;
      await this.prisma.skill.createMany({
        data: detected.map((name, i) => ({ userId, name, category: categoryOf(name), sortOrder: base + i })),
      });
    }
    return { ok: true, fileName: file.originalname, chars: text.length, skillsAdded: detected, filled: Object.keys(fill) };
  }

  async original(userId: string) {
    const p = await this.prisma.profile.findUnique({ where: { userId } });
    if (!p?.cvFileId) throw new NotFoundException('No CV uploaded yet');
    const f = await this.prisma.fileAsset.findFirst({ where: { id: p.cvFileId, userId } });
    if (!f) throw new NotFoundException();
    return { name: f.name, mime: f.mime, data: Buffer.from(f.data) };
  }

  /** Build the CV PDF: Times font, bold caps headings with a rule, dates right aligned */
  async generate(userId: string, opts: { sections?: string[]; images?: boolean }): Promise<Buffer> {
    const [profile, education, experience, skills, projects, certs, pubs, refs] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.education.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.experience.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.skill.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.project.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.certification.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.publication.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.reference.findMany({ where: { userId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    const wanted = opts.sections?.length ? CV_SECTIONS.filter((s) => opts.sections.includes(s)) : [...CV_SECTIONS];

    const imageBuffers = new Map<string, Buffer>();
    if (opts.images !== false) {
      const ids = projects.flatMap((p) => p.imageIds.slice(0, 3));
      if (ids.length) {
        const rows = await this.prisma.fileAsset.findMany({ where: { id: { in: ids }, userId } });
        rows.forEach((r) => imageBuffers.set(r.id, Buffer.from(r.data)));
      }
    }

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
      info: { Title: `${profile?.fullName || 'CV'} - Curriculum Vitae` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const L = 50;
    const W = doc.page.width - 100;
    const BOTTOM = () => doc.page.height - 40;
    const ensure = (h: number) => {
      if (doc.y + h > BOTTOM()) doc.addPage();
    };
    const FS = 10.5;

    const heading = (t: string) => {
      ensure(60);
      doc.y += 8;
      doc.font('Times-Bold').fontSize(12.5).text(t.toUpperCase(), L, doc.y, { width: W });
      const y = doc.y + 1;
      doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.7).strokeColor('#000').stroke();
      doc.y = y + 4;
    };

    /** left text (optionally bold) + right text aligned to the margin */
    const row = (left: string, right = '', bold = false, italic = false) => {
      if (!left && !right) return;
      doc.fontSize(FS);
      doc.font('Times-Roman');
      const rw = right ? doc.widthOfString(right) + 12 : 0;
      doc.font(bold ? 'Times-Bold' : italic ? 'Times-Italic' : 'Times-Roman');
      const lh = doc.heightOfString(left || ' ', { width: W - rw });
      ensure(lh + 2);
      const y = doc.y;
      doc.text(left, L, y, { width: W - rw });
      if (right) doc.font('Times-Roman').text(right, L, y, { width: W, align: 'right' });
      doc.y = y + Math.max(lh, FS * 1.2);
    };

    const bullet = (t: string) => {
      doc.font('Times-Roman').fontSize(FS);
      const h = doc.heightOfString(t, { width: W - 24 });
      ensure(h + 1);
      const y = doc.y;
      doc.text('•', L + 8, y, { width: 10 });
      doc.text(t, L + 22, y, { width: W - 22 });
      doc.y = y + h + 1;
    };

    const para = (t: string, italic = false) => {
      doc.font(italic ? 'Times-Italic' : 'Times-Roman').fontSize(FS);
      const h = doc.heightOfString(t, { width: W });
      ensure(Math.min(h, 60));
      doc.text(t, L, doc.y, { width: W });
    };

    // ---- header
    const name = profile?.fullName || 'Your Name';
    doc.font('Times-Bold').fontSize(20).text(name, L, doc.y, { width: W, align: 'center' });
    if (profile?.headline) doc.font('Times-Italic').fontSize(11).text(profile.headline, L, doc.y + 1, { width: W, align: 'center' });
    const contact = [profile?.email, profile?.phone, profile?.location, profile?.linkedin, profile?.github, profile?.website].filter(Boolean).join('  |  ');
    if (contact) doc.font('Times-Roman').fontSize(9.5).text(contact, L, doc.y + 2, { width: W, align: 'center' });
    doc.y += 2;

    for (const s of wanted) {
      if (s === 'summary' && profile?.summary) {
        heading('Profile');
        para(profile.summary);
      }
      if (s === 'education' && education.length) {
        heading('Education');
        education.forEach((e, i) => {
          if (i) doc.y += 3;
          row(e.institution, e.location, true);
          const dates = [e.startDate, e.endDate].filter(Boolean).join(' - ');
          row(e.qualification, dates);
          e.details.forEach(bullet);
        });
      }
      if (s === 'experience' && experience.length) {
        heading('Experience');
        experience.forEach((e, i) => {
          if (i) doc.y += 3;
          row(e.company, e.location, true);
          const dates = [e.startDate, e.current ? 'Present' : e.endDate].filter(Boolean).join(' - ');
          row(e.title, dates);
          e.bullets.forEach(bullet);
        });
      }
      if (s === 'projects') {
        // skip placeholder entries that have nothing to show
        const shown = projects.filter((p) => p.description || p.tech.length || p.imageIds.some((id) => imageBuffers.has(id)));
        if (shown.length) heading('Projects');
        shown.forEach((p, i) => {
          if (i) doc.y += 5;
          const link = (p.url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
          // keep a project's text and screenshots together on one page
          doc.font('Times-Roman').fontSize(FS);
          const hasImgs = p.imageIds.slice(0, 3).some((id) => imageBuffers.has(id));
          const need =
            16 + (p.role ? 14 : 0) + (p.description ? doc.heightOfString(p.description, { width: W }) + 2 : 0) +
            (p.tech.length ? 16 : 0) + (hasImgs ? 104 : 0);
          ensure(need);
          row(p.name, link.length > 46 ? link.slice(0, 45) + '…' : link, true);
          if (p.role) row(p.role, '', false, true);
          if (p.description) para(p.description);
          if (p.tech.length) {
            doc.font('Times-Bold').fontSize(FS);
            const label = 'Tech: ';
            const lw = doc.widthOfString(label);
            doc.font('Times-Roman');
            const h = doc.heightOfString(p.tech.join(', '), { width: W - lw });
            ensure(h);
            const y = doc.y;
            doc.font('Times-Bold').text(label, L, y, { width: lw + 2, lineBreak: false });
            doc.font('Times-Roman').text(p.tech.join(', '), L + lw, y, { width: W - lw });
            doc.y = y + Math.max(h, FS * 1.2);
          }
          const imgs = p.imageIds.slice(0, 3).map((id) => imageBuffers.get(id)).filter(Boolean);
          if (imgs.length) {
            const boxW = (W - 2 * 8) / 3;
            const boxH = 96;
            ensure(boxH + 6);
            const y = doc.y + 4;
            imgs.forEach((buf, k) => {
              try {
                doc.image(buf, L + k * (boxW + 8), y, { fit: [boxW, boxH], align: 'center', valign: 'center' });
                doc.rect(L + k * (boxW + 8), y, boxW, boxH).lineWidth(0.4).strokeColor('#cccccc').stroke();
              } catch {
                /* skip unsupported image */
              }
            });
            doc.y = y + boxH + 4;
          }
        });
      }
      if (s === 'skills' && skills.length) {
        heading('Skills');
        const groups = new Map<string, string[]>();
        skills.forEach((k) => groups.set(k.category || 'General', [...(groups.get(k.category || 'General') || []), k.name]));
        groups.forEach((list, cat) => {
          doc.font('Times-Bold').fontSize(FS);
          const label = `${cat}: `;
          const lw = doc.widthOfString(label);
          doc.font('Times-Roman');
          const h = doc.heightOfString(list.join(', '), { width: W - lw });
          ensure(h);
          const y = doc.y;
          doc.font('Times-Bold').text(label, L, y, { width: lw + 2, lineBreak: false });
          doc.font('Times-Roman').text(list.join(', '), L + lw, y, { width: W - lw });
          doc.y = y + Math.max(h, FS * 1.2);
        });
      }
      if (s === 'certifications' && certs.length) {
        heading('Certification / Achievements');
        certs.forEach((c) => row(c.title + (c.issuer ? `, ${c.issuer}` : ''), c.date));
      }
      if (s === 'publications' && pubs.length) {
        heading('Publications');
        pubs.forEach((p) => {
          para(p.citation + (p.url ? ` ${p.url}` : ''));
          doc.y += 2;
        });
      }
      if (s === 'references' && refs.length) {
        heading('Reference');
        refs.forEach((r, i) => {
          if (i) doc.y += 4;
          row(r.name + (r.role ? ` (${r.role})` : ''), '', true);
          [r.company, r.email, r.phone].filter(Boolean).forEach((l) => row(l));
        });
      }
    }

    doc.end();
    return done;
  }
}
