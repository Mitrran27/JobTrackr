/**
 * Seeds skills + projects (with screenshots) for the default user.
 *   npm run db:seed:portfolio
 * Safe to re-run: items are matched by name and replaced, nothing else is touched.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const EMAIL = process.env.SEED_EMAIL || 'mmitrran@gmail.com';
const DATA = join(__dirname, 'data');

interface SeedProject {
  name: string; role: string; url: string; description: string;
  tech: string[]; images: string[]; remoteImages: string[];
}
const data: { skills: { name: string; category: string }[]; projects: SeedProject[] } = JSON.parse(
  readFileSync(join(DATA, 'portfolio.json'), 'utf8'),
);

/** Downscale to a CV-friendly JPEG when `sharp` is available, otherwise keep the original */
async function optimise(buf: Buffer): Promise<{ data: Buffer; mime: string }> {
  try {
    const sharp = require('sharp');
    const out = await sharp(buf).rotate().resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 80, progressive: true }).toBuffer();
    return { data: out, mime: 'image/jpeg' };
  } catch {
    return { data: buf, mime: 'image/png' };
  }
}

async function download(url: string): Promise<{ data: Buffer; mime: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get('content-type') || '').split(';')[0];
    if (!['image/png', 'image/jpeg'].includes(type)) throw new Error(`unsupported type ${type}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const out = await optimise(buf);
    if (out.data.length > 2.5 * 1024 * 1024) throw new Error('image too large');
    return out;
  } catch (e: any) {
    console.warn(`   ! skipped image ${url.split('/').pop()}: ${e.message}`);
    return null;
  }
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`User ${EMAIL} not found. Run "npm run db:seed" first.`);
  const userId = user.id;

  // ---- skills (grouped by category, in the order of the data file)
  const existing = await prisma.skill.findMany({ where: { userId } });
  const find = (n: string) => existing.find((s) => s.name.toLowerCase() === n.toLowerCase());
  const base = existing.filter((s) => !data.skills.some((d) => d.name.toLowerCase() === s.name.toLowerCase())).length;
  let i = 0;
  for (const s of data.skills) {
    const row = find(s.name);
    if (row) await prisma.skill.update({ where: { id: row.id }, data: { category: s.category, sortOrder: i } });
    else await prisma.skill.create({ data: { userId, name: s.name, category: s.category, sortOrder: i } });
    i++;
  }
  // keep any skills you added yourself after the seeded ones
  for (const s of existing.filter((e) => !data.skills.some((d) => d.name.toLowerCase() === e.name.toLowerCase()))) {
    await prisma.skill.update({ where: { id: s.id }, data: { sortOrder: i++ } });
  }
  console.log(`Skills: ${data.skills.length} seeded (${base} of your own kept)`);

  // ---- projects
  const owned = await prisma.project.findMany({ where: { userId } });
  let order = 0;
  for (const p of data.projects) {
    const old = owned.filter((o) => o.name.toLowerCase() === p.name.toLowerCase());
    for (const o of old) {
      await prisma.fileAsset.deleteMany({ where: { id: { in: o.imageIds }, userId } });
      await prisma.project.delete({ where: { id: o.id } });
    }

    const ids: string[] = [];
    for (const rel of p.images) {
      const buf = readFileSync(join(DATA, rel));
      const a = await prisma.fileAsset.create({ data: { userId, name: rel.split('/').pop()!, mime: 'image/jpeg', data: buf } });
      ids.push(a.id);
    }
    for (const url of p.remoteImages) {
      const img = await download(url);
      if (!img) continue;
      const a = await prisma.fileAsset.create({
        data: { userId, name: `${p.name}.${img.mime === 'image/png' ? 'png' : 'jpg'}`, mime: img.mime, data: img.data },
      });
      ids.push(a.id);
    }

    await prisma.project.create({
      data: {
        userId, name: p.name, role: p.role, url: p.url, description: p.description,
        tech: p.tech, imageIds: ids, sortOrder: order++,
      },
    });
    console.log(` - ${p.name} (${ids.length} image${ids.length === 1 ? '' : 's'})`);
  }
  // projects you added yourself go after the seeded ones
  for (const o of owned.filter((x) => !data.projects.some((p) => p.name.toLowerCase() === x.name.toLowerCase()))) {
    await prisma.project.update({ where: { id: o.id }, data: { sortOrder: order++ } });
  }
  console.log(`Projects: ${data.projects.length} seeded`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
