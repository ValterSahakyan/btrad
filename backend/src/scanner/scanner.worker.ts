import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { LogsService } from '../logs/logs.service';
import { ScannerService } from './scanner.service';

@Injectable()
export class ScannerWorker implements OnModuleInit {
  constructor(
    private readonly configService: ConfigService,
    private readonly scannerService: ScannerService,
    private readonly logsService: LogsService,
  ) {}

  onModuleInit(): void {
    const connection = new Redis(this.configService.get<string>('redisUrl', 'redis://localhost:6379'), {
      maxRetriesPerRequest: null,
    });

    const worker = new Worker(
      'scanner',
      async () => this.scannerService.runScan(),
      { connection },
    );

    worker.on('failed', async (_job, error) => {
      await this.logsService.error('scanner-worker', 'Scanner job failed', { error: error.message });
    });

    worker.on('error', (error) => {
      this.logsService
        .error('scanner-worker', 'Scanner worker error', { error: error.message })
        .catch(() => {});
    });
  }
}
