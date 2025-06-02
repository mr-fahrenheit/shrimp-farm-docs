---
title: Account-Based Referrals
sidebar_label: Account-Based Referrals
sidebar_class_name: sidebar-h2
---

## What are Account-Based Referrals?

The **Account-Based Referral System** rewards players for bringing new participants to Shrimp Farm.  
When making a buy, players can optionally pass a referrer's wallet address.  
Both the referrer and the new player get rewards from the transaction.

Referrals work through two key rewards:

1. **Referrer Fee**: The referring player gets a percentage of the buy amount
2. **Cashback**: The new player gets a discount on their purchase

Both amounts are tracked separately and can be claimed later through the game's reward system.

---

## How the program handles referrals

Below is a plain‑English walkthrough of the referral flow. Feel free to expand the code blocks for the exact Rust implementation.

### 1  Account Structure (`account.rs`)

When a player makes a buy, they can include referral accounts:

1. `referrer`: The wallet address of the referring player
2. `referrer_state`: The PlayerState account for that referrer
3. Both accounts are optional—players can buy without referrals

<details>
<summary>Show the Rust</summary>

```rust title="account.rs"
#[derive(Accounts)]
pub struct BuyAccounts<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    /// CHECK: Custom check
    #[account(address = game_state.authority)]
    pub authority: AccountInfo<'info>,

    #[account(
        mut, 
        seeds = [GameState::SEED, authority.key().as_ref()], 
        bump
    )]
    pub game_state: Box<Account<'info, GameState>>,

    #[account(
        init_if_needed,
        payer = player,
        space = 8 + PlayerState::INIT_SPACE,
        seeds = [player.key().as_ref(), PlayerState::SEED, authority.key().as_ref()],
        bump
    )]
    pub player_state: Box<Account<'info, PlayerState>>,

    #[account(
        init_if_needed,
        payer = player,
        space = 8 + PlayerState::INIT_SPACE,
        seeds = [referrer.as_ref().unwrap().key().as_ref(), PlayerState::SEED, authority.key().as_ref()],
        bump
    )]
    pub referrer_state: Option<Box<Account<'info, PlayerState>>>,

    /// CHECK: Can be any account
    #[account()]
    pub referrer: Option<AccountInfo<'info>>,

    // ... other accounts
}
```

</details>

### 2  Processing Referrals (`buy.rs` / `premarket_buy.rs`)

During any buy transaction, the contract checks for referral accounts:

1. Extract the referrer's public key if provided
2. Validate the referrer exists and is registered
3. Calculate fees and update both player states
4. Track the total referral balance in the game state

<details>
<summary>Show the Rust</summary>

```rust title="instructions/buy.rs"
// Handle referrals
let referrer_key = referrer.as_ref().map(|x| x.key());
if let Some(referrer_pubkey) = referrer_key {
    let referrer_state = &mut ctx.accounts.referrer_state.as_mut().unwrap();
    let (_, _) = process_referral(
        game_state,
        player_state,
        ctx.accounts.player.key(),
        referrer_state,
        referrer_pubkey,
        amount,
    )?;
}
```

</details>

### 3  Referral Logic (`helpers.rs`)

The core referral processing handles validation, fee calculation, and state updates:

1. Validate the referrer is registered and not the same as the buyer
2. Calculate referral fee (for referrer) and cashback (for buyer)
3. Update both players' referral totals
4. Track the combined amount in the game's sell and referral balance

<details>
<summary>Show the Rust</summary>

```rust title="helpers.rs"
pub fn process_referral(
    game_state: &mut GameState,
    player_state: &mut PlayerState,
    player: Pubkey,
    referrer_state: &mut PlayerState,
    referrer: Pubkey,
    amount: u64,
) -> Result<(u64, u64)> {
    // Do nothing for no referrer
    if referrer == pubkey!("11111111111111111111111111111111") {
        return Ok((0, 0))
    }

    // Referrer must be a registered player
    require!(referrer_state.registered, CustomErrors::InvalidReferrer);

    // Can't be self
    require!(!referrer.eq(&player), CustomErrors::InvalidReferrer);

    // Returns (ref_fee, cashback)
    let ref_fee;
    let cashback;

    // Proceed with referral
    player_state.current_referrer = referrer;

    // Calculate referral fee and cashback
    ref_fee = amount
        .checked_mul(REFERRAL_FEE)
        .unwrap_or_default()
        .checked_div(100)
        .unwrap_or_default();
    cashback = amount
        .checked_mul(REFERRAL_CASHBACK)
        .unwrap_or_default()
        .checked_div(100)
        .unwrap_or_default();

    // Update referrer's total with their fee
    referrer_state.referral_total = referrer_state.referral_total.checked_add(ref_fee).unwrap();

    // Update buyer's referral total with their cashback
    player_state.referral_total = player_state.referral_total.checked_add(cashback).unwrap();

    // Add both ref fee and cashback to sell_and_ref_balance for tracking
    game_state.sell_and_ref_balance = game_state
        .sell_and_ref_balance
        .checked_add(ref_fee)
        .unwrap()
        .checked_add(cashback)
        .unwrap();

    Ok((ref_fee, cashback))
}
```

</details>