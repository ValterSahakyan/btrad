import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { appEnv } from './config/env';
import { validateEnv } from './config/validation';
import { PrismaModule } from './prisma/prisma.module';
import { LogsModule } from './logs/logs.module';
import { BinanceModule } from './binance/binance.module';
import { MarketRegimeModule } from './market-regime/market-regime.module';
import { StrategiesModule } from './strategies/strategies.module';
import { ScoringModule } from './scoring/scoring.module';
import { RiskModule } from './risk/risk.module';
import { PaperTradingModule } from './paper-trading/paper-trading.module';
import { ExecutionModule } from './execution/execution.module';
import { ScannerModule } from './scanner/scanner.module';
import { SignalsModule } from './signals/signals.module';
import { TradesModule } from './trades/trades.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appEnv],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    LogsModule,
    BinanceModule,
    MarketRegimeModule,
    StrategiesModule,
    ScoringModule,
    RiskModule,
    PaperTradingModule,
    ExecutionModule,
    ScannerModule,
    SignalsModule,
    TradesModule,
    DashboardModule,
    AuthModule,
  ],
})
export class AppModule {}
