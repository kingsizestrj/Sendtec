import { Body, Controller, Get, Ip, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsEmail, IsString } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, Public } from './decorators';
import { assertNotLocked, registerFailure, registerSuccess } from './login-limiter';

// hash fixo para comparar quando o e-mail não existe: a resposta leva o mesmo tempo e não revela quais e-mails estão cadastrados
const DUMMY_HASH = bcrypt.hashSync('sendtec-dummy-password', 10);

class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

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
}
