import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CleanupSignalsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  olderThanDays?: number;
}
