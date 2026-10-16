import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';

class CreateUserDto {
  @IsString() name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsEnum(Role) role: Role;
}

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() active?: boolean;
}

const select = { id: true, name: true, email: true, role: true, active: true, createdAt: true };

@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get()
  list() {
    return this.prisma.user.findMany({ select, orderBy: { createdAt: 'asc' } });
  }

  @Post()
  async create(@Body() dto: CreateUserDto, @CurrentUser() me: AuthUser) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new BadRequestException('E-mail já cadastrado');
    const u = await this.prisma.user.create({
      data: { name: dto.name, email, role: dto.role, passwordHash: await bcrypt.hash(dto.password, 10) },
      select,
    });
    await this.audit.log(me, 'Criou usuário', 'usuario', u.id, { usuario: u.email, perfil: u.role });
    return u;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() me: AuthUser) {
    if (id === me.id && (dto.active === false || dto.role === Role.OPERATOR)) {
      throw new BadRequestException('Você não pode desativar ou rebaixar o próprio usuário');
    }
    const { password, ...rest } = dto;
    const u = await this.prisma.user.update({
      where: { id },
      data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
      select,
    });
    const what = [rest.role && 'perfil', rest.active !== undefined && (rest.active ? 'ativou' : 'desativou'), rest.name && 'nome', password && 'senha'].filter(Boolean);
    await this.audit.log(me, 'Alterou usuário', 'usuario', id, { usuario: u.email, alteracoes: what });
    return u;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() me: AuthUser) {
    if (id === me.id) throw new BadRequestException('Você não pode remover o próprio usuário');
    // Usuários com campanhas são apenas desativados para manter o histórico
    const used = await this.prisma.campaign.count({ where: { createdById: id } });
    const u = used ? await this.prisma.user.update({ where: { id }, data: { active: false }, select }) : await this.prisma.user.delete({ where: { id }, select });
    await this.audit.log(me, used ? 'Desativou usuário (tem campanhas)' : 'Excluiu usuário', 'usuario', id, { usuario: u.email });
    return u;
  }
}
