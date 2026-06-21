import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    const database = await this.checkDatabase();

    const checks = {
      application: 'ready',
      database: database.ok ? 'ready' : 'down',
    };

    // 依赖未就绪时返回 503，便于 K8s/负载均衡器据此摘除实例
    if (!database.ok) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks,
        error: database.error,
      });
    }

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkDatabase(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (error: any) {
      const message = error?.message || String(error);
      this.logger.error(`Readiness check failed: database unreachable: ${message}`);
      return { ok: false, error: message };
    }
  }

  getLivenessStatus() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      memory: process.memoryUsage(),
    };
  }

}
