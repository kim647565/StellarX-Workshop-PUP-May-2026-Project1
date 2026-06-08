'use client';

import { useState } from 'react';
import { buildAddUsdcTrustlineXDR } from '@/lib/trustline';
import { signAndSubmit } from '@/lib/sign';

type Status = 'idle' | 'working' | 'done' | 'error';

export default function AddTrustline({
  publicKey,
  onDone,
}: {
  publicKey: string;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const add = async () => {
    setStatus('working');
    setError('');
    try {
      const xdr = await buildAddUsdcTrustlineXDR(publicKey);
      await signAndSubmit(xdr, publicKey);
      setStatus('done');
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add trustline');
      setStatus('error');
    }
  };

  if (status === 'done') {
    return <p className="text-sm text-emerald-200">USDC trustline added.</p>;
  }

  return (
    <div>
      <button
        onClick={add}
        disabled={status === 'working'}
        className="w-full rounded-xl border border-sky-300/25 bg-sky-300/10 px-3 py-2.5 text-sm text-sky-50 transition-colors hover:bg-sky-300/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'working' ? 'Adding USDC trustline...' : 'Add USDC trustline'}
      </button>
      {error && <p className="mt-1 text-sm text-rose-200">{error}</p>}
    </div>
  );
}
