import { average } from '../common/utils/math';

export const volumeAverage = (volumes: number[], period = 20): number =>
  average(volumes.slice(-period));

export const volumeSpike = (currentVolume: number, avgVolume: number): number =>
  avgVolume === 0 ? 0 : currentVolume / avgVolume;
