'use client';

import { useEffect, useState } from 'react';
import { fetchBalances, type Balances } from '@/lib/balances';

export default function BalanceCard({
  publicKey,
  refreshKey,
}: {
  publicKey: string;
  refreshKey: number;
}) {
  const [balances, setBalances] = useState<Balances | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchBalances(publicKey)
      .then((b) => active && setBalances(b))
      .catch(() => active && setBalances(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [publicKey, refreshKey]);

  if (loading) {
    return (
      <div className="mt-4 grid animate-pulse grid-cols-2 gap-4">
        <div className="h-20 rounded-2xl bg-white/10" />
        <div className="h-20 rounded-2xl bg-white/10" />
      </div>
    );
  }

  if (balances && !balances.funded) {
    return (
      <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-50">
        This account is not funded yet. Click {'"Fund with Friendbot"'} above.
      </p>
    );
  }

  if (!balances) {
    return <p className="mt-4 text-sm text-rose-200">Failed to load balances.</p>;
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-4">
      <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">XLM</p>
        <p className="text-2xl font-bold text-white">{balances.xlm}</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">USDC</p>
        <p className="text-2xl font-bold text-white">{balances.usdc}</p>
      </div>
    </div>
  );
}
