import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { SettingsService } from '../settings/settings.service';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const ALLOWED = ['image/jpeg', 'image/png'];
const MAX_BYTES = 5 * 1024 * 1024; // limite da Meta para imagens

@Injectable()
export class MediaService {
  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  async save(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    if (!ALLOWED.includes(file.mimetype)) throw new BadRequestException('Use imagens JPG ou PNG');
    if (file.size > MAX_BYTES) throw new BadRequestException('A imagem deve ter no máximo 5 MB');
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const id = randomUUID();
    const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
    const filePath = path.join(UPLOAD_DIR, `${id}.${ext}`);
    await fs.writeFile(filePath, file.buffer);
    const media = await this.prisma.media.create({
      data: { id, filename: `${id}.${ext}`, mimeType: file.mimetype, size: file.size, path: filePath },
    });
    return { ...media, url: await this.publicUrl(media.id) };
  }

  async get(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException();
    return media;
  }

  async read(id: string) {
    const media = await this.get(id);
    return { media, buffer: await fs.readFile(media.path) };
  }

  /** URL pública usada pela Meta para baixar a imagem do cabeçalho no envio. */
  async publicUrl(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) return null;
    const { publicUrl } = await this.settings.get('general');
    const base = (publicUrl || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
    return `${base}/api/media/${media.id}/${media.filename}`;
  }
}
