import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LoginDto, RegisterDto } from './auth.dto';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private mail: MailService) {}

  private publicUser(u: { id: string; email: string; name: string }) {
    return { id: u.id, email: u.email, name: u.name };
  }

  private sign(userId: string) {
    return this.jwt.sign({ sub: userId });
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('An account with this email already exists');
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash: await bcrypt.hash(dto.password, 11),
        profile: { create: { fullName: dto.name.trim(), email } },
        careerPlan: { create: {} },
      },
    });
    void this.mail.welcome(email, user.name);
    return { token: this.sign(user.id), user: this.publicUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase().trim() } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return { token: this.sign(user.id), user: this.publicUser(user) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  /** Always responds the same way so emails cannot be enumerated */
  async forgot(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (user) {
      const token = randomBytes(32).toString('hex');
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetTokenHash: sha(token), resetExpires: new Date(Date.now() + 60 * 60 * 1000) },
      });
      void this.mail.resetPassword(user.email, token);
    }
    return { ok: true };
  }

  async reset(token: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { resetTokenHash: sha(token), resetExpires: { gt: new Date() } },
    });
    if (!user) throw new BadRequestException('Reset link is invalid or has expired');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 11), resetTokenHash: null, resetExpires: null },
    });
    return { ok: true };
  }
}
