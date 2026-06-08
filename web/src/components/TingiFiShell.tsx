'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import AddTrustline from '@/components/AddTrustline';
import BalanceCard from '@/components/BalanceCard';
import ConnectWallet from '@/components/ConnectWallet';
import FundAccount from '@/components/FundAccount';
import { useWallet } from '@/hooks/useWallet';
import { useTingiFiStore } from '@/hooks/useTingiFiStore';
import { signAndSubmit } from '@/lib/sign';
import { buildAddUsdcTrustlineXDR } from '@/lib/trustline';
import { formatMoney, loanOutstanding, loanProgress, monthlyProjection, type TingiFiState, type LoanRequest, type LoanStatus } from '@/lib/tingifi';

type ViewMode = 'landing' | 'store-owner' | 'lender' | 'marketplace' | 'loan';

type Props = {
  view: ViewMode;
  focusLoanId?: string;
};

type RequestForm = {
  storeName: string;
  ownerName: string;
  ownerAddress: string;
  barangay: string;
  inventoryNeed: string;
  amountRequested: string;
  dailyRepayment: string;
  termDays: string;
  interestRate: string;
  narrative: string;
};

const TEXT_FIELDS = [
  { label: 'Store name', key: 'storeName' },
  { label: 'Owner name', key: 'ownerName' },
  { label: 'Wallet address', key: 'ownerAddress' },
  { label: 'Barangay', key: 'barangay' },
  { label: 'Inventory need', key: 'inventoryNeed' },
  { label: 'Narrative', key: 'narrative' },
] as const satisfies ReadonlyArray<{ label: string; key: keyof RequestForm }>;

const NUMBER_FIELDS = [
  { key: 'amountRequested', label: 'Amount requested (USDC)' },
  { key: 'dailyRepayment', label: 'Daily repayment (USDC)' },
  { key: 'termDays', label: 'Term in days' },
  { key: 'interestRate', label: 'Interest rate (%)' },
] as const satisfies ReadonlyArray<{ key: keyof RequestForm; label: string }>;

const NAV = [
  { href: '/', label: 'Landing' },
  { href: '/store-owner', label: 'Store Owner' },
  { href: '/lender', label: 'Lender' },
  { href: '/marketplace', label: 'Marketplace' },
];

const primaryButton =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45';
const secondaryButton =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45';
const fieldClass =
  'w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/15';

function formatAddress(address: string): string {
  if (!address) return 'Not connected';
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

function SectionLabel({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">TingiFi</p>
      <h1 className="mt-3 font-[var(--font-display)] text-4xl font-semibold leading-tight text-white sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">{body}</p>
    </div>
  );
}

function StatusPill({ status }: { status: LoanStatus }) {
  const classes: Record<LoanStatus, string> = {
    Requested: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
    Funded: 'border-sky-300/25 bg-sky-300/10 text-sky-100',
    Repaying: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
    Completed: 'border-white/15 bg-white/10 text-slate-200',
  };

  return (
    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${classes[status]}`}>
      {status}
    </span>
  );
}

export default function TingiFiShell({ view, focusLoanId }: Props) {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { ready, state, setState, createLoan, fundLoan, repayLoan, completeLoan, withdrawEarnings, depositCapital, reset } =
    useTingiFiStore();
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedLoanId, setSelectedLoanId] = useState(focusLoanId ?? '');
  const syncedLoanIdsRef = useRef(new Set<string>());
  const [requestForm, setRequestForm] = useState<RequestForm>({
    storeName: state.ownerProfile.storeName,
    ownerName: state.ownerProfile.fullName,
    ownerAddress: publicKey ?? state.loans[0]?.ownerAddress ?? '',
    barangay: state.ownerProfile.barangay,
    inventoryNeed: 'Bulk sachets, noodles, canned goods, rice',
    amountRequested: '12000',
    dailyRepayment: '400',
    termDays: '30',
    interestRate: '8',
    narrative: 'Inventory top-up for higher volume sales and daily repayment.',
  });
  const ownerAddress = publicKey ?? requestForm.ownerAddress;

  const selectedLoan = useMemo(
    () => state.loans.find((loan) => loan.id === selectedLoanId) ?? state.loans[0],
    [selectedLoanId, state.loans],
  );

  const totalActive = state.loans.filter((loan) => loan.status !== 'Completed').length;
  const totalOutstanding = state.loans.reduce((sum, loan) => sum + loanOutstanding(loan), 0);
  const repaymentRate =
    state.loans.length > 0
      ? Math.round(
          (state.loans.filter((loan) => loan.status === 'Completed').length / state.loans.length) * 100,
        )
      : 0;

  const refreshLoanState = useCallback(async (loanId: string) => {
    try {
      const { readLoanState } = await import('@/lib/contract');
      const onChain = await readLoanState(loanId);
      if (!onChain) return;

      setState((prev: TingiFiState) => ({
        ...prev,
        loans: prev.loans.map((loan: LoanRequest) => {
          if (loan.id !== loanId) return loan;
          return {
            ...loan,
            amountFunded: Number(onChain.principal),
            amountRepaid: Number(onChain.repaid),
            status: onChain.status as LoanStatus,
            lenderAddress: onChain.lender || loan.lenderAddress,
          };
        }),
      }));
    } catch (error) {
      console.error('Failed to sync with chain:', error);
    }
  }, [setState]);

  useEffect(() => {
    if (!ready) return;
    state.loans.forEach((loan: LoanRequest) => {
      const shouldSync =
        loan.contractTxHash &&
        !loan.contractTxHash.startsWith('demo-') &&
        !syncedLoanIdsRef.current.has(loan.id);

      if (shouldSync) {
        syncedLoanIdsRef.current.add(loan.id);
        refreshLoanState(loan.id);
      }
    });
  }, [ready, refreshLoanState, state.loans]);

  const handleRequestLoan = () => {
    setActionMessage('');
    setActionError('');

    try {
      const amountRequested = Number(requestForm.amountRequested);
      const dailyRepayment = Number(requestForm.dailyRepayment);
      const termDays = Number(requestForm.termDays);
      const interestRate = Number(requestForm.interestRate) / 100;

      if (!requestForm.storeName || !requestForm.ownerName || !ownerAddress) {
        throw new Error('Fill out the store, owner, and wallet address fields.');
      }

      const loan = createLoan({
        storeName: requestForm.storeName,
        ownerName: requestForm.ownerName,
        ownerAddress,
        barangay: requestForm.barangay,
        inventoryNeed: requestForm.inventoryNeed,
        amountRequested,
        dailyRepayment,
        termDays,
        interestRate,
        narrative: requestForm.narrative,
      });

      setSelectedLoanId(loan.id);
      setActionMessage(`${loan.storeName} loan request created.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not create loan request');
    }
  };

  const handleDemoFunding = (loanId: string) => {
    const loan = state.loans.find((item) => item.id === loanId);
    if (!loan) return;

    const updated = fundLoan(loan.id, state.lenderProfile.fullName, state.lenderProfile.wallet, `demo-${loan.id}-funded`);
    if (updated) {
      setSelectedLoanId(updated.id);
      setActionMessage(`${loan.storeName} funded in the demo ledger.`);
    }
  };

  const handleDemoRepayment = (loanId: string) => {
    const loan = state.loans.find((item) => item.id === loanId);
    if (!loan) return;

    const updated = repayLoan(
      loan.id,
      loan.dailyRepayment,
      'Daily repayment from store sales',
      `demo-${loan.id}-repayment-${Date.now()}`,
    );
    if (updated && updated.status === 'Completed') {
      completeLoan(updated.id);
    }
    if (updated) {
      setSelectedLoanId(updated.id);
      setActionMessage(`Repayment recorded for ${loan.storeName}.`);
    }
  };

  const handleOnChainCreate = async () => {
    setActionMessage('');
    setActionError('');
    if (!publicKey) throw new Error('Connect a wallet to create an on-chain request.');

    setActionMessage('Submitting contract request...');
    try {
      const amountRequested = Number(requestForm.amountRequested);
      const interestBps = Math.round(Number(requestForm.interestRate) * 100);
      const termDays = Number(requestForm.termDays);

      const loan = createLoan({
        ...requestForm,
        ownerAddress,
        amountRequested,
        dailyRepayment: Number(requestForm.dailyRepayment),
        termDays,
        interestRate: Number(requestForm.interestRate) / 100,
      });

      const { buildCreateLoanXDR } = await import('@/lib/contract');
      const xdr = await buildCreateLoanXDR(
        publicKey,
        loan.id,
        publicKey,
        amountRequested,
        interestBps,
        termDays,
      );

      const hash = await signAndSubmit(xdr, publicKey);
      setState((prev: TingiFiState) => ({
        ...prev,
        loans: prev.loans.map((l: LoanRequest) => (l.id === loan.id ? { ...l, contractTxHash: hash } : l)),
      }));

      setSelectedLoanId(loan.id);
      setActionMessage(`Loan request ${loan.id} created on-chain.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'On-chain request failed');
    }
  };

  const handleOnChainFunding = async (loanId: string) => {
    const loan = state.loans.find((item) => item.id === loanId);
    if (!loan) return;
    if (!publicKey) throw new Error('Connect a lender wallet first.');

    setActionMessage('Building atomic funding transaction...');
    try {
      const { buildAtomicFundXDR } = await import('@/lib/contract');
      const xdr = await buildAtomicFundXDR(
        publicKey,
        loan.id,
        loan.ownerAddress,
        loan.amountRequested.toString(),
      );

      const hash = await signAndSubmit(xdr, publicKey);
      const updated = fundLoan(loan.id, state.lenderProfile.fullName, publicKey, hash, hash);
      if (updated) {
        setActionMessage(`On-chain funding and ledger update confirmed in one transaction!`);
        await refreshLoanState(loanId);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Funding failed');
    }
    setRefreshKey((current) => current + 1);
  };

  const handleOnChainRepayment = async (loanId: string) => {
    const loan = state.loans.find((item) => item.id === loanId);
    if (!loan) return;
    if (!publicKey) throw new Error('Connect a borrower wallet first.');
    if (!loan.lenderAddress) throw new Error('This loan has not been funded yet.');

    setActionMessage('Building atomic repayment transaction...');
    try {
      const { buildAtomicRepayXDR } = await import('@/lib/contract');
      const xdr = await buildAtomicRepayXDR(
        publicKey,
        loan.id,
        loan.lenderAddress,
        loan.dailyRepayment.toString(),
      );

      const hash = await signAndSubmit(xdr, publicKey);
      const updated = repayLoan(loan.id, loan.dailyRepayment, 'Daily repayment from store sales', hash, hash);
      if (updated && updated.status === 'Completed') {
        const { buildCloseLoanXDR } = await import('@/lib/contract');
        const closeXdr = await buildCloseLoanXDR(publicKey, loan.id);
        const closeHash = await signAndSubmit(closeXdr, publicKey);
        completeLoan(updated.id);
        setState((prev: TingiFiState) => ({
          ...prev,
          loans: prev.loans.map((l: LoanRequest) => (l.id === loan.id ? { ...l, contractTxHash: closeHash } : l)),
        }));
      }
      if (updated) {
        setActionMessage(`On-chain repayment and ledger update confirmed in one transaction!`);
        await refreshLoanState(loanId);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Repayment failed');
    }
    setRefreshKey((current) => current + 1);
  };

  const handleTrustline = async () => {
    if (!publicKey) return;
    const xdr = await buildAddUsdcTrustlineXDR(publicKey);
    await signAndSubmit(xdr, publicKey);
    setActionMessage('USDC trustline added on testnet.');
    setRefreshKey((current) => current + 1);
  };

  const heroTitle =
    view === 'store-owner'
      ? 'Turn daily sales into inventory growth.'
      : view === 'lender'
        ? 'Deploy USDC into short, trackable loans.'
        : view === 'marketplace'
          ? 'Browse sari-sari store loans ready for funding.'
          : view === 'loan'
            ? 'Follow a single loan from request to completion.'
            : 'Community-funded USDC loans for sari-sari stores.';

  const heroBody =
    view === 'store-owner'
      ? 'Store owners submit a request, receive inventory capital, and repay in small USDC installments from sales.'
      : view === 'lender'
        ? 'Lenders browse requests, fund promising shops, and watch repayments flow back through a simple, demo-ready ledger.'
        : view === 'marketplace'
          ? 'Every loan shows the amount requested, repayment progress, and the current status across the lending cycle.'
          : view === 'loan'
            ? 'The detail view ties together the storefront story, the repayment timeline, and the Stellar actions behind the scene.'
            : 'TingiFi helps community lenders extend short-term USDC credit so small stores can buy in bulk and repay daily.';

  const showOverview = view === 'landing';
  const showStoreOwnerTools = view === 'landing' || view === 'store-owner';
  const showLenderTools = view === 'landing' || view === 'lender' || view === 'loan';
  const showMarketplace = view === 'landing' || view === 'marketplace';
  const showLoanDetail = view === 'landing' || view === 'loan';
  const activeHref =
    view === 'store-owner'
      ? '/store-owner'
      : view === 'lender'
        ? '/lender'
        : view === 'marketplace'
          ? '/marketplace'
          : '/';

  if (!ready) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.16),_transparent_32%),linear-gradient(180deg,#09111f_0%,#0f172a_60%,#111827_100%)] px-6 py-16 text-white">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-white/10 bg-white/5 p-10 backdrop-blur-xl">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-200/70">Loading TingiFi</p>
          <p className="mt-4 text-lg text-slate-200">Preparing the demo ledger and local loan state…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#08111f_0%,#111827_48%,#0f172a_100%)] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="sticky top-4 z-20 rounded-2xl border border-white/10 bg-slate-950/85 px-5 py-4 shadow-[0_20px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 via-orange-400 to-rose-500 text-lg font-black text-slate-950">
                T
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">Stellar on Testnet</p>
                <h1 className="font-[var(--font-display)] text-2xl font-semibold text-white sm:text-3xl">
                  TingiFi
                </h1>
                <p className="max-w-2xl text-sm text-slate-300">
                  Community lenders, sari-sari inventory financing, and loan tracking on Stellar.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.href === activeHref ? 'page' : undefined}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    item.href === activeHref
                      ? 'border-amber-300/40 bg-amber-300/15 text-amber-100'
                      : 'border-white/10 bg-white/5 text-slate-100 hover:border-amber-300/50 hover:bg-amber-300/10'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <button
                onClick={reset}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:border-rose-300/50 hover:bg-rose-300/10"
              >
                Reset demo
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] p-6 shadow-[0_30px_120px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-8">
            <SectionLabel title={heroTitle} body={heroBody} />

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                { label: 'Loans active', value: totalActive.toString(), detail: 'Requests and repayments in motion' },
                { label: 'Capital deployed', value: formatMoney(state.marketCapital), detail: 'Inventory capital on the move' },
                { label: 'Repayment rate', value: `${repaymentRate}%`, detail: 'Loans fully settled on the demo ledger' },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-white/10 bg-slate-950/55 p-5">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{card.label}</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{card.value}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{card.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/marketplace"
                className={primaryButton}
              >
                Browse loan requests
              </Link>
              <Link
                href="/store-owner"
                className={secondaryButton}
              >
                Request inventory capital
              </Link>
              <Link
                href="/lender"
                className={secondaryButton}
              >
                Fund a community loan
              </Link>
            </div>

            {showOverview && (
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">How it works</p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                  <li>1. Store owner requests a short-term USDC loan for bulk inventory.</li>
                  <li>2. Lender funds the request with on-chain testnet USDC or demo mode.</li>
                  <li>3. The store owner records daily repayments until the balance reaches zero.</li>
                  <li>4. Loan status closes automatically when the expected total is repaid.</li>
                </ul>
              </div>

              <div className="rounded-[1.5rem] border border-emerald-300/15 bg-emerald-300/10 p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-emerald-200/80">Stellar layer</p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-emerald-50/90">
                  <li>USDC payments use Stellar testnet accounts and Freighter signing.</li>
                  <li>Trustlines are required before any account can receive USDC.</li>
                  <li>Loan state is mirrored in a simple ledger so the demo stays easy to follow.</li>
                  <li>The Soroban contract can be wired to the same lifecycle buttons.</li>
                </ul>
              </div>
            </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Wallet</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Connect Freighter</h2>
                </div>
                <span className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200">
                  Testnet only
                </span>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <ConnectWallet {...wallet} />
                {publicKey && (
                  <div className="mt-4 space-y-3 text-sm text-slate-200">
                    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Connected address</p>
                      <p className="mt-1 font-mono text-xs text-slate-100">{formatAddress(publicKey)}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      <FundAccount publicKey={publicKey} onFunded={() => setRefreshKey((value) => value + 1)} />
                      <AddTrustline publicKey={publicKey} onDone={() => setRefreshKey((value) => value + 1)} />
                    </div>
                  </div>
                )}
              </div>

              {publicKey ? (
                <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
                    <span>USDC ready</span>
                    <button
                      onClick={handleTrustline}
                      className="rounded-xl border border-white/10 px-3 py-1 text-xs transition hover:bg-white/10"
                    >
                      Add trustline on-chain
                    </button>
                  </div>
                  <BalanceCard publicKey={publicKey} refreshKey={refreshKey} />
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  Connect a wallet to fund testnet accounts, add the USDC trustline, and sign loan transactions.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Community pool</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-slate-400">Available pool</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatMoney(state.lenderPool)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-slate-400">Expected lender earnings</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatMoney(state.earnings)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-slate-400">Average loan size</p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {formatMoney(Math.round(totalOutstanding / Math.max(1, totalActive)))}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </section>

        {(showStoreOwnerTools || showLenderTools) && (
        <section className={`grid gap-6 ${showStoreOwnerTools && showLenderTools ? 'xl:grid-cols-[1.15fr_0.85fr]' : ''}`}>
          {showStoreOwnerTools && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-6 backdrop-blur-xl sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Store owner</p>
                <h2 className="mt-1 font-[var(--font-display)] text-3xl text-white">Create a loan request</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-slate-300">
                Fill in the store profile, inventory need, and repayment plan. The request appears instantly in the marketplace.
              </p>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {TEXT_FIELDS.map(({ label, key }) => {
                const isLongField = key === 'narrative' || key === 'inventoryNeed';
                const commonProps = {
                  value: key === 'ownerAddress' ? ownerAddress : requestForm[key],
                  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setRequestForm((current) => ({
                      ...current,
                      [key]: event.target.value,
                    })),
                  className: fieldClass,
                };

                return (
                  <label key={label} className={`space-y-2 text-sm text-slate-200 ${isLongField ? 'sm:col-span-2' : ''}`}>
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</span>
                    {isLongField ? (
                      <textarea rows={3} {...commonProps} />
                    ) : (
                    <input type="text" {...commonProps} />
                  )}
                </label>
              );
            })}

              {NUMBER_FIELDS.map(({ key, label }) => (
                <label key={label} className="space-y-2 text-sm text-slate-200">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</span>
                  <input
                    type="number"
                    value={requestForm[key]}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    className={fieldClass}
                  />
                </label>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={handleRequestLoan}
                className={primaryButton}
              >
                Submit request (Demo)
              </button>
              <button
                onClick={handleOnChainCreate}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-300/20 px-5 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-300/10"
              >
                Submit request on-chain
              </button>
              <button
                onClick={() => setRequestForm({
                  storeName: state.ownerProfile.storeName,
                  ownerName: state.ownerProfile.fullName,
                  ownerAddress: publicKey ?? '',
                  barangay: state.ownerProfile.barangay,
                  inventoryNeed: 'Bulk sachets, noodles, canned goods, rice',
                  amountRequested: '12000',
                  dailyRepayment: '400',
                  termDays: '30',
                  interestRate: '8',
                  narrative: 'Inventory top-up for higher volume sales and daily repayment.',
                })}
                className={secondaryButton}
              >
                Reset form
              </button>
            </div>

            {(actionMessage || actionError) && (
              <div className={`mt-5 rounded-2xl border p-4 text-sm ${actionError ? 'border-rose-300/20 bg-rose-300/10 text-rose-100' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-50'}`}>
                {actionError || actionMessage}
              </div>
            )}
          </div>
          )}

          {showLenderTools && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Lender dashboard</p>
                  <h2 className="mt-1 text-2xl font-semibold text-white">Deploy capital</h2>
                </div>
                <button
                  onClick={() => depositCapital(5000)}
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-100 transition hover:bg-white/10"
                >
                  Add demo capital
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-slate-400">Lender profile</p>
                  <p className="mt-2 text-sm text-white">{state.lenderProfile.fullName}</p>
                  <p className="mt-1 text-xs text-slate-300">{state.lenderProfile.reputation}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-slate-400">Pool wallet</p>
                  <p className="mt-2 font-mono text-xs text-white">{state.lenderProfile.wallet}</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                <p>Available to withdraw later: {formatMoney(state.earnings)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => withdrawEarnings(Math.min(1000, state.earnings))}
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-100 transition hover:bg-white/10"
                  >
                    Withdraw earnings
                  </button>
                  {publicKey && (
                    <button
                      onClick={handleTrustline}
                      className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-100 transition hover:bg-white/10"
                    >
                      Add USDC trustline
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Current loan spotlight</p>
              {selectedLoan ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-semibold text-white">{selectedLoan.storeName}</h3>
                        <p className="mt-1 text-sm text-slate-300">{selectedLoan.inventoryNeed}</p>
                      </div>
                      <StatusPill status={selectedLoan.status} />
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-3">
                        <p className="text-xs text-slate-400">Requested</p>
                        <p className="mt-1 text-lg font-semibold text-white">{formatMoney(selectedLoan.amountRequested)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-3">
                        <p className="text-xs text-slate-400">Remaining</p>
                        <p className="mt-1 text-lg font-semibold text-white">{formatMoney(loanOutstanding(selectedLoan))}</p>
                      </div>
                    </div>

                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500"
                        style={{ width: `${loanProgress(selectedLoan)}%` }}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                      <span>{loanProgress(selectedLoan)}% repaid</span>
                      <span>Daily repayment: {formatMoney(selectedLoan.dailyRepayment)}</span>
                      <span>Estimated total due: {formatMoney(monthlyProjection(selectedLoan))}</span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      onClick={() => handleDemoFunding(selectedLoan.id)}
                      className={primaryButton}
                    >
                      Demo fund loan
                    </button>
                    {selectedLoan.status !== 'Requested' && (
                      <button
                        onClick={() => handleDemoRepayment(selectedLoan.id)}
                        className={secondaryButton}
                      >
                        Demo repayment
                      </button>
                    )}
                    <button
                      onClick={() => handleOnChainFunding(selectedLoan.id).catch((error) => setActionError(error instanceof Error ? error.message : 'Funding failed'))}
                      disabled={!publicKey || selectedLoan.status !== 'Requested'}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-300/20 px-4 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-300/10 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Fund with USDC on-chain
                    </button>
                    <button
                      onClick={() => handleOnChainRepayment(selectedLoan.id).catch((error) => setActionError(error instanceof Error ? error.message : 'Repayment failed'))}
                      disabled={!publicKey || selectedLoan.status === 'Requested' || !selectedLoan.lenderAddress}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-sky-300/20 px-4 py-3 text-sm font-semibold text-sky-50 transition hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Repay with USDC on-chain
                    </button>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Recent repayments</p>
                    <div className="mt-3 space-y-3">
                      {selectedLoan.repayments.length > 0 ? (
                        selectedLoan.repayments.map((repayment) => (
                          <div key={repayment.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-3">
                            <div>
                              <p className="text-white">{repayment.note}</p>
                              <p className="mt-1 text-xs text-slate-400">{repayment.date}</p>
                            </div>
                            <span className="font-semibold text-emerald-200">{formatMoney(repayment.amount)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-400">No repayments recorded yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-300">No loans yet. Create a request above to populate the marketplace.</p>
              )}
            </div>
          </div>
          )}
        </section>
        )}

        {showMarketplace && (
        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Marketplace</p>
              <h2 className="mt-1 font-[var(--font-display)] text-3xl text-white">Loan requests and active funding</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">
              Browse every request, open the detail panel, and move any loan through funding, repayment, or closure.
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {state.loans.map((loan) => {
              const progress = loanProgress(loan);
              const remaining = loanOutstanding(loan);

              return (
                <article
                  key={loan.id}
                  className={`rounded-2xl border p-5 transition ${loan.id === selectedLoan?.id ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{loan.barangay}</p>
                      <h3 className="mt-1 text-xl font-semibold text-white">{loan.storeName}</h3>
                      <p className="mt-1 text-sm text-slate-300">{loan.inventoryNeed}</p>
                    </div>
                    <StatusPill status={loan.status} />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-3">
                      <p className="text-xs text-slate-400">Requested</p>
                      <p className="mt-1 text-lg font-semibold text-white">{formatMoney(loan.amountRequested)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-3">
                      <p className="text-xs text-slate-400">Remaining</p>
                      <p className="mt-1 text-lg font-semibold text-white">{formatMoney(remaining)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-3">
                      <p className="text-xs text-slate-400">Progress</p>
                      <p className="mt-1 text-lg font-semibold text-white">{progress}%</p>
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
                    <button onClick={() => setSelectedLoanId(loan.id)} className="rounded-xl border border-white/10 px-3 py-1.5 transition hover:bg-white/10">
                      View details
                    </button>
                    {loan.status === 'Requested' && (
                      <button
                        onClick={() => handleDemoFunding(loan.id)}
                        className="rounded-xl border border-emerald-300/20 px-3 py-1.5 text-emerald-100 transition hover:bg-emerald-300/10"
                      >
                        Demo fund
                      </button>
                    )}
                    {loan.status !== 'Completed' && loan.status !== 'Requested' && (
                      <button
                        onClick={() => handleDemoRepayment(loan.id)}
                        className="rounded-xl border border-sky-300/20 px-3 py-1.5 text-sky-100 transition hover:bg-sky-300/10"
                      >
                        Demo repay
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        )}

        {showLoanDetail && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.07] p-6 backdrop-blur-xl sm:p-8">
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Loan detail page</p>
              <h2 className="mt-2 text-3xl font-semibold text-white">{selectedLoan?.storeName ?? 'Loan unavailable'}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                This view is the same detail screen that the dedicated loan route uses, with the repayment trail and Stellar hashes attached.
              </p>
            </div>

            {selectedLoan && (
              <div className="lg:col-span-2 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Loan summary</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                    <p>Owner: {selectedLoan.ownerName}</p>
                    <p>Lender: {selectedLoan.lenderName}</p>
                    <p>Expected return: {formatMoney(monthlyProjection(selectedLoan))}</p>
                    <p>Days remaining: {selectedLoan.daysRemaining}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Stellar hashes</p>
                  <div className="mt-3 space-y-2 text-xs text-slate-300">
                    <p>Loan funding: {selectedLoan.usdcTxHash ?? 'demo funding only'}</p>
                    <p>Contract event: {selectedLoan.contractTxHash ?? 'demo contract only'}</p>
                    <p>Owner address: {formatAddress(selectedLoan.ownerAddress)}</p>
                    <p>Lender address: {selectedLoan.lenderAddress ? formatAddress(selectedLoan.lenderAddress) : 'Open marketplace'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
        )}
      </div>
    </main>
  );
}
