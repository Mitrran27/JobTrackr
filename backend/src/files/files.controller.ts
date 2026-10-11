import {
  BadRequestException, Controller, Delete, Get, NotFoundException, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

const IMAGE_MIMES = ['image/png', 'image/jpeg'];

@Controller('files')
export class FilesController {
  constructor(private prisma: PrismaService) {}

  /** Upload a PNG/JPEG (project screenshots etc). Stored in the database (Neon). */
  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024 } }))
  async upload(@CurrentUser() uid: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!IMAGE_MIMES.includes(file.mimetype)) throw new BadRequestException('Only PNG or JPEG images are allowed');
    const row = await this.prisma.fileAsset.create({
      data: { userId: uid, name: file.originalname.slice(0, 200), mime: file.mimetype, data: file.buffer },
    });
    return { id: row.id, url: `/api/files/${row.id}` };
  }

  /** Images are served publicly by their unguessable id so <img> tags work */
  @Get(':id')
  async get(@Param('id') id: string, @Res() res: Response) {
    const f = await this.prisma.fileAsset.findUnique({ where: { id } });
    if (!f || !IMAGE_MIMES.includes(f.mime)) throw new NotFoundException();
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(f.data));
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@CurrentUser() uid: string, @Param('id') id: string) {
    await this.prisma.fileAsset.deleteMany({ where: { id, userId: uid } });
    return { ok: true };
  }
}
