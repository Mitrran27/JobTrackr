import { Controller, Get, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CvService } from './cv.service';

@UseGuards(JwtAuthGuard)
@Controller('cv')
export class CvController {
  constructor(private svc: CvService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(@CurrentUser() uid: string, @UploadedFile() file: Express.Multer.File) {
    return this.svc.upload(uid, file);
  }

  @Get('original')
  async original(@CurrentUser() uid: string, @Res() res: Response) {
    const f = await this.svc.original(uid);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.name)}"`);
    res.send(f.data);
  }

  /** GET /cv/pdf?sections=education,experience&images=1&download=1 */
  @Get('pdf')
  async pdf(
    @CurrentUser() uid: string,
    @Query('sections') sections: string,
    @Query('images') images: string,
    @Query('download') download: string,
    @Res() res: Response,
  ) {
    const buf = await this.svc.generate(uid, {
      sections: sections ? sections.split(',').map((s) => s.trim()) : undefined,
      images: images !== '0',
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="CV.pdf"`);
    res.send(buf);
  }
}
