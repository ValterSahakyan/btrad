import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

// Retain limits — tune in settings if needed
const SNAPSHOT_RETAIN_DAYS = 3;
const LOG_RETAIN_DAYS = 14;
const RISK_EVENT_RETAIN_DAYS = 30;

@Injectable()
export class CleanupScheduler {
  private readonly logger = new Logger(CleanupScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup(): Promise<void> {
    try {
      const now = Date.now();

      const snapshotCutoff = new Date(now - SNAPSHOT_RETAIN_DAYS * 86_400_000);
      const logCutoff = new Date(now - LOG_RETAIN_DAYS * 86_400_000);
      const riskCutoff = new Date(now - RISK_EVENT_RETAIN_DAYS * 86_400_000);

      const [snapshots, logs, riskEvents] = await Promise.all([
        this.prisma.marketSnapshot.deleteMany({ where: { createdAt: { lt: snapshotCutoff } } }),
        this.prisma.botLog.deleteMany({ where: { createdAt: { lt: logCutoff } } }),
        this.prisma.riskEvent.deleteMany({ where: { createdAt: { lt: riskCutoff } } }),
      ]);

      this.logger.log(
        `DB cleanup: removed ${snapshots.count} snapshots, ${logs.count} logs, ${riskEvents.count} risk events`,
      );
    } catch (error) {
      this.logger.error(
        `Cleanup scheduler failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
