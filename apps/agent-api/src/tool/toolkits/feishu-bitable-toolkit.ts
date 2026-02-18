import { FunctionTool } from 'llamaindex';

import { toolkitId } from '../toolkits.decorator';
import { BaseToolkit } from './base-toolkit';
import { ToolsType } from '../interface/toolkit';

@toolkitId('feishu-bitable-toolkit-01')
export class FeishuBitableToolkit extends BaseToolkit {
  name = '飞书多维表格';
  description = '飞书多维表格工具包，支持对多维表格进行增删改查操作';
  settings = {
    appId: '',
    appSecret: '',
    appToken: '',
    tableId: '',
  };

  tools: ToolsType[] = [];
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor() {
    super();
  }

  validateSettings(): void {
    const { appId, appSecret, appToken, tableId } = this.settings;
    if (!appId || !appSecret || !appToken || !tableId) {
      throw new Error(
        'Missing required settings: appId, appSecret, appToken, tableId are all required',
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    const res = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          app_id: this.settings.appId,
          app_secret: this.settings.appSecret,
        }),
      },
    );

    const data = (await res.json()) as {
      code: number;
      msg: string;
      tenant_access_token?: string;
      expire?: number;
    };

    if (data.code !== 0 || !data.tenant_access_token) {
      throw new Error(`Failed to get access token: ${data.msg}`);
    }

    this.cachedToken = data.tenant_access_token;
    // Expire 5 minutes early to be safe
    this.tokenExpiresAt = now + (data.expire! - 300) * 1000;
    return this.cachedToken;
  }

  private async request(
    path: string,
    method: string,
    body?: Record<string, any>,
    queryParams?: Record<string, string | number | boolean>,
  ): Promise<any> {
    const token = await this.getAccessToken();
    let url = `https://open.feishu.cn/open-apis/bitable/v1${path}`;

    if (queryParams) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    return res.json();
  }

  private getTablePath(tableId?: string): string {
    const tid = tableId || this.settings.tableId;
    return `/apps/${this.settings.appToken}/tables/${tid}`;
  }

  async getTools(): Promise<ToolsType[]> {
    if (this.tools.length > 0) {
      return this.tools;
    }

    this.tools = [
      this.buildListTablesTool(),
      this.buildListFieldsTool(),
      this.buildCreateFieldTool(),
      this.buildUpdateFieldTool(),
      this.buildDeleteFieldTool(),
      this.buildSearchRecordsTool(),
      this.buildCreateRecordTool(),
      this.buildUpdateRecordTool(),
      this.buildDeleteRecordTool(),
    ];

    return this.tools;
  }

  private buildListTablesTool(): ToolsType {
    return FunctionTool.from(
      async (params: { page_size?: number; page_token?: string }) => {
        try {
          const query: Record<string, string | number | boolean> = {};
          if (params.page_size) query.page_size = params.page_size;
          if (params.page_token) query.page_token = params.page_token;

          const result = await this.request(
            `/apps/${this.settings.appToken}/tables`,
            'GET',
            undefined,
            query,
          );
          return JSON.stringify(result, null, 2);
        } catch (error: any) {
          this.logger.error(
            `[Tool:listTables] Error: ${error.message}`,
            error.stack,
          );
          return JSON.stringify({ error: error.message });
        }
      },
      {
        name: 'listTables',
        description:
          '列出飞书多维表格应用中的所有数据表，返回表名和表ID。当需要了解有哪些数据表或需要操作非默认表时使用。',
        parameters: {
          type: 'object',
          properties: {
            page_size: {
              type: 'number',
              description: '每页返回的表数量，默认 20，最大 100',
            },
            page_token: {
              type: 'string',
              description: '分页标记，用于获取下一页数据',
            },
          },
          required: [],
        },
      } as any,
    );
  }

  private buildListFieldsTool(): ToolsType {
    return FunctionTool.from(
      async (params: {
        table_id?: string;
        page_size?: number;
        page_token?: string;
      }) => {
        try {
          const query: Record<string, string | number | boolean> = {};
          if (params.page_size) query.page_size = params.page_size;
          if (params.page_token) query.page_token = params.page_token;

          const result = await this.request(
            `${this.getTablePath(params.table_id)}/fields`,
            'GET',
            undefined,
            query,
          );
          return JSON.stringify(result, null, 2);
        } catch (error: any) {
          this.logger.error(
            `[Tool:listFields] Error: ${error.message}`,
            error.stack,
          );
          return JSON.stringify({ error: error.message });
        }
      },
      {
        name: 'listFields',
        description:
          '获取飞书多维表格中指定数据表的所有字段信息，包括字段名称、类型和配置。在创建或更新记录前，应先调用此工具了解表结构。',
        parameters: {
          type: 'object',
          properties: {
            table_id: {
              type: 'string',
              description:
                '数据表ID。如果不提供，则使用默认配置的数据表',
            },
            page_size: {
              type: 'number',
              description: '每页返回的字段数量，默认 20，最大 100',
            },
            page_token: {
              type: 'string',
              description: '分页标记，用于获取下一页数据',
            },
          },
          required: [],
        },
      } as any,
    );
  }

  private buildCreateFieldTool(): ToolsType {
    return FunctionTool.from(
      async (params: {
        table_id?: string;
        field_name: string;
        type: number;
        property?: Record<string, any>;
      }) => {
        try {
          const body: Record<string, any> = {
            field_name: params.field_name,
            type: params.type,
          };
          if (params.property) body.property = params.property;

          const result = await this.request(
            `${this.getTablePath(params.table_id)}/fields`,
            'POST',
            body,
          );
          return JSON.stringify(result, null, 2);
        } catch (error: any) {
          this.logger.error(
            `[Tool:createField] Error: ${error.message}`,
            error.stack,
          );
          return JSON.stringify({ error: error.message });
        }
      },
      {
        name: 'createField',
        description:
          '在飞书多维表格中新增一个字段（列）。常用字段类型：1=文本, 2=数字, 3=单选, 4=多选, 5=日期, 7=复选框, 11=人员, 13=电话, 15=超链接, 17=附件, 22=地理位置',
        parameters: {
          type: 'object',
          properties: {
            table_id: {
              type: 'string',
              description:
                '数据表ID。如果不提供，则使用默认配置的数据表',
            },
            field_name: {
              type: 'string',
              description: '新字段的名称',
            },
            type: {
              type: 'number',
              description:
                '字段类型编号：1=文本, 2=数字, 3=单选, 4=多选, 5=日期, 7=复选框, 11=人员, 13=电话, 15=超链接, 17=附件, 22=地理位置',
            },
            property: {
              type: 'object',
              description:
                '字段的额外配置（可选）。例如单选/多选字段可传 { "options": [{ "name": "选项1" }, { "name": "选项2" }] }',
            },
          },
          required: ['field_name', 'type'],
        },
      } as any,
    );
  }

  private buildUpdateFieldTool(): ToolsType {
    return FunctionTool.from(
      async (params: {
        table_id?: string;
        field_id: string;
        field_name?: string;
        type?: number;
        property?: Record<string, any>;
      }) => {
        try {
          const body: Record<string, any> = {};
          if (params.field_name) body.field_name = params.field_name;
          if (params.type !== undefined) body.type = params.type;
          if (params.property) body.property = params.property;

          const result = await this.request(
            `${this.getTablePath(params.table_id)}/fields/${params.field_id}`,
            'PUT',
            body,
          );
          return JSON.stringify(result, null, 2);
        } catch (error: any) {
          this.logger.error(
            `[Tool:updateField] Error: ${error.message}`,
            error.stack,
          );
          return JSON.stringify({ error: error.message });
        }
      },
      {
        name: 'updateField',
        description:
          '修改飞书多维表格中的字段（列）属性，如重命名或修改配置。field_id 可通过 listFields 获取。',
        parameters: {
          type: 'object',
          properties: {
            table_id: {
              type: 'string',
              description:
                '数据表ID。如果不提供，则使用默认配置的数据表',
            },
            field_id: {
              type: 'string',
              description:
                '要修改的字段ID，通过 listFields 获取',
            },
            field_name: {
              type: 'string',
              description: '新的字段名称',
            },
            type: {
              type: 'number',
              description:
                '字段类型编号：1=文本, 2=数字, 3=单选, 4=多选, 5=日期, 7=复选框, 11=人员, 13=电话, 15=超链接, 17=附件, 22=地理位置',
            },
            property: {
              type: 'object',
              description:
                '字段的额外配置（可选）。例如单选/多选字段可传 { "options": [{ "name": "选项1" }] }',
            },
          },
          required: ['field_id'],
        },
      } as any,
    );
  }

  private buildDeleteFieldTool(): ToolsType {
    return FunctionTool.from(
      async (params: { table_id?: string; field_id: string }) => {
        try {
          const result = await this.request(
            `${this.getTablePath(params.table_id)}/fields/${params.field_id}`,
            'DELETE',
          );
          return JSON.stringify(result, null, 2);
        } catch (error: any) {
          this.logger.error(
            `[Tool:deleteField] Error: ${error.message}`,
            error.stack,
          );
          return JSON.stringify({ error: error.message });
        }
      },
      {
        name: 'deleteField',
        description:
          '删除飞书多维表格中的一个字段（列）。此操作不可撤销，字段下的所有数据将被删除。field_id 可通过 listFields 获取。',
        parameters: {
          type: 'object',
          properties: {
            table_id: {
              type: 'string',
              description:
                '数据表ID。如果不提供，则使用默认配置的数据表',
            },
            field_id: {
              type: 'string',
              description:
                '要删除的字段ID，通过 listFields 获取',
            },
          },
          required: ['field_id'],
        },
      } as any,
    );
  }

  private buildSearchRecordsTool(): ToolsType {
    return FunctionTool.from(
      async (params: {
        table_id?: string;
        filter?: {
          conjunction: 'and' | 'or';
          conditions: Array<{
            field_name: string;
            operator: string;
            value?: string[];
          }>;
        };
        sort?: Array<{ field_name: string; desc?: boolean }>;
        field_names?: string[];
        automatic_fields?: boolean;
        page_size?: number;
        page_token?: string;
      }) => {
        try {
          const body: Record<string, any> = {};
          if (params.filter) body.filter = params.filter;
          if (params.sort) body.sort = params.sort;
          if (params.field_names) body.field_names = params.field_names;
          if (params.automatic_fields !== undefined)
            body.automatic_fields = params.automatic_fields;
          if (params.page_size) body.page_size = params.page_size;
          if (params.page_token) body.page_token = params.page_token;

          const result = await this.request(
            `${this.getTablePath(params.table_id)}/records/search`,
            'POST',
            body,
          );
          return JSON.stringify(result, null, 2);
        } catch (error: any) {
          this.logger.error(
            `[Tool:searchRecords] Error: ${error.message}`,
            error.stack,
          );
          return JSON.stringify({ error: error.message });
        }
      },
      {
        name: 'searchRecords',
        description:
          '查询飞书多维表格中的记录，支持结构化筛选条件、排序、字段选择和分页。筛选条件使用 filter 对象，包含 conjunction（and/or）和 conditions 数组。',
        parameters: {
          type: 'object',
          properties: {
            table_id: {
              type: 'string',
              description:
                '数据表ID。如果不提供，则使用默认配置的数据表',
            },
            filter: {
              type: 'object',
              description: '结构化筛选条件',
              properties: {
                conjunction: {
                  type: 'string',
                  enum: ['and', 'or'],
                  description:
                    '条件之间的逻辑关系：and 表示所有条件都满足，or 表示满足任一条件',
                },
                conditions: {
                  type: 'array',
                  description: '筛选条件数组',
                  items: {
                    type: 'object',
                    properties: {
                      field_name: {
                        type: 'string',
                        description: '字段名称',
                      },
                      operator: {
                        type: 'string',
                        enum: [
                          'is',
                          'isNot',
                          'contains',
                          'doesNotContain',
                          'isEmpty',
                          'isNotEmpty',
                          'isGreater',
                          'isGreaterEqual',
                          'isLess',
                          'isLessEqual',
                        ],
                        description: '比较运算符',
                      },
                      value: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                          '比较值数组。isEmpty 和 isNotEmpty 运算符传空数组 []',
                      },
                    },
                    required: ['field_name', 'operator'],
                  },
                },
              },
              required: ['conjunction', 'conditions'],
            },
            sort: {
              type: 'array',
              description: '排序条件数组',
              items: {
                type: 'object',
                properties: {
                  field_name: {
                    type: 'string',
                    description: '排序字段名称',
                  },
                  desc: {
                    type: 'boolean',
                    description: '是否降序排列，默认 false（升序）',
                  },
                },
                required: ['field_name'],
              },
            },
            field_names: {
              type: 'array',
              items: { type: 'string' },
              description:
                '指定返回的字段名称列表，不提供则返回所有字段',
            },
            automatic_fields: {
              type: 'boolean',
              description:
                '是否返回自动字段（创建人、创建时间、修改人、修改时间），默认 false',
            },
            page_size: {
              type: 'number',
              description: '每页记录数，默认 20，最大 500',
            },
            page_token: {
              type: 'string',
              description: '分页标记，用于获取下一页数据',
            },
          },
          required: [],
        },
      } as any,
    );
  }

  private buildCreateRecordTool(): ToolsType {
    return FunctionTool.from(
      async (params: {
        table_id?: string;
        fields: Record<string, any>;
      }) => {
        try {
          const result = await this.request(
            `${this.getTablePath(params.table_id)}/records`,
            'POST',
            { fields: params.fields },
          );
          return JSON.stringify(result, null, 2);
        } catch (error: any) {
          this.logger.error(
            `[Tool:createRecord] Error: ${error.message}`,
            error.stack,
          );
          return JSON.stringify({ error: error.message });
        }
      },
      {
        name: 'createRecord',
        description:
          '在飞书多维表格中新增一条记录。请先调用 listFields 了解表结构，确保字段名和值类型正确。',
        parameters: {
          type: 'object',
          properties: {
            table_id: {
              type: 'string',
              description:
                '数据表ID。如果不提供，则使用默认配置的数据表',
            },
            fields: {
              type: 'object',
              description:
                '记录的字段值，key 为字段名，value 为字段值。请先调用 listFields 了解可用字段及其类型',
            },
          },
          required: ['fields'],
        },
      } as any,
    );
  }

  private buildUpdateRecordTool(): ToolsType {
    return FunctionTool.from(
      async (params: {
        table_id?: string;
        record_id: string;
        fields: Record<string, any>;
      }) => {
        try {
          const result = await this.request(
            `${this.getTablePath(params.table_id)}/records/${params.record_id}`,
            'PUT',
            { fields: params.fields },
          );
          return JSON.stringify(result, null, 2);
        } catch (error: any) {
          this.logger.error(
            `[Tool:updateRecord] Error: ${error.message}`,
            error.stack,
          );
          return JSON.stringify({ error: error.message });
        }
      },
      {
        name: 'updateRecord',
        description:
          '更新飞书多维表格中的一条记录。record_id 可通过 searchRecords 获取。只需提供要修改的字段。',
        parameters: {
          type: 'object',
          properties: {
            table_id: {
              type: 'string',
              description:
                '数据表ID。如果不提供，则使用默认配置的数据表',
            },
            record_id: {
              type: 'string',
              description:
                '要更新的记录ID，通常从 searchRecords 的结果中获取',
            },
            fields: {
              type: 'object',
              description:
                '要更新的字段值，key 为字段名，value 为新的字段值。只需包含要修改的字段',
            },
          },
          required: ['record_id', 'fields'],
        },
      } as any,
    );
  }

  private buildDeleteRecordTool(): ToolsType {
    return FunctionTool.from(
      async (params: { table_id?: string; record_id: string }) => {
        try {
          const result = await this.request(
            `${this.getTablePath(params.table_id)}/records/${params.record_id}`,
            'DELETE',
          );
          return JSON.stringify(result, null, 2);
        } catch (error: any) {
          this.logger.error(
            `[Tool:deleteRecord] Error: ${error.message}`,
            error.stack,
          );
          return JSON.stringify({ error: error.message });
        }
      },
      {
        name: 'deleteRecord',
        description:
          '删除飞书多维表格中的一条记录。此操作不可撤销，请谨慎使用。record_id 可通过 searchRecords 获取。',
        parameters: {
          type: 'object',
          properties: {
            table_id: {
              type: 'string',
              description:
                '数据表ID。如果不提供，则使用默认配置的数据表',
            },
            record_id: {
              type: 'string',
              description:
                '要删除的记录ID，通常从 searchRecords 的结果中获取',
            },
          },
          required: ['record_id'],
        },
      } as any,
    );
  }
}
