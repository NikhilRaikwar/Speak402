use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("CQMQ2Z26ueLm7hNa2rFGADtdLhURSN9MfcUTDqCjkni4");

#[program]
pub mod workspace {
    use super::*;

    // per_request_cap: u64, Maximum tokens per single payment, 1000000 = 1 USDC
    // daily_cap: u64, Maximum tokens spendable per day, 10000000 = 10 USDC
    // allowed_merchant_hash: [u8; 32], SHA-256 hash of allowed merchant identity, [0u8; 32]
    // expires_at: i64, Unix timestamp when policy expires, 1735689600
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        per_request_cap: u64,
        daily_cap: u64,
        allowed_merchant_hash: [u8; 32],
        expires_at: i64,
    ) -> Result<()> {
        let policy = &mut ctx.accounts.policy_account;
        policy.owner = ctx.accounts.owner.key();
        policy.escrow_vault = ctx.accounts.escrow_vault.key();
        policy.mock_usdc_mint = ctx.accounts.mock_usdc_mint.key();
        policy.per_request_cap = per_request_cap;
        policy.daily_cap = daily_cap;
        policy.spent_today = 0;
        policy.reset_timestamp = Clock::get()?.unix_timestamp;
        policy.allowed_merchant_hash = allowed_merchant_hash;
        policy.expires_at = expires_at;
        policy.bump = ctx.bumps.policy_account;
        policy.revoked = false;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::ZeroDeposit);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.escrow_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

        Ok(())
    }

    pub fn authorize_payment(
        ctx: Context<AuthorizePayment>,
        merchant_hash: [u8; 32],
        resource_hash: [u8; 32],
        amount: u64,
        _receipt_id: u64,
    ) -> Result<()> {
        let policy = &ctx.accounts.policy_account;
        let now = Clock::get()?.unix_timestamp;

        require!(!policy.revoked, ErrorCode::PolicyRevoked);
        require!(now <= policy.expires_at, ErrorCode::PolicyExpired);
        require!(
            merchant_hash == policy.allowed_merchant_hash,
            ErrorCode::MerchantNotAllowed
        );
        require!(amount <= policy.per_request_cap, ErrorCode::PerRequestCapExceeded);

        let escrow_balance = ctx.accounts.escrow_vault.amount;
        require!(escrow_balance >= amount, ErrorCode::InsufficientEscrow);

        let policy_mut = &mut ctx.accounts.policy_account;

        let elapsed = now
            .checked_sub(policy_mut.reset_timestamp)
            .ok_or(ErrorCode::MathOverflow)?;
        if elapsed >= 86400 {
            policy_mut.spent_today = 0;
            policy_mut.reset_timestamp = now;
        }

        let new_spent = policy_mut
            .spent_today
            .checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        require!(new_spent <= policy_mut.daily_cap, ErrorCode::DailyCapExceeded);

        let owner_key = policy_mut.owner;

        let policy_key = policy_mut.key();
        let escrow_bump = ctx.bumps.escrow_vault;
        let escrow_bump_arr = [escrow_bump];
        let escrow_seeds = &[b"escrow" as &[u8], policy_key.as_ref(), &escrow_bump_arr];
        let escrow_signer: &[&[&[u8]]] = &[escrow_seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.merchant_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_vault.to_account_info(),
                },
                escrow_signer,
            ),
            amount,
        )?;

        policy_mut.spent_today = new_spent;

        let receipt = &mut ctx.accounts.receipt_account;
        receipt.policy = policy_key;
        receipt.owner = owner_key;
        receipt.merchant_hash = merchant_hash;
        receipt.resource_hash = resource_hash;
        receipt.amount = amount;
        receipt.timestamp = now;
        receipt.fulfilled = false;
        receipt.bump = ctx.bumps.receipt_account;

        Ok(())
    }

    pub fn mark_fulfilled(ctx: Context<MarkFulfilled>, _receipt_id: u64) -> Result<()> {
        let receipt = &mut ctx.accounts.receipt_account;
        require!(!receipt.fulfilled, ErrorCode::AlreadyFulfilled);
        receipt.fulfilled = true;
        Ok(())
    }

    pub fn revoke_policy(ctx: Context<RevokePolicy>) -> Result<()> {
        let policy = &mut ctx.accounts.policy_account;
        policy.revoked = true;

        let remaining = ctx.accounts.escrow_vault.amount;
        if remaining > 0 {
            let policy_key = policy.key();
            let escrow_bump = ctx.bumps.escrow_vault;
            let escrow_bump_arr = [escrow_bump];
            let escrow_seeds = &[b"escrow" as &[u8], policy_key.as_ref(), &escrow_bump_arr];
            let escrow_signer: &[&[&[u8]]] = &[escrow_seeds];

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_vault.to_account_info(),
                        to: ctx.accounts.owner_token_account.to_account_info(),
                        authority: ctx.accounts.escrow_vault.to_account_info(),
                    },
                    escrow_signer,
                ),
                remaining,
            )?;
        }

        Ok(())
    }
}

// ── Account Structs ──

#[account]
pub struct PolicyAccount {
    pub owner: Pubkey,
    pub escrow_vault: Pubkey,
    pub mock_usdc_mint: Pubkey,
    pub per_request_cap: u64,
    pub daily_cap: u64,
    pub spent_today: u64,
    pub reset_timestamp: i64,
    pub allowed_merchant_hash: [u8; 32],
    pub expires_at: i64,
    pub bump: u8,
    pub revoked: bool,
}

impl PolicyAccount {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 8 + 8 + 8 + 32 + 8 + 1 + 1;
}

#[account]
pub struct MerchantReceipt {
    pub policy: Pubkey,
    pub owner: Pubkey,
    pub merchant_hash: [u8; 32],
    pub resource_hash: [u8; 32],
    pub amount: u64,
    pub timestamp: i64,
    pub fulfilled: bool,
    pub bump: u8,
}

impl MerchantReceipt {
    pub const LEN: usize = 32 + 32 + 32 + 32 + 8 + 8 + 1 + 1;
}

// ── Context Structs ──

#[derive(Accounts)]
#[instruction(per_request_cap: u64, daily_cap: u64, allowed_merchant_hash: [u8; 32], expires_at: i64)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        seeds = [b"policy", owner.key().as_ref()],
        bump,
        payer = owner,
        space = 8 + PolicyAccount::LEN,
    )]
    pub policy_account: Account<'info, PolicyAccount>,

    #[account(
        init,
        seeds = [b"escrow", policy_account.key().as_ref()],
        bump,
        payer = owner,
        token::mint = mock_usdc_mint,
        token::authority = escrow_vault,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    pub mock_usdc_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"policy", owner.key().as_ref()],
        bump = policy_account.bump,
        constraint = policy_account.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub policy_account: Account<'info, PolicyAccount>,

    #[account(
        mut,
        constraint = user_token_account.mint == policy_account.mock_usdc_mint @ ErrorCode::InvalidMint,
        constraint = user_token_account.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"escrow", policy_account.key().as_ref()],
        bump,
        constraint = escrow_vault.key() == policy_account.escrow_vault @ ErrorCode::InvalidEscrow,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(merchant_hash: [u8; 32], resource_hash: [u8; 32], amount: u64, receipt_id: u64)]
pub struct AuthorizePayment<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"policy", owner.key().as_ref()],
        bump = policy_account.bump,
        constraint = policy_account.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub policy_account: Account<'info, PolicyAccount>,

    #[account(
        mut,
        seeds = [b"escrow", policy_account.key().as_ref()],
        bump,
        constraint = escrow_vault.key() == policy_account.escrow_vault @ ErrorCode::InvalidEscrow,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = merchant_token_account.mint == policy_account.mock_usdc_mint @ ErrorCode::InvalidMint,
    )]
    pub merchant_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        seeds = [b"receipt", policy_account.key().as_ref(), &receipt_id.to_le_bytes()],
        bump,
        payer = owner,
        space = 8 + MerchantReceipt::LEN,
    )]
    pub receipt_account: Account<'info, MerchantReceipt>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(receipt_id: u64)]
pub struct MarkFulfilled<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [b"policy", owner.key().as_ref()],
        bump = policy_account.bump,
        constraint = policy_account.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub policy_account: Account<'info, PolicyAccount>,

    #[account(
        mut,
        seeds = [b"receipt", policy_account.key().as_ref(), &receipt_id.to_le_bytes()],
        bump = receipt_account.bump,
        constraint = receipt_account.policy == policy_account.key() @ ErrorCode::Unauthorized,
    )]
    pub receipt_account: Account<'info, MerchantReceipt>,
}

#[derive(Accounts)]
pub struct RevokePolicy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"policy", owner.key().as_ref()],
        bump = policy_account.bump,
        constraint = policy_account.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub policy_account: Account<'info, PolicyAccount>,

    #[account(
        mut,
        seeds = [b"escrow", policy_account.key().as_ref()],
        bump,
        constraint = escrow_vault.key() == policy_account.escrow_vault @ ErrorCode::InvalidEscrow,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = owner_token_account.mint == policy_account.mock_usdc_mint @ ErrorCode::InvalidMint,
        constraint = owner_token_account.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ── Error Codes ──

#[error_code]
pub enum ErrorCode {
    #[msg("Only the policy owner can perform this action")]
    Unauthorized,
    #[msg("Policy has been revoked")]
    PolicyRevoked,
    #[msg("Policy has expired")]
    PolicyExpired,
    #[msg("Merchant does not match policy")]
    MerchantNotAllowed,
    #[msg("Amount exceeds per-request cap")]
    PerRequestCapExceeded,
    #[msg("Daily spending cap exceeded")]
    DailyCapExceeded,
    #[msg("Insufficient escrow balance")]
    InsufficientEscrow,
    #[msg("Deposit amount must be greater than zero")]
    ZeroDeposit,
    #[msg("Receipt is already fulfilled")]
    AlreadyFulfilled,
    #[msg("Math overflow occurred")]
    MathOverflow,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid escrow account")]
    InvalidEscrow,
}