'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

type Step = 'idle' | 'connecting' | 'signing' | 'verifying' | 'done';

const STEP_LABEL: Record<Step, string> = {
  idle: 'Connect Wallet',
  connecting: 'Connecting…',
  signing: 'Sign the message in MetaMask…',
  verifying: 'Verifying…',
  done: 'Redirecting…',
};

export default function LoginPage() {
  const [step, setStep] = useState<Step>('idle');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

  async function handleConnect() {
    setError('');

    if (!window.ethereum) {
      setError('MetaMask is not installed. Install it from metamask.io and refresh.');
      return;
    }

    try {
      // Step 1: request accounts
      setStep('connecting');
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      const account = accounts[0];
      if (!account) {
        setError('No account selected.');
        setStep('idle');
        return;
      }
      setAddress(account);

      // Step 2: fetch challenge nonce from backend
      const nonceRes = await fetch(`${apiBase}/auth/nonce?address=${account}`);
      if (!nonceRes.ok) {
        setError('Could not reach backend.');
        setStep('idle');
        return;
      }
      const { message, error: nonceError } = (await nonceRes.json()) as { message?: string; error?: string };
      if (nonceError || !message) {
        setError(nonceError ?? 'Failed to get challenge.');
        setStep('idle');
        return;
      }

      // Step 3: ask user to sign the message
      setStep('signing');
      let signature: string;
      try {
        signature = (await window.ethereum.request({
          method: 'personal_sign',
          params: [message, account],
        })) as string;
      } catch (signErr: unknown) {
        const msg = signErr instanceof Error ? signErr.message : String(signErr);
        if (msg.includes('User denied') || msg.includes('rejected')) {
          setError('Signature rejected. Please sign to log in.');
        } else {
          setError('Signing failed: ' + msg);
        }
        setStep('idle');
        return;
      }

      // Step 4: send address + signature to backend
      setStep('verifying');
      const loginRes = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: account, signature }),
        credentials: 'include',
      });

      if (!loginRes.ok) {
        const body = (await loginRes.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? 'Wallet not authorised.');
        setStep('idle');
        return;
      }

      setStep('done');
      router.push('/overview');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error.');
      setStep('idle');
    }
  }

  const busy = step !== 'idle';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d1117]">
      <div className="w-full max-w-sm space-y-8 rounded-[28px] border border-white/10 bg-white/5 p-8 backdrop-blur">
        <div className="text-center">
          <div className="mb-1 text-xs uppercase tracking-[0.24em] text-muted">PerpScout AI</div>
          <h1 className="text-2xl font-semibold">Futures Console</h1>
          <p className="mt-2 text-sm text-muted">Connect your wallet to access the dashboard</p>
        </div>

        <div className="space-y-4">
          {/* Wallet address pill — shown once connected */}
          {address && (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
              <span className="h-2 w-2 rounded-full bg-green-400" />
              <span className="font-mono text-xs text-white/70 break-all">{address}</span>
            </div>
          )}

          {/* Signing step hint */}
          {step === 'signing' && (
            <p className="text-center text-sm text-yellow-400/80">
              Check MetaMask — a signature request is waiting.
            </p>
          )}

          {error && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={handleConnect}
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-accent px-4 py-3.5 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-50"
          >
            {!busy && (
              <svg width="20" height="20" viewBox="0 0 318.6 318.6" fill="currentColor">
                <path d="M274.1 35.5l-99.5 73.9L193 65z" />
                <path d="M44.4 35.5l98.7 74.6-17.5-44.2zm193.9 171.3l-26.5 40.6 56.7 15.6 16.3-55.3zm-204.4.9l16.1 55.3 56.7-15.6-26.5-40.6zm112.1-23.8l-58.5 3 19.6 34.6 33.7-11.8zm0 0l33.9-8.4 19.6-34.6-58.6-3z" />
              </svg>
            )}
            {STEP_LABEL[step]}
          </button>

          <p className="text-center text-xs text-muted">
            Only wallet{' '}
            <span className="font-mono text-white/50">
              {process.env.NEXT_PUBLIC_ALLOWED_WALLET_SHORT ?? '0xd217…9309'}
            </span>{' '}
            can log in
          </p>
        </div>
      </div>
    </div>
  );
}
