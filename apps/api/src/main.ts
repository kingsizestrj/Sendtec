import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bcrypt from 'bcryptjs';
import { AppModule } from './app.module';
import { PrismaService } from './prisma.service';

async function ensureAdmin(prisma: PrismaService) {
  if (await prisma.user.count()) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@sendtec.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'trocar-esta-senha';
  await prisma.user.create({ data: { name: 'Administrador', email, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 10) } });
  Logger.warn(`Usuário administrador criado: ${email} — troque a senha no primeiro acesso`, 'Bootstrap');
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useBodyParser('json', { limit: '5mb' });
  app.enableShutdownHooks();
  await ensureAdmin(app.get(PrismaService));
  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  Logger.log(`Sendtec rodando em http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
