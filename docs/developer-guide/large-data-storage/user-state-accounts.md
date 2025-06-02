---
title: User State Accounts
sidebar_label: User State Accounts
sidebar_class_name: sidebar-h2
---

## How Solana stores user data

Unlike Ethereum's mappings, Solana requires explicit **accounts** for data storage.  
Each player gets their own account, derived from their wallet address.  
We use Program Derived Addresses (PDAs) to create deterministic, unique storage for each user.

The player's data persists across all their interactions with the game.  
This includes their shrimp count, earnings, spending, and relationship to other players.

---

## The PlayerState structure

Here's what we track for each player:

<details>
<summary>Show the Rust</summary>

```rust title="state/player.rs"
#[account]
#[derive(InitSpace)]
pub struct PlayerState {
    // Production
    pub shrimp: u128,            // Current shrimp owned by the player
    pub extra_eggs: u128,        // Eggs generated at old (lower) rate

    // Activity timestamps (Unix seconds)
    pub last_interaction: u64,   // Last action of any kind (hatch or sell)
    pub last_hatch: u64,         // Last time the player hatched eggs
    pub last_sell: u64,          // Last time the player sold eggs

    // Earnings (Lamports)
    pub referral_total: u64,     // Lifetime referral or cashback income
    pub sell_total: u64,         // Lifetime income from selling eggs
    pub referral_withdrawn: u64, // Lamports withdrawn from referral earnings
    pub sell_withdrawn: u64,     // Lamports withdrawn from sell earnings
    pub premarket_withdrawn: u64,// Lamports withdrawn from pre-market earnings

    // Expenditure (lamports)
    pub premarket_spent: u64,    // Lamports spent during the pre-market phase
    pub market_spent: u64,       // Lamports spent in the primary market

    // Relationships
    pub current_referrer: Pubkey,// Address used as referrer for new purchases

    // Status flags
    pub prize_withdrawn: bool,   // Whether the final-prize payout has been claimed
    pub minted: bool,            // True if the player's NFT is already minted
    pub testnet_player: bool,    // Grants +1 % production if the player joined testnet
    pub registered: bool,        // True if player has registered a username
}

impl PlayerState {
    pub const SEED: &'static [u8] = b"shrimp";
}
```

</details>

---

## Accessing player accounts

Solana doesn't have Ethereum‑style mappings (`players[address]`).  
Instead, we derive the account address and pass it to each instruction:

<details>
<summary>Show the Rust</summary>

```rust title="instructions/buy.rs"
#[account(
    init_if_needed,
    payer = player,
    space = 8 + PlayerState::INIT_SPACE,
    seeds = [player.key().as_ref(), PlayerState::SEED, authority.key().as_ref()],
    bump
)]
pub player_state: Box<Account<'info, PlayerState>>,
```

</details>

The `init_if_needed` macro creates the account on first use.  
The `seeds` ensure each player gets a unique, deterministic address.

---

## Writing data to PlayerState

Once we have the account reference, updates are straightforward:

<details>
<summary>Show the Rust</summary>

```rust title="instructions/buy.rs"
pub fn buy_shrimp(
    ctx: Context<BuyAccounts>,
    amount: u64, 
) -> Result<()> {
    // Check transaction restrictions
    limit_instructions(&ctx.accounts.sysvar_instructions, ctx.accounts.game_state.max_ixs, &ctx.accounts.game_state.program_whitelist).unwrap();

    // Check amount
    require!(
        amount >= MIN_BUY,
        CustomErrors::BuyAmountTooLow
    );

    let player_state = &mut ctx.accounts.player_state;
    let game_state = &mut ctx.accounts.game_state;
    let referrer = &ctx.accounts.referrer;

    // ... buy logic ...

    // Convert eggs to shrimp
    let shrimp_to_add = eggs_bought.checked_div(EGGS_TO_HATCH_1SHRIMP).unwrap_or_default();
    player_state.shrimp = player_state.shrimp.checked_add(shrimp_to_add).unwrap_or(player_state.shrimp);

    // Update last interaction and market spend
    player_state.last_interaction = now;
    player_state.market_spent = player_state.market_spent.checked_add(amount).unwrap();
    
    Ok(())
}
```

</details>

Every field update is automatically persisted on‑chain when the transaction succeeds.  
The account remains accessible for all future interactions with that player.