import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PROFILE_STRINGS, SECTIONS, SectionConfig } from './sections';

const str = (v: any, max = 5000) => (v == null ? '' : String(v).slice(0, max));
const strArr = (v: any) =>
  Array.isArray(v) ? v.map((x) => str(x, 1000).trim()).filter(Boolean).slice(0, 50) : [];
const num = (v: any) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  private cfg(section: string): SectionConfig {
    const c = SECTIONS[section];
    if (!c) throw new NotFoundException(`Unknown section "${section}"`);
    return c;
  }

  private delegate(c: SectionConfig): any {
    return (this.prisma as any)[c.model];
  }

  private clean(c: SectionConfig, body: any, partial: boolean) {
    const data: any = {};
    for (const k of c.strings) if (!partial || k in body) data[k] = str(body[k]).trim();
    for (const k of c.arrays || []) if (!partial || k in body) data[k] = strArr(body[k]);
    for (const k of c.numbers || []) if (!partial || k in body) data[k] = num(body[k]);
    for (const k of c.booleans || []) if (!partial || k in body) data[k] = !!body[k];
    if (!partial && !data[c.required]) throw new BadRequestException(`"${c.required}" is required`);
    return data;
  }

  async ensureProfile(userId: string) {
    return this.prisma.profile.upsert({ where: { userId }, update: {}, create: { userId } });
  }

  async getAll(userId: string) {
    const profile = await this.ensureProfile(userId);
    const order = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];
    const [education, experience, skills, projects, certifications, publications, references, career] =
      await Promise.all([
        this.prisma.education.findMany({ where: { userId }, orderBy: order }),
        this.prisma.experience.findMany({ where: { userId }, orderBy: order }),
        this.prisma.skill.findMany({ where: { userId }, orderBy: order }),
        this.prisma.project.findMany({ where: { userId }, orderBy: order }),
        this.prisma.certification.findMany({ where: { userId }, orderBy: order }),
        this.prisma.publication.findMany({ where: { userId }, orderBy: order }),
        this.prisma.reference.findMany({ where: { userId }, orderBy: order }),
        this.prisma.careerPlan.upsert({ where: { userId }, update: {}, create: { userId } }),
      ]);
    const { cvText, ...p } = profile;
    return {
      profile: { ...p, hasCvText: !!cvText },
      education, experience, skills, projects, certifications, publications, references, career,
    };
  }

  async updateProfile(userId: string, body: any) {
    await this.ensureProfile(userId);
    const data: any = {};
    for (const k of PROFILE_STRINGS) if (k in body) data[k] = str(body[k]).trim();
    if ('currentSalary' in body) data.currentSalary = num(body.currentSalary);
    if ('targetIncreaseMin' in body) data.targetIncreaseMin = Math.max(0, Math.min(500, Math.round(Number(body.targetIncreaseMin) || 0)));
    if ('targetIncreaseMax' in body) data.targetIncreaseMax = Math.max(0, Math.min(500, Math.round(Number(body.targetIncreaseMax) || 0)));
    if ('remindersEnabled' in body) data.remindersEnabled = !!body.remindersEnabled;
    if (data.salaryPeriod && !['MONTH', 'YEAR'].includes(data.salaryPeriod)) data.salaryPeriod = 'MONTH';
    const { cvText, ...p } = await this.prisma.profile.update({ where: { userId }, data });
    return { ...p, hasCvText: !!cvText };
  }

  /** Income goal: current income +20-30% (configurable) */
  async goal(userId: string) {
    const p = await this.ensureProfile(userId);
    const cur = p.currentSalary;
    const min = cur != null ? Math.round(cur * (1 + p.targetIncreaseMin / 100)) : null;
    const max = cur != null ? Math.round(cur * (1 + p.targetIncreaseMax / 100)) : null;
    return {
      current: cur,
      currency: p.salaryCurrency,
      period: p.salaryPeriod,
      increaseMin: p.targetIncreaseMin,
      increaseMax: p.targetIncreaseMax,
      targetMin: min,
      targetMax: max,
    };
  }

  async getCareer(userId: string) {
    return this.prisma.careerPlan.upsert({ where: { userId }, update: {}, create: { userId } });
  }

  async updateCareer(userId: string, body: any) {
    const data: any = {};
    for (const k of ['targetRole', 'targetIndustries', 'targetLocations', 'notes']) if (k in body) data[k] = str(body[k]).trim();
    if ('targetDate' in body) {
      const d = body.targetDate ? new Date(body.targetDate) : null;
      data.targetDate = d && !isNaN(d.getTime()) ? d : null;
    }
    return this.prisma.careerPlan.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  }

  list(userId: string, section: string) {
    const c = this.cfg(section);
    return this.delegate(c).findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(userId: string, section: string, body: any) {
    const c = this.cfg(section);
    const count = await this.delegate(c).count({ where: { userId } });
    return this.delegate(c).create({ data: { ...this.clean(c, body, false), userId, sortOrder: count } });
  }

  async update(userId: string, section: string, id: string, body: any) {
    const c = this.cfg(section);
    const data = this.clean(c, body, true);
    if (c.required in data && !data[c.required]) throw new BadRequestException(`"${c.required}" is required`);
    const r = await this.delegate(c).updateMany({ where: { id, userId }, data });
    if (!r.count) throw new NotFoundException();
    return this.delegate(c).findUnique({ where: { id } });
  }

  async remove(userId: string, section: string, id: string) {
    const c = this.cfg(section);
    const r = await this.delegate(c).deleteMany({ where: { id, userId } });
    if (!r.count) throw new NotFoundException();
    return { ok: true };
  }

  async reorder(userId: string, section: string, ids: string[]) {
    const c = this.cfg(section);
    await this.prisma.$transaction(
      ids.map((id, i) => this.delegate(c).updateMany({ where: { id, userId }, data: { sortOrder: i } })),
    );
    return { ok: true };
  }
}
