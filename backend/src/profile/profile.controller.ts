import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ProfileService } from './profile.service';

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private svc: ProfileService) {}

  @Get()
  all(@CurrentUser() uid: string) {
    return this.svc.getAll(uid);
  }

  @Put()
  update(@CurrentUser() uid: string, @Body() body: any) {
    return this.svc.updateProfile(uid, body);
  }

  @Get('goal')
  goal(@CurrentUser() uid: string) {
    return this.svc.goal(uid);
  }

  @Get('career')
  career(@CurrentUser() uid: string) {
    return this.svc.getCareer(uid);
  }

  @Put('career')
  updateCareer(@CurrentUser() uid: string, @Body() body: any) {
    return this.svc.updateCareer(uid, body);
  }

  @Get('section/:section')
  list(@CurrentUser() uid: string, @Param('section') s: string) {
    return this.svc.list(uid, s);
  }

  @Post('section/:section')
  create(@CurrentUser() uid: string, @Param('section') s: string, @Body() body: any) {
    return this.svc.create(uid, s, body);
  }

  @Put('section/:section/order')
  reorder(@CurrentUser() uid: string, @Param('section') s: string, @Body() body: { ids: string[] }) {
    return this.svc.reorder(uid, s, Array.isArray(body?.ids) ? body.ids : []);
  }

  @Patch('section/:section/:id')
  patch(@CurrentUser() uid: string, @Param('section') s: string, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(uid, s, id, body);
  }

  @Delete('section/:section/:id')
  remove(@CurrentUser() uid: string, @Param('section') s: string, @Param('id') id: string) {
    return this.svc.remove(uid, s, id);
  }
}
