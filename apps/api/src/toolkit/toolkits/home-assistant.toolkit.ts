import { createTool } from '@mastra/core/tools';
import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { toolkitId } from '../toolkit.decorator.js';
import {
  REQUEST_CONTEXT_KEYS,
  type ToolkitDefinition,
} from '../toolkit.types.js';

const TOOLKIT_ID = 'home-assistant-toolkit';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ENTITIES = 200;

/** 用户级配置：实例地址 + 长效访问令牌 */
const settingsSchema = z.object({
  baseUrl: z
    .url('实例地址需为合法 URL')
    .describe('Home Assistant 实例地址，如 http://homeassistant.local:8123'),
  token: z
    .string()
    .min(1, '令牌不能为空')
    .describe('长效访问令牌（Home Assistant 用户资料页创建的 Long-Lived Access Token）'),
});

type HaSettings = z.infer<typeof settingsSchema>;

/** 从 requestContext 取当前用户的 Home Assistant 配置，未配置时抛出可读错误 */
function resolveSettings(requestContext: RequestContext): HaSettings {
  const map = requestContext.get(REQUEST_CONTEXT_KEYS.toolkitSettings) as
    | Record<string, unknown>
    | undefined;
  const result = settingsSchema.safeParse(map?.[TOOLKIT_ID]);
  if (!result.success) {
    throw new Error(
      '尚未配置 Home Assistant：请在「插件工具」页为 Home Assistant 填写实例地址与访问令牌',
    );
  }
  return result.data;
}

async function haRequest(
  settings: HaSettings,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<unknown> {
  const base = settings.baseUrl.replace(/\/$/, '');
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${settings.token}`,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Home Assistant 请求失败: HTTP ${response.status}${
        response.status === 401 ? '（令牌无效或已过期）' : ''
      }`,
    );
  }
  return response.json();
}

interface HaState {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
  last_changed?: string;
}

const listHomeEntities = createTool({
  id: 'list-home-entities',
  description:
    '列出 Home Assistant 中的实体（设备/传感器）及其当前状态。可按 domain（如 light、switch、climate、sensor）或名称关键字过滤。',
  inputSchema: z.object({
    domain: z
      .string()
      .optional()
      .describe('实体域过滤，如 light、switch、climate、sensor，不填返回全部'),
    keyword: z
      .string()
      .optional()
      .describe('按实体 ID 或友好名称模糊过滤的关键字'),
  }),
  execute: async ({ domain, keyword }, { requestContext }) => {
    const settings = resolveSettings(requestContext);
    const states = (await haRequest(settings, '/states')) as HaState[];

    let filtered = domain
      ? states.filter((item) => item.entity_id.startsWith(`${domain}.`))
      : states;
    if (keyword) {
      const query = keyword.toLowerCase();
      filtered = filtered.filter((item) => {
        const name = String(item.attributes?.friendly_name ?? '');
        return (
          item.entity_id.toLowerCase().includes(query) ||
          name.toLowerCase().includes(query)
        );
      });
    }

    return {
      total: filtered.length,
      truncated: filtered.length > MAX_ENTITIES,
      entities: filtered.slice(0, MAX_ENTITIES).map((item) => ({
        entityId: item.entity_id,
        state: item.state,
        name: item.attributes?.friendly_name ?? null,
      })),
    };
  },
});

const getHomeEntityState = createTool({
  id: 'get-home-entity-state',
  description:
    '查询某个实体的详细状态与属性，如 light.living_room 的开关、亮度、色温。',
  inputSchema: z.object({
    entityId: z.string().min(1).describe('实体 ID，如 light.living_room'),
  }),
  execute: async ({ entityId }, { requestContext }) => {
    const settings = resolveSettings(requestContext);
    const state = (await haRequest(
      settings,
      `/states/${encodeURIComponent(entityId)}`,
    )) as HaState;
    return {
      entityId: state.entity_id,
      state: state.state,
      attributes: state.attributes ?? {},
      lastChanged: state.last_changed ?? null,
    };
  },
});

const callHomeService = createTool({
  id: 'call-home-service',
  description:
    '调用 Home Assistant 服务来控制设备。例如开灯：domain=light, service=turn_on, entityId=light.living_room；调温：domain=climate, service=set_temperature, data={"temperature":24}。',
  inputSchema: z.object({
    domain: z
      .string()
      .min(1)
      .describe('服务域，如 light、switch、climate、media_player'),
    service: z
      .string()
      .min(1)
      .describe('服务名，如 turn_on、turn_off、toggle、set_temperature'),
    entityId: z.string().min(1).describe('目标实体 ID，如 light.living_room'),
    data: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('附加服务数据，如 {"brightness_pct":60} 或 {"temperature":24}'),
  }),
  execute: async ({ domain, service, entityId, data }, { requestContext }) => {
    const settings = resolveSettings(requestContext);
    const result = await haRequest(
      settings,
      `/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`,
      'POST',
      { entity_id: entityId, ...(data ?? {}) },
    );
    return { success: true, changedStates: result };
  },
});

/**
 * Home Assistant 工具包：连接用户自建的智能家居中枢，
 * 查询设备状态并调用服务（开关灯、调温度等）。
 *
 * 工具是无状态单例，实例地址与令牌属于用户级配置（UserToolkitSettings），
 * 对话时经 requestContext 注入，未配置的用户调用工具会得到引导性报错。
 */
@toolkitId(TOOLKIT_ID)
export class HomeAssistantToolkit implements ToolkitDefinition {
  readonly name = 'Home Assistant';
  readonly description =
    '连接 Home Assistant 智能家居中枢，查询设备状态并调用服务（如开关灯、调节温控）。需在插件配置中填写实例地址与长效访问令牌。';
  readonly settingsSchema = settingsSchema;
  readonly tools = { listHomeEntities, getHomeEntityState, callHomeService };
}
