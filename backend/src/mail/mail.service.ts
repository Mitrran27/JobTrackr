import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (user && pass) {
      const port = Number(process.env.SMTP_PORT || 465);
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port,
        secure: port === 465,
        auth: { user, pass: pass.replace(/\s+/g, '') },
      });
    } else {
      this.log.warn('SMTP_USER / SMTP_PASS not set: emails will be skipped');
    }
  }

  async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM || `JobTrackr <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
      });
      return true;
    } catch (e: any) {
      this.log.error(`Failed to send "${subject}" to ${to}: ${e?.message}`);
      return false;
    }
  }

  private wrap(title: string, body: string) {
    return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1f2937">
      <h2 style="margin:0 0 16px;color:#4338ca">${esc(title)}</h2>${body}
      <p style="margin-top:32px;font-size:12px;color:#6b7280">Sent by JobTrackr</p></div>`;
  }

  welcome(to: string, name: string) {
    const url = process.env.APP_URL || '';
    return this.send(
      to,
      'Welcome to JobTrackr',
      this.wrap(
        `Welcome, ${name}!`,
        `<p>Your account is ready. Upload your CV, fill in your profile and start saving jobs.</p>
         <p><a href="${esc(url)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open JobTrackr</a></p>`,
      ),
    );
  }

  resetPassword(to: string, token: string) {
    const link = `${process.env.APP_URL || ''}/reset?token=${encodeURIComponent(token)}`;
    return this.send(
      to,
      'Reset your JobTrackr password',
      this.wrap(
        'Reset your password',
        `<p>Click the button below to choose a new password. The link is valid for 1 hour.</p>
         <p><a href="${esc(link)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset password</a></p>
         <p style="font-size:13px;color:#6b7280">If you did not request this, ignore this email.</p>`,
      ),
    );
  }

  digest(to: string, name: string, items: { title: string; when: string; kind: string }[]) {
    const rows = items
      .map((i) => `<li style="margin-bottom:8px"><b>${esc(i.kind)}</b>: ${esc(i.title)}<br><span style="color:#6b7280">${esc(i.when)}</span></li>`)
      .join('');
    return this.send(to, `JobTrackr: ${items.length} item(s) need your attention`, this.wrap(`Hi ${name}, here is your day`, `<ul style="padding-left:18px">${rows}</ul>`));
  }
}
