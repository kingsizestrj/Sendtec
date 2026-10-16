import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export interface Actor {
  id?: string | null;
  name: string;
}

/** Registro de atividades (quem criou, disparou, cancelou, mudou configurações…). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(actor: Actor | null, action: string, entity?: string, entityId?: string | null, details?: Record<string, unknown>) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: actor?.id ?? null,
          userName: actor?.name ?? 'Sistema',
          action,
          entity: entity ?? null,
          entityId: entityId ?? null,
          details: (details ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (e: any) {
      this.logger.warn(`Falha ao registrar atividade: ${e.message}`);
    }
  }

  async list(q: { page?: number; search?: string; userId?: string }) {
    const page = Math.max(1, Number(q.page) || 1);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.search ? { OR: [{ action: { contains: q.search, mode: 'insensitive' } }, { userName: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 50, take: 50 }),
    ]);
    return { total, page, pageSize: 50, items };
  }
}
