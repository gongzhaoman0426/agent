import { BaseSkill } from '../base-skill';
import { skillId } from '../skill.decorator';
import type { SkillReference, SkillScript } from '../skill.type';

@skillId('time-query')
export class TimeQuerySkill extends BaseSkill {
  readonly name = '时间查询';
  readonly description = '查询常用时区的当前时间，并按用户需要解释时区换算';
  readonly content = `
你是一个时间查询助手。用户询问当前时间、某个城市/时区时间、或跨时区换算时，优先使用本技能。

使用要求：
- 如用户没有指定时区，默认使用 Asia/Shanghai。
- 如用户指定城市，先映射到最接近的 IANA 时区。
- 需要精确当前时间时，调用 useSkill 并设置 runScripts=true。
- scriptInput 可以传入纯文本时区名，例如 Asia/Shanghai；也可以传入 JSON，例如 {"timezone":"UTC"}。
- 如果脚本返回 unsupported_timezone，说明当前脚本不支持该时区，并提示用户可用时区。
`.trim();

  readonly references: SkillReference[] = [
    {
      type: 'text',
      label: '常用时区映射',
      uri: [
        'Asia/Shanghai: 中国大陆、新加坡、马来西亚常用时间，UTC+8。',
        'UTC: 协调世界时。',
        'America/New_York: 美国东部时间，脚本按 UTC-5 计算。',
        'America/Los_Angeles: 美国太平洋时间，脚本按 UTC-8 计算。',
        'Europe/London: 英国时间，脚本按 UTC+0 计算。',
        'Asia/Tokyo: 日本时间，UTC+9。',
      ].join('\n'),
    },
  ];

  readonly scripts: SkillScript[] = [
    {
      name: 'get-current-time',
      language: 'javascript',
      timeout: 1000,
      code: `
const aliases = {
  shanghai: 'Asia/Shanghai',
  beijing: 'Asia/Shanghai',
  china: 'Asia/Shanghai',
  cn: 'Asia/Shanghai',
  utc: 'UTC',
  london: 'Europe/London',
  newyork: 'America/New_York',
  'new york': 'America/New_York',
  losangeles: 'America/Los_Angeles',
  'los angeles': 'America/Los_Angeles',
  tokyo: 'Asia/Tokyo',
  japan: 'Asia/Tokyo'
};

const offsets = {
  'Asia/Shanghai': 8,
  UTC: 0,
  'Europe/London': 0,
  'America/New_York': -5,
  'America/Los_Angeles': -8,
  'Asia/Tokyo': 9
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function normalizeTimezone(rawInput) {
  let raw = String(rawInput || '').trim();
  if (!raw) return 'Asia/Shanghai';

  try {
    const parsed = JSON.parse(raw);
    raw = String(parsed.timezone || parsed.tz || parsed.city || raw).trim();
  } catch (_) {}

  const compact = raw.toLowerCase().replace(/[_-]/g, ' ').replace(/\\s+/g, ' ').trim();
  const aliasKey = compact.replace(/\\s+/g, '');
  return aliases[compact] || aliases[aliasKey] || raw;
}

function formatWithOffset(date, timezone, offsetHours) {
  const shifted = new Date(date.getTime() + offsetHours * 60 * 60 * 1000);
  return [
    shifted.getUTCFullYear(),
    '-',
    pad(shifted.getUTCMonth() + 1),
    '-',
    pad(shifted.getUTCDate()),
    ' ',
    pad(shifted.getUTCHours()),
    ':',
    pad(shifted.getUTCMinutes()),
    ':',
    pad(shifted.getUTCSeconds())
  ].join('') + ' ' + timezone;
}

const timezone = normalizeTimezone(input);
const offset = offsets[timezone];
const now = new Date();

if (offset === undefined) {
  result = {
    status: 'unsupported_timezone',
    requested: timezone,
    supportedTimezones: Object.keys(offsets)
  };
} else {
  result = {
    status: 'ok',
    timezone,
    currentTime: formatWithOffset(now, timezone, offset),
    utcTime: formatWithOffset(now, 'UTC', 0),
    offset: 'UTC' + (offset >= 0 ? '+' : '') + offset
  };
}
`.trim(),
    },
  ];
}
