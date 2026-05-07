import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PositionMonitorService } from './position-monitor.service';

@Injectable()
export class PositionMonitorScheduler {
  constructor(private readonly positionMonitorService: PositionMonitorService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {
    await this.positionMonitorService.run();
  }
}
