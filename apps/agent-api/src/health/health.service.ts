import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly redisService: RedisService) {}

  getHealthStatus() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'agent-api',
      version: '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  async getReadinessStatus() {
    const redisOk = await this.checkDependencies();

    return {
      status: redisOk ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      checks: {
        redis: redisOk ? 'connected' : 'disconnected',
      },
    };
  }

  getLivenessStatus() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      memory: process.memoryUsage(),
    };
  }

  private async checkDependencies(): Promise<boolean> {
    try {
      return await this.redisService.isHealthy();
    } catch (e) {
      this.logger.error('Dependency check failed', e);
      return false;
    }
  }
}
