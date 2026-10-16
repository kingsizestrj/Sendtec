import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { AudienceService, AudienceSpec } from './audience.service';
import { IXC_TABLES, OPERATORS, VARIABLE_SOURCES } from './ixc.catalog';

@Controller('ixc')
export class IxcController {
  constructor(private audience: AudienceService) {}

  @Get('catalog')
  catalog() {
    return { tables: IXC_TABLES, operators: OPERATORS, variableSources: VARIABLE_SOURCES };
  }

  @Get('lookup/:kind')
  lookup(@Param('kind') kind: string) {
    return kind === 'cidade' ? this.audience.citiesInUse() : this.audience.lookup(kind);
  }

  /** Todos os campos que a tabela tem no IXC deste provedor. */
  @Get('fields/:table')
  fields(@Param('table') table: string) {
    return this.audience.fieldsOf(table);
  }

  /** Exporta em CSV quem vai receber (respeitando filtros, áreas, removidos e repetidos). */
  @Post('audience/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@Body() spec: AudienceSpec) {
    const { selected } = await this.audience.resolve(spec);
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['id', 'nome', 'telefone', 'bairro', 'cidade', 'latitude', 'longitude'];
    const lines = selected.map((c) => [c.id, c.name, c.phone, c.bairro, c.cidade, c.lat?.toFixed(6), c.lng?.toFixed(6)].map(esc).join(';'));
    return '\uFEFF' + [header.join(';'), ...lines].join('\n');
  }

  /** Prévia do público: devolve os clientes para o mapa e o resumo. */
  @Post('audience/preview')
  async preview(@Body() spec: AudienceSpec, @Query('refresh') refresh?: string) {
    const { raw: _raw, ...result } = await this.audience.resolve(spec, { refresh: refresh === '1' });
    return result;
  }
}
