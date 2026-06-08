export type LoanStatus = 'Requested' | 'Funded' | 'Repaying' | 'Completed';
export type UserRole = 'store-owner' | 'lender';

export interface RepaymentEvent {
  id: string;
  date: string;
  amount: number;
  txHash?: string;
  note: string;
}

export interface LoanRequest {
  id: string;
  storeName: string;
  ownerName: string;
  ownerAddress: string;
  lenderName: string;
  lenderAddress: string;
  barangay: string;
  inventoryNeed: string;
  amountRequested: number;
  amountFunded: number;
  amountRepaid: number;
  dailyRepayment: number;
  interestRate: number;
  termDays: number;
  daysRemaining: number;
  status: LoanStatus;
  narrative: string;
  usdcTxHash?: string;
  contractTxHash?: string;
  repayments: RepaymentEvent[];
}

export interface TingiFiState {
  marketCapital: number;
  lenderPool: number;
  earnings: number;
  ownerProfile: {
    fullName: string;
    storeName: string;
    barangay: string;
    target: string;
  };
  lenderProfile: {
    fullName: string;
    wallet: string;
    reputation: string;
  };
  loans: LoanRequest[];
}

export const TINGIFI_STORAGE_KEY = 'tingifi-demo-state';

export const demoState: TingiFiState = {
  marketCapital: 185000,
  lenderPool: 82000,
  earnings: 4250,
  ownerProfile: {
    fullName: 'Maria Santos',
    storeName: 'Sari-Sari ni Maria',
    barangay: 'Brgy. Commonwealth, Quezon City',
    target: 'Expand dry goods inventory before payday rush',
  },
  lenderProfile: {
    fullName: 'Bayanihan Lenders Club',
    wallet: 'community.pool@tingifi',
    reputation: '15 active micro-loans',
  },
  loans: [
    {
      id: 'tg-1001',
      storeName: 'Sari-Sari ni Maria',
      ownerName: 'Maria Santos',
      ownerAddress: 'GABCDN7K3N4Q2Q4V7QW2R2T4T5A3K2W3X7L2VQF3P5F4R2P6M6K3Q',
      lenderName: 'Bayanihan Lenders Club',
      lenderAddress: 'GBLENDERCLUBDEMOADDRESS0000000000000000000000000000',
      barangay: 'Brgy. Commonwealth',
      inventoryNeed: 'Bulk sachets, noodles, canned goods, rice',
      amountRequested: 12000,
      amountFunded: 12000,
      amountRepaid: 6800,
      dailyRepayment: 400,
      interestRate: 0.08,
      termDays: 30,
      daysRemaining: 13,
      status: 'Repaying',
      narrative:
        'Funds were used to buy inventory at wholesale pricing. Daily sales now cover a small repayment cycle.',
      usdcTxHash: 'demo-usdc-funding-9fd812',
      contractTxHash: 'demo-contract-create-9fd812',
      repayments: [
        {
          id: 'rep-1',
          date: '2026-06-04',
          amount: 400,
          note: 'Rice sales from the morning rush',
        },
        {
          id: 'rep-2',
          date: '2026-06-05',
          amount: 400,
          note: 'School snack sales',
        },
        {
          id: 'rep-3',
          date: '2026-06-06',
          amount: 400,
          note: 'Barangay payday repayment',
        },
      ],
    },
    {
      id: 'tg-1002',
      storeName: 'Aling Tess Mini Mart',
      ownerName: 'Teresa Cruz',
      ownerAddress: 'GATESS2STOREOWNERDEMOADDRESS000000000000000000000',
      lenderName: 'Haraya Collective',
      lenderAddress: 'GBHARAYACOLLECTIVEDEMOADDRESS000000000000000000000',
      barangay: 'Brgy. San Isidro',
      inventoryNeed: 'Cold drinks and merienda stock for weekend demand',
      amountRequested: 6000,
      amountFunded: 6000,
      amountRepaid: 6480,
      dailyRepayment: 216,
      interestRate: 0.08,
      termDays: 28,
      daysRemaining: 0,
      status: 'Completed',
      narrative:
        'This loan is fully settled. The lender recovered principal plus interest from daily USDC repayments.',
      usdcTxHash: 'demo-usdc-funding-2b18ca',
      contractTxHash: 'demo-contract-close-2b18ca',
      repayments: [
        {
          id: 'rep-1',
          date: '2026-05-16',
          amount: 2160,
          note: 'Soft drinks and chip sales',
        },
        {
          id: 'rep-2',
          date: '2026-05-17',
          amount: 2160,
          note: 'Weekend foot traffic',
        },
        {
          id: 'rep-3',
          date: '2026-05-18',
          amount: 2160,
          note: 'Final settlement',
        },
      ],
    },
  ],
};

export function loanOutstanding(loan: LoanRequest): number {
  const totalDue = monthlyProjection(loan);
  return Math.max(0, totalDue - loan.amountRepaid);
}

export function loanProgress(loan: LoanRequest): number {
  const totalDue = monthlyProjection(loan);
  if (totalDue <= 0) return 0;
  return Math.min(100, Math.round((loan.amountRepaid / totalDue) * 100));
}

export function monthlyProjection(loan: LoanRequest): number {
  return Math.round(loan.amountRequested * (1 + loan.interestRate));
}

export function loanTotalDue(loan: LoanRequest): number {
  return monthlyProjection(loan);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
