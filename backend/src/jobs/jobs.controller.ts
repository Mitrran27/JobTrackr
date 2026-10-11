import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JobsService } from './jobs.service';

@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private svc: JobsService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('preview')
  preview(@CurrentUser() uid: string, @Body() body: any) {
    return this.svc.preview(uid, body || {});
  }

  @Get('stats')
  stats(@CurrentUser() uid: string) {
    return this.svc.stats(uid);
  }

  @Post('rescore-all')
  rescoreAll(@CurrentUser() uid: string) {
    return this.svc.rescore(uid);
  }

  @Get()
  list(@CurrentUser() uid: string) {
    return this.svc.list(uid);
  }

  @Post()
  create(@CurrentUser() uid: string, @Body() body: any) {
    return this.svc.create(uid, body || {});
  }

  @Get(':id')
  get(@CurrentUser() uid: string, @Param('id') id: string) {
    return this.svc.get(uid, id);
  }

  @Patch(':id')
  update(@CurrentUser() uid: string, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(uid, id, body || {});
  }

  @Post(':id/rescore')
  rescore(@CurrentUser() uid: string, @Param('id') id: string) {
    return this.svc.rescore(uid, id);
  }

  @Delete(':id')
  remove(@CurrentUser() uid: string, @Param('id') id: string) {
    return this.svc.remove(uid, id);
  }
}
