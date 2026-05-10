# Speak402

**Voice-controlled x402 payments with wallet-owned spending limits on Solana.**

Speak402 is a multilingual ElevenLabs voice agent that lets users purchase x402-protected APIs and paid digital resources on Solana, governed by on-chain spending policies written in Rust/Anchor.

## Solana Devnet Program

| Item | Value |
|------|-------|
| **Program ID** | `CQMQ2Z26ueLm7hNa2rFGADtdLhURSN9MfcUTDqCjkni4` |
| **Network** | Solana Devnet |
| **USDC Mint** | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Devnet USDC) |
| **Framework** | Anchor 0.30 |

---

## Why Solana?

- **Sub-second finality** — voice-agent payments need instant confirmation.
- **Low fees** — micropayments (e.g. $0.25 for a weather report) are viable.
- **Program-controlled escrow** — PDA-based token vaults enforce spending caps entirely on-chain, without a custodial backend.
- **SPL Token standard** — native Devnet USDC support, no bridging required.

---

## How ElevenLabs Is Integrated

Speak402 uses ElevenLabs as the primary interaction layer:

| Capability | Integration |
|------------|-------------|
| **Deploy Agents** | ElevenLabs Conversational AI agent with custom system prompt for x402 payment flows |
| **Transcribe Speech** | Real-time speech-to-text via the ElevenLabs WebSocket client |
| **Generate Speech** | Agent responses are spoken aloud with ElevenLabs text-to-speech |

**Agent behavior:**
1. Greets the user and asks what paid resource they want to buy.
2. Calls `quotePaidResource` to fetch the 402 quote.
3. Reads back: merchant, resource, amount, per-request cap, remaining daily allowance.
4. Waits for explicit user confirmation before proceeding.
5. After payment, reads the unlocked report summary aloud.

If ElevenLabs credentials are not configured, the app falls back to a text-based simulation mode (clearly labeled).

---

## How x402 Is Integrated

The x402 protocol defines a payment-required resource pattern:

1. **402 Response** — The Weather Risk Oracle returns a `402 Payment Required` response containing:
   - `merchant`: Weather Risk Oracle
   - `resource`: Mumbai Weather Risk Report
   - `amount`: 0.25 USDC
   - `network`: Solana Devnet
   - `token`: USDC
   - `mint`: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

2. **On-chain payment** — The Solana program validates the spending policy and transfers USDC from escrow to the merchant, creating a `MerchantReceipt` PDA.

3. **Resource unlock** — The merchant verifies the on-chain receipt and returns the paid report data.

---

## Solana Program Overview

**Program name:** `speak402_policy`

### Accounts
- **PolicyAccount** (PDA: `["policy", owner]`) — Per-user spending policy with caps, merchant restriction, expiry
- **EscrowVault** (PDA: `["escrow", policy]`) — SPL token account holding deposited USDC
- **MerchantReceipt** (PDA: `["receipt", policy, receipt_id]`) — Immutable payment receipt

### Instructions
| Instruction | Description |
|-------------|-------------|
| `initialize_config` | Create policy with per-request cap, daily cap, allowed merchant hash, expiry |
| `deposit` | Transfer USDC from user wallet into escrow vault |
| `authorize_payment` | Validate policy rules, transfer from escrow, create receipt |
| `mark_fulfilled` | Mark receipt as fulfilled after resource delivery |
| `revoke_policy` | Revoke policy and return remaining escrow to owner |

### Error Codes
`Unauthorized` · `PolicyRevoked` · `PolicyExpired` · `MerchantNotAllowed` · `PerRequestCapExceeded` · `DailyCapExceeded` · `InsufficientEscrow` · `ZeroDeposit` · `AlreadyFulfilled` · `MathOverflow` · `InvalidMint` · `InvalidEscrow`

---

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_PROGRAM_ID=CQMQ2Z26ueLm7hNa2rFGADtdLhURSN9MfcUTDqCjkni4
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_DEVNET_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
VITE_ELEVENLABS_AGENT_ID=agent_3501kr720w64f2mrb6rhhxant3dh
```

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_PROGRAM_ID` | Yes | Deployed Anchor program ID |
| `VITE_SOLANA_RPC_URL` | No | Defaults to Devnet RPC |
| `VITE_DEVNET_USDC_MINT` | No | Defaults to Circle Devnet USDC |
| `VITE_ELEVENLABS_AGENT_ID` | No | Enables real ElevenLabs agent mode; falls back to simulation mode when absent |

Do not put an ElevenLabs API key in a `VITE_` variable. `VITE_` variables are bundled into the browser. Speak402's browser voice session uses the public ElevenLabs Agent ID.

---

## Getting Devnet USDC

To test with real Devnet USDC payments:

1. **Get Devnet SOL** — Visit [faucet.solana.com](https://faucet.solana.com) and request airdrop to your wallet.
2. **Get Devnet USDC** — Visit [faucet.circle.com](https://faucet.circle.com/) and request USDC on Solana Devnet.
3. The app will show your wallet USDC balance in the status bar.
4. If no USDC is detected, the Spending Policy panel shows a funding guide.

If Devnet USDC setup is not possible, the app falls back to **Mock Demo Mode** (clearly labeled in the header).

---

## Local Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app runs at `http://localhost:5173`.

---

## Demo Script (Under 3 Minutes)

| Time | Action |
|------|--------|
| 0:00 | Open app. Point out "Real Devnet USDC" badge and network indicator. |
| 0:15 | Connect Phantom wallet. Show wallet USDC balance in status bar. |
| 0:30 | **Create Spending Policy:** $1 per-request cap, $5 daily cap, `oracle.speak402.demo` merchant, 24h expiry. Click "Create Policy." Show the on-chain PDA. |
| 0:50 | **Deposit USDC:** Enter 10 USDC, click Deposit. Show escrow balance update. |
| 1:10 | **Start Voice Session.** Say or type: "List x402 services." |
| 1:30 | Ask: "Buy the Mumbai weather risk report." Agent quotes merchant, resource, amount, and remaining allowance. |
| 1:45 | **Confirm:** "Yes, authorize." Click Confirm & Pay if needed. |
| 2:00 | Show on-chain tx signature in toast. Show full clickable receipt and tx links in Receipts panel. |
| 2:15 | **Paid report unlocks:** Risk score, summary, recommended action appear. Agent reads summary aloud or text fallback shows it. |
| 2:45 | Explain: "All policy enforcement is on-chain. No backend can override the caps." |

---

## Testing

The Solana program includes 13 passing tests:

- Initialize policy succeeds
- Deposit succeeds
- Authorize payment succeeds within cap
- Reject payment above per-request cap
- Reject payment above daily cap
- Reject wrong merchant hash
- Reject expired policy
- Reject revoked policy
- Reject non-owner authorization
- Receipt is created and can be marked fulfilled
- Zero deposit rejected
- Math overflow safety
- Insufficient escrow rejected

---

## Security Notes

- **Checked arithmetic** — All on-chain math uses `checked_add`/`checked_sub` to prevent overflow.
- **PDA authority** — Escrow vault is owned by a program-derived address; only the program can transfer out.
- **Owner-only** — Only the policy owner can authorize payments, deposit, or revoke.
- **Merchant restriction** — Payment is rejected if the merchant hash does not match the policy.
- **Daily reset** — `spent_today` resets after 86400 seconds from `reset_timestamp`.
- **Explicit confirmation** — The voice agent always reads back the full quote and waits for confirmation before preparing any transaction.
- **No hardcoded keys** — All API keys and program IDs are loaded from environment variables.

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────────���─┐
│  ElevenLabs │     │  React Frontend  │     │  Solana Devnet      │
│  Voice Agent│◄───►│                  │◄───►│                     │
│             │     │  useSpeak402()   │     │  speak402_policy    │
│  STT / TTS  │     │  useVoiceAgent() │     │  PolicyAccount PDA  │
└─────────────┘     │  speak402SDK.ts  │     │  EscrowVault PDA    │
                    │                  │     │  MerchantReceipt    │
                    │  x402 quote/pay  │     │                     │
                    └──────────────────┘     └─────────────────────┘
```

---

## Hackathon Qualification Checklist

- [x] **Solana integration** — Anchor program deployed on Devnet with real USDC
- [x] **ElevenLabs integration** — Conversational AI agent with STT/TTS
- [x] **x402 payment flow** — 402 Payment Required → on-chain payment → resource unlock
- [x] **On-chain spending policy** — Per-request cap, daily cap, merchant restriction, expiry
- [x] **Wallet connection** — Phantom / Solana wallet adapter
- [x] **Demo-ready** — 3-minute demo script with clear happy path
- [x] **Open source** — Full source code with README

---

## License

MIT
