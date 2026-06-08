'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getAddress, requestAccess, WatchWalletChanges } from '@stellar/freighter-api';

export type WalletState = {
  publicKey: string | null;
  connecting: boolean;
  error: string;
  connect: () => Promise<void>;
  disconnect: () => void;
};

type WalletContextValue = WalletState;

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

function normalizeError(error: unknown): string {
  if (!error) return 'Wallet connection failed';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return 'Wallet connection failed';
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const manualDisconnectRef = useRef(false);

  useEffect(() => {
    let active = true;
    const watcher = new WatchWalletChanges(3000);

    const syncWallet = async () => {
      try {
        const initial = await getAddress();
        if (!active) return;
        if (initial.error) {
          if (!manualDisconnectRef.current) {
            setError(normalizeError(initial.error));
          }
          return;
        }

        if (initial.address && !manualDisconnectRef.current) {
          setPublicKey(initial.address);
          setError('');
        }
      } catch (syncError) {
        if (!active) return;
        if (!manualDisconnectRef.current) {
          setError(normalizeError(syncError));
        }
      }
    };

    void syncWallet();

    watcher.watch(({ address, error: watchError }) => {
      if (!active) return;

      if (watchError) {
        if (!manualDisconnectRef.current) {
          setError(normalizeError(watchError));
        }
        return;
      }

      if (manualDisconnectRef.current) {
        if (!address) {
          setPublicKey(null);
        }
        return;
      }

      setPublicKey(address || null);
      setError('');
    });

    return () => {
      active = false;
      watcher.stop();
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError('');
    manualDisconnectRef.current = false;

    try {
      const response = await requestAccess();
      if (response.error) {
        throw response.error;
      }

      setPublicKey(response.address || null);
    } catch (connectError) {
      setError(normalizeError(connectError));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    setPublicKey(null);
    setError('');
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      publicKey,
      connecting,
      error,
      connect,
      disconnect,
    }),
    [connect, connecting, disconnect, error, publicKey],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }

  return context;
}
