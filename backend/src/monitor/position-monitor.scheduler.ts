import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PositionMonitorService } from './position-monitor.service';

@Injectable()
export class PositionMonitorScheduler {
  private readonly logger = new Logger(PositionMonitorScheduler.name);

  constructor(private readonly positionMonitorService: PositionMonitorService) {}

  @Cron('*/5 * * * * *')
  async handleCron(): Promise<void> {
    try {
      await this.positionMonitorService.run();
    } catch (error) {
      this.logger.error(
        `Position monitor tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
