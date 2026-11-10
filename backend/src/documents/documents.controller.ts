import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocKind } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DocumentsService } from './documents.service';

class CreateDocumentDto {
  @IsEnum(DocKind) kind: DocKind;
  @IsString() @MaxLength(150) title: string;
  @IsOptional() @IsString() html?: string;
}

class UpdateDocumentDto {
  @IsOptional() @IsEnum(DocKind) kind?: DocKind;
  @IsOptional() @IsString() @MaxLength(150) title?: string;
  @IsOptional() @IsString() html?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private svc: DocumentsService) {}

  @Get()
  list(@CurrentUser() uid: string) {
    return this.svc.list(uid);
  }

  @Post()
  create(@CurrentUser() uid: string, @Body() dto: CreateDocumentDto) {
    return this.svc.create(uid, dto);
  }

  /** multipart: file + kind (CV | COVER_LETTER) */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  upload(@CurrentUser() uid: string, @UploadedFile() file: Express.Multer.File, @Body('kind') kind: string) {
    const k = kind === 'COVER_LETTER' ? DocKind.COVER_LETTER : DocKind.CV;
    return this.svc.upload(uid, file, k);
  }

  @Get(':id')
  get(@CurrentUser() uid: string, @Param('id') id: string) {
    return this.svc.get(uid, id);
  }

  @Patch(':id')
  update(@CurrentUser() uid: string, @Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.svc.update(uid, id, dto);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() uid: string, @Param('id') id: string) {
    return this.svc.duplicate(uid, id);
  }

  @Delete(':id')
  remove(@CurrentUser() uid: string, @Param('id') id: string) {
    return this.svc.remove(uid, id);
  }

  /** GET /documents/:id/export?format=pdf|docx */
  @Get(':id/export')
  async export(@CurrentUser() uid: string, @Param('id') id: string, @Query('format') format: string, @Res() res: Response) {
    if (format !== 'pdf' && format !== 'docx') throw new BadRequestException('format must be pdf or docx');
    const f = await this.svc.export(uid, id, format);
    res.setHeader('Content-Type', f.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${f.filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
    );
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(f.data);
  }
}
