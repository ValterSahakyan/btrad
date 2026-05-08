'use client';

import { useEffect, useRef } from 'react';
import { ToastContainer } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3333/api';
const REFRESH_MS = 10_000;
const TRACKED_STATUSES = new Set(['live_open', 'paper_open']);
const STORAGE_KEY = 'perpscout_seen_open_trade_ids';

type TradeRow = {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  status: string;
};

export function TradeVoiceNotifier() {
  const initializedRef = useRef(false);
  const seenTradeIdsRef = useRef<Set<string>>(new Set());
  const { toasts, dismiss, success } = useToast();

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const ids = JSON.parse(raw) as string[];
      seenTradeIdsRef.current = new Set(ids);
    } catch {
      seenTradeIdsRef.current = new Set();
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    const persistSeenIds = () => {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...seenTradeIdsRef.current]));
    };

    const speakTradeOpened = (trade: TradeRow) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

      const modeLabel = trade.status === 'paper_open' ? 'paper ' : '';
      const directionLabel = trade.direction === 'LONG' ? 'long' : 'short';
      const message = `${modeLabel}${directionLabel} position opened on ${trade.symbol}`;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
      success(message);
    };

    const checkTrades = async () => {
      try {
        const response = await fetch(`${API}/trades`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!response.ok) return;

        const trades = (await response.json()) as TradeRow[];
        const openTrades = trades.filter((trade) => TRACKED_STATUSES.has(trade.status));
        const currentOpenIds = new Set(openTrades.map((trade) => trade.id));

        if (!initializedRef.current) {
          seenTradeIdsRef.current = currentOpenIds;
          initializedRef.current = true;
          persistSeenIds();
          return;
        }

        for (const trade of openTrades) {
          if (seenTradeIdsRef.current.has(trade.id)) continue;
          if (disposed) return;
          speakTradeOpened(trade);
          seenTradeIdsRef.current.add(trade.id);
        }

        seenTradeIdsRef.current = currentOpenIds;
        persistSeenIds();
      } catch {
        // Voice alerts are non-critical; ignore polling errors.
      }
    };

    void checkTrades();
    const intervalId = window.setInterval(checkTrades, REFRESH_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [success]);

  return <ToastContainer toasts={toasts} onDismiss={dismiss} />;
}
