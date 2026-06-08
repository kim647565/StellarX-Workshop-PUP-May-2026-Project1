'use client';

import { useState } from 'react';
import { fundTestnetAccount } from '@/lib/stellar';

export default function FundAccount({
  publicKey,
  onFunded,
}: {
  publicKey: string;
  onFunded: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fund = async () => {
    setLoading(true);
    setError('');
    try {
      await fundTestnetAccount(publicKey);
      onFunded();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Funding failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={fund}
        disabled={loading}
        className="w-full rounded-xl border border-amber-300/30 bg-amber-300/15 px-3 py-2.5 text-sm font-medium text-amber-50 transition-colors hover:bg-amber-300/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Funding...' : 'Fund with Friendbot (testnet)'}
      </button>
      {error && <p className="mt-1 text-sm text-rose-200">{error}</p>}
    </div>
  );
}
