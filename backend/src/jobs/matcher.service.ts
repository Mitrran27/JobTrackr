import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalize, findSkills } from './skills.dict';

export interface MatchResult {
  score: number;
  label: 'High' | 'Medium' | 'Low';
  matchedSkills: string[];
  missingSkills: string[];
  skillScore: number;
  titleScore: number;
  experienceScore: number;
  yourYears: number;
  requiredYears: number | null;
  reasons: string[];
}

interface Ctx {
  skills: Set<string>;
  tokens: Set<string>;
  titleTokens: Set<string>;
  years: number;
  hasProfile: boolean;
}

const STOP = new Set(
  'the and for with that this from your you our are will have has not but all can any more their about into out who what when where which while also been being than then them they were was able must should work working team role job position candidate company looking year years experience required requirements responsibilities skills knowledge ability strong good excellent including etc such other based using use used well new within across'.split(
    ' ',
  ),
);
const LEVEL = new Set(['senior', 'junior', 'lead', 'principal', 'staff', 'intern', 'graduate', 'entry', 'level', 'associate', 'sr', 'jr', 'ii', 'iii', 'i']);
const FAMILIES: string[][] = [
  ['software', 'developer', 'engineer', 'programmer', 'frontend', 'backend', 'fullstack', 'full', 'stack', 'web', 'application'],
  ['data', 'analyst', 'analytics', 'scientist', 'bi', 'machine', 'learning', 'ai'],
  ['qa', 'quality', 'tester', 'test', 'automation'],
  ['devops', 'cloud', 'infrastructure', 'sre', 'reliability', 'platform'],
  ['mobile', 'android', 'ios', 'flutter'],
  ['designer', 'design', 'ux', 'ui', 'product'],
  ['support', 'technical', 'it', 'systems', 'network', 'administrator'],
];

const tokenize = (t: string) =>
  (t.toLowerCase().match(/[a-z][a-z0-9+#.]{1,}/g) || []).map((x) => x.replace(/\.+$/, '')).filter((x) => x.length > 2 && !STOP.has(x));

function parseDate(s: string): Date | null {
  if (!s) return null;
  if (/present|current|now|ongoing/i.test(s)) return new Date();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class MatcherService {
  constructor(private prisma: PrismaService) {}

  async buildContext(userId: string): Promise<Ctx> {
    const [profile, skills, experience, projects, education, career, certs] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.skill.findMany({ where: { userId } }),
      this.prisma.experience.findMany({ where: { userId } }),
      this.prisma.project.findMany({ where: { userId } }),
      this.prisma.education.findMany({ where: { userId } }),
      this.prisma.careerPlan.findUnique({ where: { userId } }),
      this.prisma.certification.findMany({ where: { userId } }),
    ]);

    const text = [
      profile?.headline, profile?.summary, profile?.cvText,
      ...skills.map((s) => s.name),
      ...experience.flatMap((e) => [e.title, e.company, ...e.bullets]),
      ...projects.flatMap((p) => [p.name, p.description, ...p.tech]),
      ...education.flatMap((e) => [e.qualification, ...e.details]),
      ...certs.map((c) => c.title),
    ]
      .filter(Boolean)
      .join('\n');

    const skillSet = new Set<string>(findSkills(text));
    for (const s of skills) canonicalize(s.name).forEach((n) => skillSet.add(n));
    for (const p of projects) p.tech.forEach((t) => canonicalize(t).forEach((n) => skillSet.add(n)));

    const titleText = [profile?.headline, career?.targetRole, ...experience.map((e) => e.title), ...education.map((e) => e.qualification)]
      .filter(Boolean)
      .join(' ');

    let months = 0;
    for (const e of experience) {
      const s = parseDate(e.startDate);
      const en = e.current ? new Date() : parseDate(e.endDate);
      if (s && en && en > s) months += (en.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30.4);
    }

    return {
      skills: skillSet,
      tokens: new Set(tokenize(text)),
      titleTokens: new Set(tokenize(titleText)),
      years: Math.round((months / 12) * 10) / 10,
      hasProfile: skillSet.size > 0 || text.length > 100,
    };
  }

  score(job: { title: string; description: string }, ctx: Ctx): MatchResult {
    const text = `${job.title}\n${job.description}`;
    const reasons: string[] = [];
    const jobSkills = findSkills(text);
    const matched = jobSkills.filter((s) => ctx.skills.has(s));
    const missing = jobSkills.filter((s) => !ctx.skills.has(s));

    // --- skills (60%)
    let skillScore: number;
    if (jobSkills.length >= 3) {
      skillScore = matched.length / jobSkills.length;
    } else {
      const freq = new Map<string, number>();
      tokenize(text).forEach((t) => freq.set(t, (freq.get(t) || 0) + 1));
      const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t]) => t);
      const hit = top.filter((t) => ctx.tokens.has(t)).length;
      skillScore = top.length ? Math.min(1, hit / top.length / 0.6) : 0;
      reasons.push('Few explicit tech skills were found in the ad, so keyword overlap was used.');
    }

    // --- title (20%)
    const jt = tokenize(job.title).filter((t) => !LEVEL.has(t));
    let titleScore = jt.length ? jt.filter((t) => ctx.titleTokens.has(t)).length / jt.length : 0;
    const sameFamily = FAMILIES.some((f) => jt.some((t) => f.includes(t)) && [...ctx.titleTokens].some((t) => f.includes(t)));
    if (sameFamily) titleScore = Math.max(titleScore, 0.6);

    // --- experience (20%)
    const m = text.match(/(\d{1,2})\s*\+?\s*(?:-|to)?\s*\d{0,2}\s*\+?\s*(?:years?|yrs?)/i);
    let required: number | null = m ? Number(m[1]) : null;
    if (required != null && required > 15) required = null;
    if (required == null) {
      if (/\b(senior|lead|principal|manager|head of)\b/i.test(job.title)) required = 5;
      else if (/\b(junior|graduate|entry|fresh|intern|trainee)\b/i.test(text)) required = 0;
    }
    let experienceScore = 1;
    if (required && required > 1) {
      const gap = required - ctx.years;
      experienceScore = gap <= 0 ? 1 : Math.max(0, 1 - gap / required);
      if (gap > 0) reasons.push(`Ad asks for about ${required} year(s); your profile shows ${ctx.years}.`);
    }

    if (!ctx.hasProfile) reasons.push('Add skills, experience or upload your CV to get an accurate score.');
    if (matched.length) reasons.push(`You already cover ${matched.length} of ${jobSkills.length} detected skills.`);
    if (missing.length) reasons.push(`Gaps to close: ${missing.slice(0, 6).join(', ')}.`);

    const score = Math.round(100 * (0.6 * skillScore + 0.2 * titleScore + 0.2 * experienceScore));
    return {
      score,
      label: score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low',
      matchedSkills: matched,
      missingSkills: missing,
      skillScore: Math.round(skillScore * 100),
      titleScore: Math.round(titleScore * 100),
      experienceScore: Math.round(experienceScore * 100),
      yourYears: ctx.years,
      requiredYears: required,
      reasons,
    };
  }
}
