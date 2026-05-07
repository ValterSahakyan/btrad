import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface TelegramSignalPayload {
  symbol: string;
  strategy: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  leverage: number;
  confidenceScore: number;
  hotScore: number;
  reasons: string[];
}

const STRATEGY_LABELS: Record<string, string> = {
  breakout_volume: 'Breakout + Volume',
  pullback_continuation: 'Trend Pullback',
  mean_reversion: 'Mean Reversion',
};

@Injectable()
export class TelegramService {
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.botToken = this.configService.get<string>('telegramBotToken', '');
    this.chatId = this.configService.get<string>('telegramChatId', '');
    this.enabled = !!(this.botToken && this.chatId);
  }

  async sendSignal(payload: TelegramSignalPayload): Promise<void> {
    if (!this.enabled) return;

    const dir = payload.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
    const label = STRATEGY_LABELS[payload.strategy] ?? payload.strategy;
    const p = (n: number, d = 4) => n.toFixed(d);

    const text = [
      `🔥 <b>HOT FUTURES SETUP</b>`,
      ``,
      `<b>Coin:</b> ${payload.symbol}`,
      `<b>Pattern:</b> ${label}`,
      `<b>Direction:</b> ${dir}`,
      ``,
      `<b>Entry:</b> $${p(payload.entryPrice)}`,
      `<b>Stop Loss:</b> $${p(payload.stopLoss)}`,
      `<b>Take Profit 1:</b> $${p(payload.takeProfit1)} (1.5R)`,
      `<b>Take Profit 2:</b> $${p(payload.takeProfit2)} (2.5R)`,
      ``,
      `<b>Risk/Reward:</b> ${p(payload.riskReward, 2)}x`,
      `<b>Leverage:</b> ${payload.leverage}x`,
      `<b>Confidence:</b> ${Math.round(payload.confidenceScore)}`,
      `<b>Hot Score:</b> ${Math.round(payload.hotScore)}`,
      ``,
      `<b>Reasons:</b>`,
      ...payload.reasons.map((r) => `• ${r}`),
      ``,
      `⚠️ Waiting for dashboard confirmation`,
    ].join('\n');

    await axios
      .post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id: this.chatId,
        text,
        parse_mode: 'HTML',
      })
      .catch(() => {
        // Non-critical — never let Telegram failure block signal creation
      });
  }

  async sendTradeExecuted(payload: TelegramSignalPayload & { mode: string }): Promise<void> {
    if (!this.enabled) return;

    const dir = payload.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
    const label = STRATEGY_LABELS[payload.strategy] ?? payload.strategy;
    const modeLabel = payload.mode === 'live' ? '💰 LIVE ORDER PLACED' : '📋 PAPER TRADE OPENED';
    const p = (n: number, d = 4) => n.toFixed(d);

    const text = [
      `⚡ <b>${modeLabel}</b>`,
      ``,
      `<b>Coin:</b> ${payload.symbol}`,
      `<b>Pattern:</b> ${label}`,
      `<b>Direction:</b> ${dir}`,
      ``,
      `<b>Entry:</b> $${p(payload.entryPrice)}`,
      `<b>Stop Loss:</b> $${p(payload.stopLoss)}`,
      `<b>Take Profit 1:</b> $${p(payload.takeProfit1)} (1.5R)`,
      `<b>Take Profit 2:</b> $${p(payload.takeProfit2)} (2.5R)`,
      ``,
      `<b>Risk/Reward:</b> ${p(payload.riskReward, 2)}x`,
      `<b>Leverage:</b> ${payload.leverage}x`,
      `<b>Confidence:</b> ${Math.round(payload.confidenceScore)}`,
      `<b>Hot Score:</b> ${Math.round(payload.hotScore)}`,
    ].join('\n');

    await axios
      .post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id: this.chatId,
        text,
        parse_mode: 'HTML',
      })
      .catch(() => {});
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.enabled) return;
    await axios
      .post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id: this.chatId,
        text,
        parse_mode: 'HTML',
      })
      .catch(() => {});
  }
}
