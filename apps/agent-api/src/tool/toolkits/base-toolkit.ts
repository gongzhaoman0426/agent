import { Logger } from '@nestjs/common';
import { LlamaindexService } from 'src/llamaindex/llamaindex.service';
import { Settings } from '../interface/settings';
import { Toolkit, ToolsType } from '../interface/toolkit';
import { TOOLKIT_ID_KEY } from '../toolkits.decorator';

export abstract class BaseToolkit implements Toolkit {
  abstract name: string;
  abstract description: string;
  abstract settings: Settings;
  abstract tools: ToolsType[];
  abstract validateSettings(): void;

  // agentId / userId 独立存储，不再混在 settings 中
  protected agentId: string = '';
  protected userId: string = '';
  protected sessionId: string = '';
  protected readonly logger = new Logger(this.constructor.name);

  protected llamaindexService = new LlamaindexService()
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  constructor() {
    // 立即开始初始化，但不阻塞构造函数
    this.initPromise = this.safeInitTools();
  }

  // 子类可以重写这个方法来进行异步初始化
  protected async initTools(): Promise<void> {
    // 默认什么都不做，子类可以重写
  }

  private async safeInitTools(): Promise<void> {
    try {
      await this.initTools();
      this.isInitialized = true;
    } catch (error) {
      console.error(`Failed to initialize tools for ${this.constructor.name}:`, error);
      throw error;
    }
  }

  setAgentContext(agentId: string, userId?: string, sessionId?: string): void {
    this.agentId = agentId;
    if (userId) this.userId = userId;
    if (sessionId) this.sessionId = sessionId;
  }

  applySettings(settings: Settings): void {
    for (const key in settings) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        if (key in this.settings) {
          this.settings[key] = settings[key];
        } else {
          throw new Error(`Invalid setting: ${key}`);
        }
      }
    }
    // 不在这里验证，延迟到 getTools() 时验证
    // 这样即使配置不完整，也不会阻止其他 toolkit 的加载
  }

  /**
   * 获取工具列表（会校验 settings，校验失败返回空数组）
   * 用于实际执行场景
   */
  async getTools(): Promise<ToolsType[]> {
    // 确保初始化完成
    if (!this.isInitialized && this.initPromise) {
      await this.initPromise;
    }

    // 验证配置，如果验证失败则返回空数组（不提供工具）
    try {
      this.validateSettings();
    } catch (error) {
      this.logger.warn(`Toolkit "${this.name}" validation failed: ${error.message}. Skipping tools for this toolkit.`);
      return [];
    }

    return this.tools;
  }

  /**
   * 获取工具列表（跳过 settings 校验）
   * 用于启动时同步工具元数据到数据库，此时 settings 尚未注入
   */
  async getRawTools(): Promise<ToolsType[]> {
    if (!this.isInitialized && this.initPromise) {
      await this.initPromise;
    }
    return this.tools;
  }

  get id(): string {
    return Reflect.getMetadata(TOOLKIT_ID_KEY, this.constructor);
  }
}
