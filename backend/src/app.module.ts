import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { appEnv } from './config/env';
import { validateEnv } from './config/validation';
import { PrismaModule } from './prisma/prisma.module';
import { LogsModule } from './logs/logs.module';
import { BinanceModule } from './binance/binance.module';
import { MarketRegimeModule } from './market-regime/market-regime.module';
import { StrategiesModule } from './strategies/strategies.module';
import { ScoringModule } from './scoring/scoring.module';
import { RiskModule } from './risk/risk.module';
import { ExecutionModule } from './execution/execution.module';
import { ScannerModule } from './scanner/scanner.module';
import { SignalsModule } from './signals/signals.module';
import { TradesModule } from './trades/trades.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { PositionMonitorModule } from './monitor/position-monitor.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appEnv],
      validate: validateEnv,
      envFilePath: ['.env', '../.env'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    LogsModule,
    BinanceModule,
    MarketRegimeModule,
    StrategiesModule,
    ScoringModule,
    RiskModule,
    ExecutionModule,
    ScannerModule,
    SignalsModule,
    TradesModule,
    DashboardModule,
    AuthModule,
    PositionMonitorModule,
    TelegramModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
