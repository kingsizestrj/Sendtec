import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { SettingsService } from '../settings/settings.service';
import { IxcSettings } from '../settings/settings.types';

/** Filtro no formato "grid_param" do webservice do IXC. */
export interface IxcGridParam {
  TB: string; // tabela.campo
  OP: string; // =, !=, >, <, >=, <=, L
  P: string;
}

export interface IxcListResponse<T> {
  page: string | number;
  total: string | number;
  registros?: T[];
  type?: string;
  message?: string;
}

export type IxcRecord = Record<string, string>;

const PAGE_SIZE = 1000;

@Injectable()
export class IxcClient {
  private readonly logger = new Logger(IxcClient.name);

  constructor(private settings: SettingsService) {}

  private http(cfg: IxcSettings): AxiosInstance {
    if (!cfg.baseUrl || !cfg.token) throw new BadRequestException('Configure a URL e o token do IXC em Configurações');
    return axios.create({
      baseURL: cfg.baseUrl.replace(/\/+$/, '') + '/webservice/v1/',
      timeout: 60000,
      headers: {
        Authorization: 'Basic ' + Buffer.from(cfg.token).toString('base64'),
        'Content-Type': 'application/json',
        ixcsoft: 'listar',
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: !cfg.ignoreSsl }),
    });
  }

  /** Uma página de uma tabela do IXC. */
  async page(table: string, grid: IxcGridParam[], page = 1, rp = PAGE_SIZE, cfg?: IxcSettings): Promise<IxcListResponse<IxcRecord>> {
    cfg = cfg ?? (await this.settings.get('ixc'));
    try {
      const { data } = await this.http(cfg).post<IxcListResponse<IxcRecord>>(table, {
        qtype: `${table}.id`,
        query: '0',
        oper: '>',
        page: String(page),
        rp: String(rp),
        sortname: `${table}.id`,
        sortorder: 'asc',
        grid_param: JSON.stringify(grid),
      });
      if (data?.type === 'error') throw new BadGatewayException(`IXC: ${data.message}`);
      return data;
    } catch (e: any) {
      if (e instanceof BadGatewayException || e instanceof BadRequestException) throw e;
      this.logger.error(`Falha ao consultar ${table}: ${e.message}`);
      throw new BadGatewayException(`Não foi possível consultar o IXC (${table}): ${e.response?.status ?? e.message}`);
    }
  }

  /** Todas as páginas de uma consulta. */
  async all(table: string, grid: IxcGridParam[] = [], cfg?: IxcSettings): Promise<IxcRecord[]> {
    cfg = cfg ?? (await this.settings.get('ixc'));
    const out: IxcRecord[] = [];
    for (let page = 1; ; page++) {
      const res = await this.page(table, grid, page, PAGE_SIZE, cfg);
      const rows = res.registros ?? [];
      out.push(...rows);
      if (rows.length < PAGE_SIZE || out.length >= Number(res.total)) break;
    }
    return out;
  }

  async test(cfg: IxcSettings) {
    const res = await this.page('cliente', [], 1, 1, cfg);
    return { ok: true, totalClientes: Number(res.total) };
  }
}
