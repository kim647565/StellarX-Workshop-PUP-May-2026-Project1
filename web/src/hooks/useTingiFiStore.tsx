'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  demoState,
  formatMoney,
  loanOutstanding,
  monthlyProjection,
  TINGIFI_STORAGE_KEY,
  type LoanRequest,
  type TingiFiState,
} from '@/lib/tingifi';

type CreateLoanInput = {
  storeName: string;
  ownerName: string;
  ownerAddress: string;
  barangay: string;
  inventoryNeed: string;
  amountRequested: number;
  dailyRepayment: number;
  termDays: number;
  interestRate: number;
  narrative: string;
};

function cloneDemoState(): TingiFiState {
  return JSON.parse(JSON.stringify(demoState)) as TingiFiState;
}

function createLoanId(): string {
  return `tg-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function loadInitialState(): TingiFiState {
  if (typeof window === 'undefined') {
    return cloneDemoState();
  }

  try {
    const raw = window.localStorage.getItem(TINGIFI_STORAGE_KEY);
    if (!raw) return cloneDemoState();
    return JSON.parse(raw) as TingiFiState;
  } catch {
    return cloneDemoState();
  }
}

export function useTingiFiStore() {
  const [state, setState] = useState<TingiFiState>(() => cloneDemoState());
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setState(loadInitialState());
      setReady(true);
      hydrated.current = true;
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(TINGIFI_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage errors in demo mode.
    }
  }, [state, ready]);

  const reset = useCallback(() => {
    setState(cloneDemoState());
  }, []);

  const createLoan = useCallback((input: CreateLoanInput) => {
    const loan: LoanRequest = {
      id: createLoanId(),
      storeName: input.storeName.trim(),
      ownerName: input.ownerName.trim(),
      ownerAddress: input.ownerAddress.trim(),
      lenderName: 'Open marketplace',
      lenderAddress: '',
      barangay: input.barangay.trim(),
      inventoryNeed: input.inventoryNeed.trim(),
      amountRequested: input.amountRequested,
      amountFunded: 0,
      amountRepaid: 0,
      dailyRepayment: input.dailyRepayment,
      interestRate: input.interestRate,
      termDays: input.termDays,
      daysRemaining: input.termDays,
      status: 'Requested',
      narrative: input.narrative.trim(),
      repayments: [],
    };

    setState((prev: TingiFiState) => ({
      ...prev,
      loans: [loan, ...prev.loans],
      ownerProfile: {
        fullName: loan.ownerName,
        storeName: loan.storeName,
        barangay: loan.barangay,
        target: loan.inventoryNeed,
      },
    }));

    return loan;
  }, []);

  const fundLoan = useCallback(
    (loanId: string, lenderName: string, lenderAddress: string, txHash?: string, contractTxHash?: string): LoanRequest | null => {
      let updatedLoan: LoanRequest | null = null;

      setState((prev: TingiFiState) => {
        const loan = prev.loans.find((item: LoanRequest) => item.id === loanId);
        if (!loan || loan.status !== 'Requested') {
          return prev;
        }

        updatedLoan = {
          ...loan,
          status: 'Repaying',
          amountFunded: loan.amountRequested,
          lenderName,
          lenderAddress,
          daysRemaining: loan.termDays,
          usdcTxHash: txHash,
          contractTxHash: contractTxHash,
        };

        return {
          ...prev,
          marketCapital: prev.marketCapital + loan.amountRequested,
          lenderPool: Math.max(0, prev.lenderPool - loan.amountRequested),
          loans: prev.loans.map((item: LoanRequest) =>
            item.id === loanId ? updatedLoan! : item,
          ),
        };
      });

      return updatedLoan;
    },
    [],
  );

  const repayLoan = useCallback(
    (loanId: string, amount: number, note: string, txHash?: string, contractTxHash?: string): LoanRequest | null => {
      let updatedLoan: LoanRequest | null = null;

      setState((prev: TingiFiState) => {
        const loan = prev.loans.find((item: LoanRequest) => item.id === loanId);
        if (!loan || loan.status === 'Requested') {
          return prev;
        }

        const due = monthlyProjection(loan);
        const nextAmountRepaid = Math.min(due, loan.amountRepaid + amount);
        const principalInterestEarned = Math.max(0, nextAmountRepaid - loan.amountRequested);
        const previousInterestEarned = Math.max(0, loan.amountRepaid - loan.amountRequested);
        const earningsDelta = Math.max(0, principalInterestEarned - previousInterestEarned);

        updatedLoan = {
          ...loan,
          amountRepaid: nextAmountRepaid,
          daysRemaining: Math.max(0, loan.daysRemaining - 1),
          status: nextAmountRepaid >= due ? 'Completed' : 'Repaying',
          contractTxHash: contractTxHash ?? loan.contractTxHash,
          repayments: [
            {
              id: `rep-${Date.now()}`,
              date: new Date().toISOString().slice(0, 10),
              amount,
              txHash,
              note,
            },
            ...loan.repayments,
          ],
        };

        return {
          ...prev,
          marketCapital: Math.max(0, prev.marketCapital - amount),
          lenderPool: prev.lenderPool + amount,
          earnings: prev.earnings + earningsDelta,
          loans: prev.loans.map((item: LoanRequest) =>
            item.id === loanId ? updatedLoan! : item,
          ),
        };
      });

      return updatedLoan;
    },
    [],
  );

  const completeLoan = useCallback((loanId: string) => {
    setState((prev: TingiFiState) => ({
      ...prev,
      loans: prev.loans.map((loan: LoanRequest) =>
        loan.id === loanId
          ? {
              ...loan,
              status: 'Completed',
              daysRemaining: 0,
            }
          : loan,
      ),
    }));
  }, []);

  const withdrawEarnings = useCallback((amount: number) => {
    setState((prev: TingiFiState) => ({
      ...prev,
      earnings: Math.max(0, prev.earnings - amount),
      lenderPool: prev.lenderPool + amount,
    }));
  }, []);

  const depositCapital = useCallback((amount: number) => {
    setState((prev: TingiFiState) => ({
      ...prev,
      marketCapital: prev.marketCapital + amount,
      lenderPool: prev.lenderPool + amount,
    }));
  }, []);

  return {
    ready,
    state,
    setState,
    reset,
    createLoan,
    fundLoan,
    repayLoan,
    completeLoan,
    withdrawEarnings,
    depositCapital,
    formatMoney,
    loanOutstanding,
  };
}
