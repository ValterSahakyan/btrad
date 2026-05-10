import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ScannerService } from './scanner.service';

@Injectable()
export class ScannerScheduler {
  private readonly logger = new Logger(ScannerScheduler.name);
  private lastRunAt = 0;

  constructor(
    private readonly scannerService: ScannerService,
    private readonly prisma: PrismaService,
  ) {}

  // Ticks every 10s to allow sub-minute intervals; respects scannerIntervalSeconds setting.
  @Cron('*/10 * * * * *')
  async handleCron(): Promise<void> {
    try {
      const settings = await this.prisma.botSettings.findFirst();
      if (settings?.isPaused) return;
      const intervalMs = (settings?.scannerIntervalSeconds ?? 60) * 1000;
      if (Date.now() - this.lastRunAt < intervalMs) return;

      this.lastRunAt = Date.now();
      await this.scannerService.runScan();
    } catch (error) {
      this.logger.error(
        `Scanner scheduler tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
