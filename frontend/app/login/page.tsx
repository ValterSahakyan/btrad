'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApiPath } from '@/lib/client-api';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

type Step = 'idle' | 'connecting' | 'signing' | 'verifying' | 'done';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('idle');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const busy = step !== 'idle';

  async function handleConnect() {
    setError('');
    if (!window.ethereum) {
      setError('MetaMask not detected. Install it from metamask.io and refresh.');
      return;
    }
    try {
      setStep('connecting');
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      const account = accounts[0];
      if (!account) { setError('No account selected.'); setStep('idle'); return; }
      setAddress(account);

      const nonceRes = await fetch(`${clientApiPath('/auth/nonce')}?address=${account}`);
      if (!nonceRes.ok) { setError('Could not reach backend.'); setStep('idle'); return; }
      const { message, error: nonceErr } = (await nonceRes.json()) as { message?: string; error?: string };
      if (nonceErr || !message) { setError(nonceErr ?? 'Failed to get challenge.'); setStep('idle'); return; }

      setStep('signing');
      let signature: string;
      try {
        signature = (await window.ethereum.request({ method: 'personal_sign', params: [message, account] })) as string;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg.includes('denied') || msg.includes('rejected') ? 'Signature rejected.' : 'Signing failed: ' + msg);
        setStep('idle'); return;
      }

      setStep('verifying');
      const loginRes = await fetch(clientApiPath('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: account, signature }),
        credentials: 'include',
      });
      if (!loginRes.ok) {
        const body = (await loginRes.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? 'Wallet not authorised.');
        setStep('idle'); return;
      }

      setStep('done');
      router.push('/overview');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error.');
      setStep('idle');
    }
  }

  const stepLabel: Record<Step, string> = {
    idle: 'Connect Wallet',
    connecting: 'Requesting accounts…',
    signing: 'Sign in MetaMask…',
    verifying: 'Verifying…',
    done: 'Redirecting…',
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080C14]">
      <div className="w-full max-w-[360px] space-y-6">
        {/* Logo */}
        <div className="text-center space-y-1">
          <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-dim">Algorithmic Trading</div>
          <h1 className="text-2xl font-semibold text-white">BEE trad</h1>
          <p className="text-[12px] text-dim">Connect your authorized wallet to continue</p>
        </div>

        {/* Card */}
        <div className="panel p-6 space-y-4">
          {/* Address pill */}
          {address && (
            <div className="flex items-center gap-2 rounded border border-border bg-surface px-3 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-positive flex-shrink-0" />
              <span className="font-mono text-[11px] text-white/60 break-all">{address}</span>
            </div>
          )}

          {/* Signing hint */}
          {step === 'signing' && (
            <p className="text-center text-[12px] text-warning">Check MetaMask — a signature request is waiting.</p>
          )}

          {/* Error */}
          {error && (
            <div className="rounded border border-danger/20 bg-danger/5 px-3 py-2.5 text-[12px] text-danger">
              {error}
            </div>
          )}

          {/* Connect button */}
          <button
            onClick={handleConnect}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2.5 rounded bg-accent px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-accent/80 disabled:opacity-50 cursor-pointer"
          >
            {!busy && (
              <svg width="18" height="18" viewBox="0 0 318.6 318.6" fill="currentColor" aria-hidden>
                <path d="M274.1 35.5l-99.5 73.9L193 65z" />
                <path d="M44.4 35.5l98.7 74.6-17.5-44.2zm193.9 171.3l-26.5 40.6 56.7 15.6 16.3-55.3zm-204.4.9l16.1 55.3 56.7-15.6-26.5-40.6zm112.1-23.8l-58.5 3 19.6 34.6 33.7-11.8zm0 0l33.9-8.4 19.6-34.6-58.6-3z" />
              </svg>
            )}
            {stepLabel[step]}
          </button>

          <p className="text-center text-[11px] text-dim">
            Authorized wallet:{' '}
            <span className="font-mono text-white/40">
              {process.env.NEXT_PUBLIC_ALLOWED_WALLET_SHORT ?? '0xd217…9309'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
