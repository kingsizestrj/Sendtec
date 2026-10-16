import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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

  /** Prévia do público: devolve os clientes para o mapa e o resumo. */
  @Post('audience/preview')
  async preview(@Body() spec: AudienceSpec, @Query('refresh') refresh?: string) {
    const { raw: _raw, ...result } = await this.audience.resolve(spec, { refresh: refresh === '1' });
    return result;
  }
}
