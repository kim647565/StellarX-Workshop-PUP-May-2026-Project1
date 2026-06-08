'use client';

import { useState } from 'react';
import type { WalletState } from '@/hooks/useWallet';

export default function ConnectWallet({
  publicKey,
  connecting,
  error,
  connect,
  disconnect,
}: WalletState) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!publicKey) return;
    await navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (publicKey) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={copy}
          title="Copy full address"
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-slate-100 transition-colors hover:bg-white/10"
        >
          {copied ? 'Copied!' : `${publicKey.slice(0, 6)}...${publicKey.slice(-6)}`}
        </button>
        <button
          onClick={disconnect}
          className="rounded-xl border border-rose-300/20 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-300/10"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={connect}
        disabled={connecting}
        className="w-full rounded-xl bg-amber-300 px-4 py-3 font-semibold text-slate-950 transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {connecting ? 'Connecting...' : 'Connect Freighter'}
      </button>
      {error && <p className="mt-2 max-w-xs text-sm text-rose-200">{error}</p>}
    </div>
  );
}
