# TingiFi

TingiFi is a demo-ready Stellar MVP for community-funded sari-sari store loans.
Store owners request short-term **USDC** financing, lenders fund the request on
Stellar testnet, and repayments flow back in small daily amounts that are easy to
explain in a live demo.

The workspace includes:

- A **Next.js + Tailwind** frontend in `web/` with landing, store-owner, lender,
  marketplace, and loan detail pages.
- A **Soroban loan ledger** in `contracts/savings-goal/` that records create,
  fund, repay, and close lifecycle events.
- Stellar testnet helpers for Freighter, Friendbot, balances, trustlines, and
  USDC payments.

```
.
├── web/                      # Next.js 16 + TypeScript + Tailwind frontend
├── contracts/savings-goal/   # Rust Soroban contract (init / contribute / get_state)
├── scripts/                  # deploy.ps1 (Windows) / deploy.sh
├── Cargo.toml                # Rust workspace
└── CLAUDE.md                 # stack notes + Stellar gotchas (read this!)
```

## Prerequisites

From the [workshop setup checklist](https://stellar-pup-qc-may-2026-checklist.vercel.app/):

- **Node.js 20+** and **npm** — for the frontend.
- **Freighter** browser extension — create a wallet, switch it to **Test Net**.
- For the contract track: **Rust**, the `wasm32v1-none` target, and the **Stellar CLI**.

You can run the **payments demo with just Node + Freighter** — Rust/CLI are only
needed to deploy the Soroban contract.

### Install the contract toolchain (Windows)

Install Rust and the Stellar CLI:

```powershell
winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
winget install --id Stellar.StellarCLI -e --accept-source-agreements --accept-package-agreements
```

Then **open a new terminal** (so `cargo`/`stellar` land on PATH) and give Rust a
working linker — pick one:

**Easiest — GNU toolchain** (no admin, no large download):

```powershell
rustup default stable-x86_64-pc-windows-gnu
rustup target add wasm32v1-none
```

**Or MSVC** (matches Stellar's docs): install the **Visual C++ Build Tools** (the
"Desktop development with C++" workload), then:

```powershell
rustup target add wasm32v1-none
```

> If `cargo` fails with *"linker `link.exe` not found"*, you skipped the step
> above — use the GNU toolchain or install the Build Tools.

On macOS/Linux: install Rust from <https://rustup.rs>, run
`rustup target add wasm32v1-none`, and install the Stellar CLI
(`brew install stellar-cli`).

## 1. Run the frontend (the part that demos immediately)

```powershell
cd web
npm install        # already run if you scaffolded via this repo
npm run dev
```

Open <http://localhost:3000>, then:

1. **Connect Freighter** (approve in the extension; make sure it's on Test Net).
2. **Fund with Friendbot** — your XLM balance jumps to ~10,000.
3. **Send a payment** to another *existing, funded* testnet account
   (create one at <https://laboratory.stellar.org/#account-creator?network=test>).
4. Watch the status go Building → Signing → Submitting → Confirming → Success,
   then open the **Stellar Expert** link to see it on-chain.

`web/.env.local` is pre-filled with testnet config. `NEXT_PUBLIC_CONTRACT_ID` is
left empty — the Savings Goal panel shows deploy instructions until you set it.

## 2. Build, test & deploy the Soroban contract

```powershell
# from the repo root
cargo test                 # runs the contract unit tests (no network needed)

# deploy to testnet + auto-wire the contract ID into web/.env.local
.\scripts\deploy.ps1       # macOS/Linux:  ./scripts/deploy.sh
```

The deploy script will: create+fund a testnet identity (if needed), run
`stellar contract build`, deploy, initialise the goal (target `1000`), and write
`NEXT_PUBLIC_CONTRACT_ID` into `web/.env.local`. **Restart `npm run dev`** and the
**Savings Goal** panel goes live: it reads on-chain progress and lets a connected
wallet `contribute` (a real signed Soroban transaction).

### The contract (`contracts/savings-goal/src/lib.rs`)

| Function | Purpose |
|---|---|
| `init(target: i128)` | Set the savings target (once). |
| `contribute(amount: i128) -> i128` | Add to the saved total; returns the new total. |
| `get_state() -> State` | Read `{ saved, target }`. |

It uses plain integer state (no token transfers) so it's bulletproof in a live
demo. To make it move real money, swap `contribute` to call the XLM/USDC SAC
`transfer` and store per-user contributions — see CLAUDE.md for the SAC addresses.

## 3. Make it your idea

This build is intentionally simple so it can be demoed without extra infrastructure.
If you want to extend it, the natural next steps are a real Express + PostgreSQL
backend, Soroban contract wiring for the lifecycle buttons, and production wallet
support beyond Freighter.

For a fully worked example built on this scaffold, see the **Paluwagan** app in
`..\Stellar-Workshop-PUP-May-2026-EXAMPLE`.

## Troubleshooting

- **Freighter "not detected"** — install it, reload the page, and confirm it's unlocked.
- **Payment fails `op_no_destination`** — fund the destination account first.
- **`tx_bad_auth`** — wrong network passphrase; this app uses `Networks.TESTNET`.
- **Contract panel can't read state** — make sure you deployed *and* ran `init`,
  and that `NEXT_PUBLIC_CONTRACT_ID` is set, then restart the dev server.

See **CLAUDE.md** for the full list of Stellar gotchas.
