import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const fmt = (d: Date) =>
  d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: process.env.TZ_NAME || 'Asia/Kuala_Lumpur' });

@Injectable()
export class RemindersService {
  private log = new Logger('Reminders');
  constructor(private prisma: PrismaService, private mail: MailService) {}

  /** Every morning at 08:00: interviews in the next 48h and follow-ups that are due */
  @Cron('0 8 * * *', { timeZone: process.env.TZ_NAME || 'Asia/Kuala_Lumpur' })
  async daily() {
    const now = new Date();
    const in48 = new Date(now.getTime() + 48 * 3600 * 1000);
    const users = await this.prisma.user.findMany({
      where: { profile: { remindersEnabled: true } },
      select: { id: true, email: true, name: true },
    });
    let sent = 0;
    for (const u of users) {
      const jobs = await this.prisma.job.findMany({
        where: {
          userId: u.id,
          status: { not: 'CLOSED' },
          OR: [{ interviewAt: { gte: now, lte: in48 } }, { followUpAt: { lte: in48 }, status: { in: ['WAITING', 'IN_PROGRESS', 'INTERVIEW'] } }],
        },
      });
      const items: { title: string; when: string; kind: string }[] = [];
      for (const j of jobs) {
        const label = `${j.title}${j.company ? ' @ ' + j.company : ''}`;
        if (j.interviewAt && j.interviewAt >= now && j.interviewAt <= in48) items.push({ kind: 'Interview', title: label, when: fmt(j.interviewAt) });
        if (j.followUpAt && j.followUpAt <= in48) items.push({ kind: 'Follow up', title: label, when: fmt(j.followUpAt) });
      }
      if (items.length && (await this.mail.digest(u.email, u.name, items))) sent++;
    }
    this.log.log(`Daily digest sent to ${sent} user(s)`);
  }
}
