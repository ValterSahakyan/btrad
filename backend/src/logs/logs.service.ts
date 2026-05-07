import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async info(source: string, message: string, metadataJson: object = {}): Promise<void> {
    await this.prisma.botLog.create({ data: { level: 'info', source, message, metadataJson: metadataJson as Prisma.InputJsonValue } });
  }

  async error(source: string, message: string, metadataJson: object = {}): Promise<void> {
    await this.prisma.botLog.create({ data: { level: 'error', source, message, metadataJson: metadataJson as Prisma.InputJsonValue } });
  }

  async warn(source: string, message: string, metadataJson: object = {}): Promise<void> {
    await this.prisma.botLog.create({ data: { level: 'warn', source, message, metadataJson: metadataJson as Prisma.InputJsonValue } });
  }

  async risk(type: string, message: string, severity: string, metadataJson: object = {}): Promise<void> {
    await this.prisma.riskEvent.create({ data: { type, message, severity, metadataJson: metadataJson as Prisma.InputJsonValue } });
  }

  async listLogs(limit = 100): Promise<unknown[]> {
    return this.prisma.botLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }

  async listRiskEvents(limit = 100): Promise<unknown[]> {
    return this.prisma.riskEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
