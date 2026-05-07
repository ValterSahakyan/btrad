import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ScannerService } from './scanner.service';

@Injectable()
export class ScannerScheduler {
  constructor(
    private readonly scannerService: ScannerService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {
    const settings = await this.prisma.botSettings.findFirst();
    if (settings?.isPaused) {
      return;
    }
    await this.scannerService.runScan();
  }
}
