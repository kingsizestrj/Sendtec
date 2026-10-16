import { Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { Public } from '../auth/decorators';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private media: MediaService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.media.save(file);
  }

  // Público: a Meta precisa baixar a imagem sem autenticação
  @Public()
  @Get(':id/:filename')
  async serve(@Param('id') id: string, @Res() res: Response) {
    const media = await this.media.get(id);
    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    createReadStream(media.path).pipe(res);
  }
}
