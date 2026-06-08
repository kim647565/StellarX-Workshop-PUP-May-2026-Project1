#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup(env: &Env) -> TingiFiLoanContractClient {
    let contract_id = env.register(TingiFiLoanContract, ());
    TingiFiLoanContractClient::new(env, &contract_id)
}

#[test]
fn create_fund_repay_and_close_loan() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);
    let loan_id = String::from_str(&env, "loan-001");
    let borrower = Address::generate(&env);
    let lender = Address::generate(&env);

    let loan = client.create_loan(&loan_id, &borrower, &1000, &800, &30);
    assert_eq!(loan.principal, 1000);
    assert_eq!(loan.expected_total, 1080);
    assert!(matches!(loan.status, LoanStatus::Requested));

    let funded = client.fund_loan(&loan_id, &lender);
    assert!(matches!(funded.status, LoanStatus::Funded));
    assert_eq!(funded.lender, Some(lender));

    let first_repayment = client.repay_loan(&loan_id, &400);
    assert!(matches!(first_repayment.status, LoanStatus::Repaying));
    assert_eq!(first_repayment.repaid, 400);

    let second_repayment = client.repay_loan(&loan_id, &680);
    assert!(matches!(second_repayment.status, LoanStatus::Completed));
    assert_eq!(second_repayment.repaid, 1080);

    let closed = client.close_loan(&loan_id);
    assert!(matches!(closed.status, LoanStatus::Completed));
}

#[test]
fn get_loan_before_create_returns_none() {
    let env = Env::default();
    let client = setup(&env);
    let loan_id = String::from_str(&env, "missing");
    assert!(client.get_loan(&loan_id).is_none());
}

#[test]
fn double_create_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);
    let loan_id = String::from_str(&env, "loan-001");
    let borrower = Address::generate(&env);

    client.create_loan(&loan_id, &borrower, &1000, &500, &30);
    assert_eq!(client.try_create_loan(&loan_id, &borrower, &1000, &500, &30), Err(Ok(Error::LoanExists)));
}

#[test]
fn funding_unknown_loan_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);
    let loan_id = String::from_str(&env, "missing");
    let lender = Address::generate(&env);
    assert_eq!(client.try_fund_loan(&loan_id, &lender), Err(Ok(Error::LoanNotFound)));
}

#[test]
fn repay_before_fund_or_with_zero_amount_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);
    let loan_id = String::from_str(&env, "loan-001");
    let borrower = Address::generate(&env);

    client.create_loan(&loan_id, &borrower, &1000, &500, &30);

    assert_eq!(client.try_repay_loan(&loan_id, &0), Err(Ok(Error::InvalidAmount)));
    assert_eq!(client.try_repay_loan(&loan_id, &100), Err(Ok(Error::InvalidState)));
}
