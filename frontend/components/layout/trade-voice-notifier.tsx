'use client';

import { useEffect, useRef } from 'react';
import { ToastContainer } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { clientApiPath } from '@/lib/client-api';

const API = '/api/backend';
const REFRESH_MS = 10_000;
// Only announce a trade that has been open for at least this many ms (avoids
// announcing positions that immediately fail due to SL rejection)
const ANNOUNCE_DEBOUNCE_MS = 15_000;
const TRACKED_STATUSES = new Set(['live_open']);
const STORAGE_KEY = 'perpscout_seen_open_trade_ids';

type TradeRow = {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  status: string;
  openedAt?: string;
  createdAt: string;
};

export function TradeVoiceNotifier() {
  const initializedRef = useRef(false);
  const seenTradeIdsRef = useRef<Set<string>>(new Set());
  // Stores full trade data for announced-open trades so we can speak the close
  const openTradeDataRef = useRef<Map<string, TradeRow>>(new Map());
  const { toasts, dismiss, success, error } = useToast();

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

    const speak = (message: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    };

    const speakTradeOpened = (trade: TradeRow) => {
      const directionLabel = trade.direction === 'LONG' ? 'long' : 'short';
      const message = `${directionLabel} position opened on ${trade.symbol}`;
      speak(message);
      success(message);
    };

    const speakTradeClosed = (trade: TradeRow) => {
      const directionLabel = trade.direction === 'LONG' ? 'long' : 'short';
      const message = `${directionLabel} position closed on ${trade.symbol}`;
      speak(message);
      error(message);
    };

    const checkTrades = async () => {
      try {
        const response = await fetch(clientApiPath('/trades'), {
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
          // Only announce if the trade has been open long enough to be real
          const openedMs = new Date(trade.openedAt ?? trade.createdAt).getTime();
          if (Date.now() - openedMs < ANNOUNCE_DEBOUNCE_MS) continue;
          speakTradeOpened(trade);
          seenTradeIdsRef.current.add(trade.id);
          openTradeDataRef.current.set(trade.id, trade);
        }

        // Remove IDs that are no longer open so closed trades don't block future
        // entries on the same symbol, but do NOT wholesale replace seenTradeIds
        // with currentOpenIds — that would mark debounced trades as seen before
        // they've been announced.
        for (const seenId of seenTradeIdsRef.current) {
          if (!currentOpenIds.has(seenId)) {
            const closedTrade = openTradeDataRef.current.get(seenId);
            if (closedTrade && !disposed) speakTradeClosed(closedTrade);
            seenTradeIdsRef.current.delete(seenId);
            openTradeDataRef.current.delete(seenId);
          }
        }
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
  }, [success, error]);

  return <ToastContainer toasts={toasts} onDismiss={dismiss} />;
}
