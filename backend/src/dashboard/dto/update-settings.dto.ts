import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['testnet', 'live'])
  mode?: 'testnet' | 'live';

  @IsOptional()
  @IsBoolean()
  isPaused?: boolean;

  @IsOptional()
  @IsBoolean()
  realTradingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  enableRealTrading?: boolean;

  @IsOptional()
  @IsBoolean()
  requireDashboardConfirmation?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAutoLiveExecution?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(125)
  defaultLeverage?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(125)
  maxLeverage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  riskPerTradePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  maxDailyLossPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxOpenTrades?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxConsecutiveLosses?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minConfidenceScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(20)
  minRiskReward?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(3600)
  scannerIntervalSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  signalExpirationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxSymbolsPerScan?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minHotScoreForScan?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1_000_000)
  minPositionUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1_000_000)
  maxPositionUsd?: number;

  @IsOptional()
  @IsBoolean()
  breakoutEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(20)
  breakoutMinVolumeRatio?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(200)
  breakoutLookbackPeriod?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(30)
  breakoutMaxSlPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(20)
  breakoutTp1Multiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(30)
  breakoutTp2Multiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  breakoutMinHotScore?: number;

  @IsOptional()
  @IsBoolean()
  pullbackEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pullbackRsiLongMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pullbackRsiLongMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pullbackRsiShortMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pullbackRsiShortMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10)
  pullbackAtrMultiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(30)
  pullbackMaxSlPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  pullbackMinHotScore?: number;

  @IsOptional()
  @IsBoolean()
  reversionEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  reversionRsiOverbought?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  reversionRsiOversold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(25)
  reversionVwapDeviationPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.05)
  @Max(5)
  reversionVolumeDeclineRatio?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(30)
  reversionMaxSlPercent?: number;
}
