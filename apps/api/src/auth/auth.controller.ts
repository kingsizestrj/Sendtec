import { BadRequestException, Body, Controller, Get, HttpCode, Ip, Logger, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsEmail, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, Public } from './decorators';
import { assertNotLocked, registerFailure, registerSuccess } from './login-limiter';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';

// hash fixo para comparar quando o e-mail não existe: a resposta leva o mesmo tempo e não revela quais e-mails estão cadastrados
const DUMMY_HASH = bcrypt.hashSync('sendtec-dummy-password', 10);
const RESET_TTL_MS = 60 * 60 * 1000;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(8) newPassword: string;
}

class ForgotDto {
  @IsEmail() email: string;
}

class ResetDto {
  @IsString() token: string;
  @IsString() @MinLength(8) password: string;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mail: MailService,
    private settings: SettingsService,
    private audit: AuditService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    const email = dto.email.toLowerCase();
    assertNotLocked(email, ip);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.active || !valid) {
      registerFailure(email, ip);
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    registerSuccess(email);
    const token = await this.jwt.signAsync({ sub: user.id });
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  /** Qualquer usuário troca a própria senha (confirmando a atual). */
  @Patch('password')
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() me: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) throw new BadRequestException('Senha atual incorreta');
    await this.prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) } });
    await this.audit.log(me, 'Trocou a própria senha', 'usuario', me.id);
    return { ok: true };
  }

  @Public()
  @Get('forgot/available')
  async forgotAvailable() {
    return { available: await this.mail.configured() };
  }

  /** Envia o link de redefinição. Sempre responde "ok" para não revelar quais e-mails existem. */
  @Public()
  @Post('forgot')
  @HttpCode(200)
  async forgot(@Body() dto: ForgotDto, @Ip() ip: string) {
    const email = dto.email.toLowerCase();
    assertNotLocked(`reset:${email}`, ip);
    registerFailure(`reset:${email}`, ip); // limita pedidos repetidos ao mesmo e-mail
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.active) {
      const token = randomBytes(32).toString('base64url');
      await this.prisma.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
      const { publicUrl } = await this.settings.get('general');
      const link = `${(publicUrl || '').replace(/\/+$/, '')}/redefinir-senha?token=${token}`;
      try {
        await this.mail.send(
          user.email,
          'Redefinir sua senha do Sendtec',
          `<p>Olá, ${user.name}!</p><p>Para criar uma nova senha, acesse o link abaixo (válido por 1 hora):</p><p><a href="${link}">${link}</a></p><p>Se você não pediu, ignore este e-mail.</p>`,
          `Olá, ${user.name}! Para criar uma nova senha, acesse (válido por 1 hora): ${link}\nSe você não pediu, ignore este e-mail.`,
        );
        await this.audit.log({ id: user.id, name: user.name }, 'Pediu redefinição de senha', 'usuario', user.id);
      } catch (e: any) {
        this.logger.error(`Falha ao enviar e-mail de redefinição: ${e.message}`);
      }
    }
    return { ok: true };
  }

  @Public()
  @Post('reset')
  @HttpCode(200)
  async reset(@Body() dto: ResetDto) {
    const reset = await this.prisma.passwordReset.findUnique({ where: { tokenHash: sha256(dto.token) } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) throw new BadRequestException('Link inválido ou expirado. Peça um novo.');
    const user = await this.prisma.user.findUnique({ where: { id: reset.userId } });
    if (!user?.active) throw new BadRequestException('Link inválido ou expirado. Peça um novo.');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(dto.password, 10) } }),
      this.prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    ]);
    registerSuccess(user.email);
    await this.audit.log({ id: user.id, name: user.name }, 'Redefiniu a senha pelo link do e-mail', 'usuario', user.id);
    return { ok: true };
  }
}
