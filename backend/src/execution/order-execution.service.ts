import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BinanceService } from '../binance/binance.service';
import { LogsService } from '../logs/logs.service';

@Injectable()
export class OrderExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly binanceService: BinanceService,
    private readonly logsService: LogsService,
  ) {}

  async approveLive(signalId: string): Promise<never> {
    const signal = await this.prisma.signal.findUnique({ where: { id: signalId } });
    if (!signal) {
      throw new BadRequestException('Signal not found');
    }

    await this.logsService.risk(
      'live_execution_blocked',
      'Live execution path is intentionally disabled in MVP without explicit environment enablement',
      'critical',
      { signalId },
    );

    throw new BadRequestException('Live execution remains safety-disabled in the MVP');
  }

  async prepareLiveOrder(symbol: string, leverage: number): Promise<unknown> {
    return this.binanceService.setLeverage(symbol, leverage);
  }
}
