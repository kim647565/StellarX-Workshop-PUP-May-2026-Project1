#![no_std]
//! TingiFi loan ledger — a tiny Soroban contract for the demo loan lifecycle.
//!
//! The contract records loan requests, funding, repayments, and closure.
//! Token transfers still happen in the frontend so the contract stays small,
//! deterministic, and easy to explain in a demo.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String};

/// Loan lifecycle states mirrored by the demo UI.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LoanStatus {
    Requested,
    Funded,
    Repaying,
    Completed,
}

/// Full loan record stored in instance storage.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LoanRecord {
    pub borrower: Address,
    pub lender: Option<Address>,
    pub principal: i128,
    pub interest_bps: u32,
    pub repaid: i128,
    pub expected_total: i128,
    pub term_days: u32,
    pub status: LoanStatus,
}

/// Keys for the contract's instance storage.
#[contracttype]
pub enum DataKey {
    Loan(String),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    LoanExists = 2,
    LoanNotFound = 3,
    InvalidState = 4,
}

#[contract]
pub struct TingiFiLoanContract;

#[contractimpl]
impl TingiFiLoanContract {
    fn loan_key(loan_id: &String) -> DataKey {
        DataKey::Loan(loan_id.clone())
    }

    fn expected_total(principal: i128, interest_bps: u32) -> i128 {
        principal + (principal * interest_bps as i128 / 10_000)
    }

    fn load_loan(env: &Env, loan_id: &String) -> Result<LoanRecord, Error> {
        env.storage()
            .instance()
            .get(&Self::loan_key(loan_id))
            .ok_or(Error::LoanNotFound)
    }

    fn save_loan(env: &Env, loan_id: &String, loan: &LoanRecord) {
        env.storage().instance().set(&Self::loan_key(loan_id), loan);
        env.storage().instance().extend_ttl(1000, 5000);
    }

    /// Create a loan request and store its repayment terms.
    pub fn create_loan(
        env: Env,
        loan_id: String,
        borrower: Address,
        principal: i128,
        interest_bps: u32,
        term_days: u32,
    ) -> Result<LoanRecord, Error> {
        borrower.require_auth();

        if principal <= 0 || term_days == 0 {
            return Err(Error::InvalidAmount);
        }

        if env.storage().instance().has(&Self::loan_key(&loan_id)) {
            return Err(Error::LoanExists);
        }

        let loan = LoanRecord {
            borrower,
            lender: None,
            principal,
            interest_bps,
            repaid: 0,
            expected_total: Self::expected_total(principal, interest_bps),
            term_days,
            status: LoanStatus::Requested,
        };

        Self::save_loan(&env, &loan_id, &loan);
        Ok(loan)
    }

    /// Mark an existing request as funded.
    pub fn fund_loan(env: Env, loan_id: String, lender: Address) -> Result<LoanRecord, Error> {
        lender.require_auth();

        let mut loan = Self::load_loan(&env, &loan_id)?;
        if !matches!(loan.status, LoanStatus::Requested) {
            return Err(Error::InvalidState);
        }

        loan.lender = Some(lender);
        loan.status = LoanStatus::Funded;
        Self::save_loan(&env, &loan_id, &loan);
        Ok(loan)
    }

    /// Add a repayment and close the loan once the expected total is reached.
    pub fn repay_loan(env: Env, loan_id: String, amount: i128) -> Result<LoanRecord, Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let mut loan = Self::load_loan(&env, &loan_id)?;
        
        loan.borrower.require_auth();

        if matches!(loan.status, LoanStatus::Requested | LoanStatus::Completed) {
            return Err(Error::InvalidState);
        }

        loan.repaid = core::cmp::min(loan.expected_total, loan.repaid + amount);
        loan.status = if loan.repaid >= loan.expected_total {
            LoanStatus::Completed
        } else {
            LoanStatus::Repaying
        };

        Self::save_loan(&env, &loan_id, &loan);
        Ok(loan)
    }

    /// Close a loan after the expected total has been repaid.
    pub fn close_loan(env: Env, loan_id: String) -> Result<LoanRecord, Error> {
        let mut loan = Self::load_loan(&env, &loan_id)?;
        
        // Either borrower or lender can close once fully repaid.
        // For the demo, we'll require the borrower's signature to finalize.
        loan.borrower.require_auth();

        if loan.repaid < loan.expected_total {
            return Err(Error::InvalidState);
        }

        loan.status = LoanStatus::Completed;
        Self::save_loan(&env, &loan_id, &loan);
        Ok(loan)
    }

    /// Fetch a loan record. Returns `None` when the request does not exist.
    pub fn get_loan(env: Env, loan_id: String) -> Option<LoanRecord> {
        env.storage().instance().get(&Self::loan_key(&loan_id))
    }
}

mod test;
