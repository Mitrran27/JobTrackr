import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { JobsModule } from './jobs/jobs.module';
import { CvModule } from './cv/cv.module';
import { FilesModule } from './files/files.module';
import { RemindersService } from './reminders/reminders.service';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    MailModule,
    AuthModule,
    ProfileModule,
    JobsModule,
    CvModule,
    FilesModule,
  ],
  controllers: [HealthController],
  providers: [RemindersService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
