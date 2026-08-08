import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const FILE_HELPER = 'filehelper';

const PAUSE_COMMANDS = new Set([
  '暂停',
  '暂停自动回复',
  '停止',
  '停止自动回复',
  'pause',
  'stop',
]);

const RESUME_COMMANDS = new Set([
  '恢复',
  '恢复自动回复',
  '继续',
  '继续自动回复',
  'resume',
  'start',
  'unpause',
]);

export type FileHelperGateCommand = 'pause' | 'resume';

/**
 * 账号级自动回复开关（落库 + 内存缓存）。
 * 通过「自己 → 文件传输助手」发送暂停/恢复指令控制。
 */
@Injectable()
export class WechatReplyGateService implements OnModuleInit {
  private readonly logger = new Logger(WechatReplyGateService.name);
  /** accountId → paused（与 DB autoReplyPaused 同步） */
  private readonly paused = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const rows = await this.prisma.wechatAccount.findMany({
      where: { autoReplyPaused: true },
      select: { id: true },
    });
    for (const row of rows) {
      this.paused.add(row.id);
    }
    if (rows.length > 0) {
      this.logger.log(`已从数据库恢复 ${rows.length} 个暂停自动回复的账号`);
    }
  }

  isPaused(accountId: string): boolean {
    return this.paused.has(accountId);
  }

  /** 以 DB 为准刷新缓存（监控轮询拿到最新 row 时可用） */
  hydrateFromRow(accountId: string, autoReplyPaused: boolean) {
    if (autoReplyPaused) this.paused.add(accountId);
    else this.paused.delete(accountId);
  }

  async pause(accountId: string): Promise<boolean> {
    const already = this.paused.has(accountId);
    this.paused.add(accountId);
    await this.prisma.wechatAccount.update({
      where: { id: accountId },
      data: { autoReplyPaused: true },
    });
    if (!already) {
      this.logger.log(`自动回复已暂停 account=${accountId}`);
    }
    return !already;
  }

  async resume(accountId: string): Promise<boolean> {
    const was = this.paused.delete(accountId);
    await this.prisma.wechatAccount.update({
      where: { id: accountId },
      data: { autoReplyPaused: false },
    });
    if (was) {
      this.logger.log(`自动回复已恢复 account=${accountId}`);
    }
    return was;
  }

  /**
   * 识别文件传输助手会话中的控制指令。
   * 兼容两种同步形态：自己→filehelper，或 filehelper→自己。
   */
  parseFileHelperCommand(input: {
    accountWxid: string;
    fromWxid: string;
    toWxid: string;
    msgType: number;
    content: string;
  }): FileHelperGateCommand | null {
    if (input.msgType !== 1) return null;

    const from = input.fromWxid.trim();
    const to = input.toWxid.trim();
    const me = input.accountWxid.trim();
    const selfToHelper = from === me && to === FILE_HELPER;
    const helperToSelf = from === FILE_HELPER && (to === me || !to);
    if (!selfToHelper && !helperToSelf) return null;

    const raw = input.content.trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (PAUSE_COMMANDS.has(raw) || PAUSE_COMMANDS.has(lower)) return 'pause';
    if (RESUME_COMMANDS.has(raw) || RESUME_COMMANDS.has(lower)) return 'resume';
    return null;
  }
}

export { FILE_HELPER };
