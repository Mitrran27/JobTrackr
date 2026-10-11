import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExtractorService } from './extractor.service';
import { MatcherService } from './matcher.service';

const str = (v: any, max: number) => (v == null ? '' : String(v).slice(0, max).trim());
const date = (v: any) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService, private extractor: ExtractorService, private matcher: MatcherService) {}

  /** Read a job ad from a URL (or pasted text) and score it against the profile, without saving */
  async preview(userId: string, body: { url?: string; rawText?: string }) {
    let job;
    if (body.rawText && body.rawText.trim().length > 40) job = this.extractor.fromText(body.rawText, str(body.url, 1000));
    else if (body.url) job = await this.extractor.fromUrl(body.url);
    else throw new BadRequestException('Provide a job URL or paste the job description');
    const match = this.matcher.score(job, await this.matcher.buildContext(userId));
    return { job, match };
  }

  private fields(body: any, partial: boolean) {
    const d: any = {};
    const set = (k: string, v: any) => {
      if (!partial || k in body) d[k] = v;
    };
    set('url', str(body.url, 2000));
    set('title', str(body.title, 200));
    set('company', str(body.company, 200));
    set('location', str(body.location, 200));
    set('description', str(body.description, 20000));
    set('salaryText', str(body.salaryText, 100));
    set('employmentType', str(body.employmentType, 100));
    set('notes', str(body.notes, 10000));
    if (!partial || 'appliedAt' in body) d.appliedAt = date(body.appliedAt);
    if (!partial || 'interviewAt' in body) d.interviewAt = date(body.interviewAt);
    if (!partial || 'followUpAt' in body) d.followUpAt = date(body.followUpAt);
    if ('status' in body) {
      if (!(body.status in JobStatus)) throw new BadRequestException('Invalid status');
      d.status = body.status as JobStatus;
    }
    return d;
  }

  async create(userId: string, body: any) {
    const data = this.fields(body, false);
    if (!data.title) throw new BadRequestException('Title is required');
    const match = this.matcher.score(data, await this.matcher.buildContext(userId));
    if (data.status && data.status !== 'SAVED' && data.status !== 'CLOSED' && !data.appliedAt) data.appliedAt = new Date();
    return this.prisma.job.create({
      data: { ...data, userId, matchScore: match.score, matchDetails: match as unknown as Prisma.InputJsonValue },
    });
  }

  list(userId: string) {
    return this.prisma.job.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, title: true, company: true, location: true, url: true, status: true, matchScore: true,
        salaryText: true, appliedAt: true, interviewAt: true, followUpAt: true, updatedAt: true, createdAt: true,
      },
    });
  }

  async get(userId: string, id: string) {
    const job = await this.prisma.job.findFirst({ where: { id, userId } });
    if (!job) throw new NotFoundException();
    return job;
  }

  async update(userId: string, id: string, body: any) {
    const current = await this.get(userId, id);
    const data = this.fields(body, true);
    if ('title' in data && !data.title) throw new BadRequestException('Title cannot be empty');
    if (data.status && data.status !== current.status) {
      if (current.status === 'SAVED' && data.status !== 'CLOSED' && !current.appliedAt && !data.appliedAt) data.appliedAt = new Date();
    }
    if ('title' in data || 'description' in data) {
      const match = this.matcher.score(
        { title: data.title ?? current.title, description: data.description ?? current.description },
        await this.matcher.buildContext(userId),
      );
      data.matchScore = match.score;
      data.matchDetails = match as unknown as Prisma.InputJsonValue;
    }
    return this.prisma.job.update({ where: { id }, data });
  }

  async remove(userId: string, id: string) {
    const r = await this.prisma.job.deleteMany({ where: { id, userId } });
    if (!r.count) throw new NotFoundException();
    return { ok: true };
  }

  async rescore(userId: string, id?: string) {
    const ctx = await this.matcher.buildContext(userId);
    const jobs = await this.prisma.job.findMany({ where: { userId, ...(id ? { id } : {}) } });
    for (const j of jobs) {
      const match = this.matcher.score(j, ctx);
      await this.prisma.job.update({
        where: { id: j.id },
        data: { matchScore: match.score, matchDetails: match as unknown as Prisma.InputJsonValue },
      });
    }
    return { rescored: jobs.length };
  }

  async stats(userId: string) {
    const jobs = await this.prisma.job.findMany({
      where: { userId },
      select: { status: true, matchScore: true, appliedAt: true },
    });
    const byStatus: Record<string, number> = { SAVED: 0, WAITING: 0, IN_PROGRESS: 0, INTERVIEW: 0, OFFER: 0, CLOSED: 0 };
    jobs.forEach((j) => byStatus[j.status]++);
    const applied = jobs.filter((j) => j.appliedAt).length;
    const responded = jobs.filter((j) => ['IN_PROGRESS', 'INTERVIEW', 'OFFER'].includes(j.status)).length;
    const scored = jobs.filter((j) => j.matchScore != null);
    const upcoming = await this.prisma.job.findMany({
      where: { userId, interviewAt: { gte: new Date() }, status: { not: 'CLOSED' } },
      orderBy: { interviewAt: 'asc' },
      take: 5,
      select: { id: true, title: true, company: true, interviewAt: true },
    });
    const followUps = await this.prisma.job.findMany({
      where: { userId, followUpAt: { lte: new Date(Date.now() + 86400000) }, status: { in: ['WAITING', 'IN_PROGRESS', 'INTERVIEW'] } },
      orderBy: { followUpAt: 'asc' },
      take: 5,
      select: { id: true, title: true, company: true, followUpAt: true },
    });
    return {
      total: jobs.length,
      byStatus,
      applied,
      responseRate: applied ? Math.round((responded / applied) * 100) : 0,
      avgMatch: scored.length ? Math.round(scored.reduce((a, j) => a + j.matchScore, 0) / scored.length) : 0,
      upcoming,
      followUps,
    };
  }
}
