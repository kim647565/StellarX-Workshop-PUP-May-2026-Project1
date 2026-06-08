import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Account,
  rpc,
  nativeToScVal,
  scValToNative,
  Operation,
  Asset,
} from '@stellar/stellar-sdk';
import { server, NETWORK_PASSPHRASE, CONTRACT_ID, USDC_ISSUER } from './stellar';

// A real, funded testnet account used ONLY as the source for read-only
// simulations. Nothing is signed or submitted for reads, so any existing
// account works — we reuse the Circle USDC issuer.
const READ_SOURCE = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

export type LoanStatus = 'Requested' | 'Funded' | 'Repaying' | 'Completed';

export interface LoanState {
  borrower: string;
  lender: string;
  principal: number;
  interestBps: number;
  repaid: number;
  expectedTotal: number;
  termDays: number;
  status: LoanStatus;
}

export function contractConfigured(): boolean {
  return Boolean(CONTRACT_ID);
}

/** Read get_loan() via simulation — no wallet or signature required. */
export async function readLoanState(loanId: string): Promise<LoanState | null> {
  const contract = new Contract(CONTRACT_ID);
  const source = new Account(READ_SOURCE, '0');

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('get_loan', nativeToScVal(loanId)))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    return null;
  }

  const loan = scValToNative(sim.result.retval) as {
    borrower: string;
    lender: string;
    principal: bigint;
    interest_bps?: number;
    interestBps?: number;
    repaid: bigint;
    expected_total?: bigint;
    expectedTotal?: bigint;
    term_days?: number;
    termDays?: number;
    status: LoanStatus;
  };

  return {
    borrower: loan.borrower,
    lender: loan.lender,
    principal: Number(loan.principal),
    interestBps: Number(loan.interestBps ?? loan.interest_bps ?? 0),
    repaid: Number(loan.repaid),
    expectedTotal: Number(loan.expectedTotal ?? loan.expected_total ?? 0),
    termDays: Number(loan.termDays ?? loan.term_days ?? 0),
    status: loan.status,
  };
}

async function buildContractXDR(
  sender: string,
  method: 'create_loan' | 'fund_loan' | 'repay_loan' | 'close_loan',
  args: unknown[],
): Promise<string> {
  const contract = new Contract(CONTRACT_ID);
  const account = await server.getAccount(sender);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        method,
        ...args.map((value) =>
          typeof value === 'bigint'
            ? nativeToScVal(value, { type: 'i128' })
            : nativeToScVal(value),
        ),
      ),
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`Simulation failed — the ${method} call would not succeed.`);
  }

  return rpc.assembleTransaction(tx, sim).build().toXDR();
}

export function buildCreateLoanXDR(
  sender: string,
  loanId: string,
  borrower: string,
  principal: number,
  interestBps: number,
  termDays: number,
): Promise<string> {
  return buildContractXDR(sender, 'create_loan', [
    loanId,
    borrower,
    BigInt(Math.trunc(principal)),
    interestBps,
    termDays,
  ]);
}

export function buildFundLoanXDR(sender: string, loanId: string, lender: string): Promise<string> {
  return buildContractXDR(sender, 'fund_loan', [loanId, lender]);
}

export async function buildAtomicFundXDR(
  sender: string,
  loanId: string,
  destination: string,
  amount: string,
): Promise<string> {
  const contract = new Contract(CONTRACT_ID);
  const account = await server.getAccount(sender);
  const asset = new Asset('USDC', USDC_ISSUER);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.payment({ destination, asset, amount }))
    .addOperation(contract.call('fund_loan', nativeToScVal(loanId), nativeToScVal(sender)))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`Simulation failed — atomic funding would not succeed.`);
  }

  return rpc.assembleTransaction(tx, sim).build().toXDR();
}

export async function buildAtomicRepayXDR(
  sender: string,
  loanId: string,
  destination: string,
  amount: string,
): Promise<string> {
  const contract = new Contract(CONTRACT_ID);
  const account = await server.getAccount(sender);
  const asset = new Asset('USDC', USDC_ISSUER);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.payment({ destination, asset, amount }))
    .addOperation(contract.call('repay_loan', nativeToScVal(loanId), nativeToScVal(BigInt(Math.trunc(Number(amount))), { type: 'i128' })))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`Simulation failed — atomic repayment would not succeed.`);
  }

  return rpc.assembleTransaction(tx, sim).build().toXDR();
}

export function buildRepayLoanXDR(
  sender: string,
  loanId: string,
  amount: number,
): Promise<string> {
  return buildContractXDR(sender, 'repay_loan', [loanId, BigInt(Math.trunc(amount))]);
}

export function buildCloseLoanXDR(sender: string, loanId: string): Promise<string> {
  return buildContractXDR(sender, 'close_loan', [loanId]);
}
