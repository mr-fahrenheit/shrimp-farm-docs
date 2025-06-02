---
title: Game State Account
sidebar_label: Game State Account
sidebar_class_name: sidebar-h2
---

## Why a single Game State account?

Shrimp Farm keeps **one** on-chain account—`GameState`—that every player touches.  
It tracks the global economy, dev balances, NFT stats, and the status of the current round.  
Each user also has a *Player State* account for their personal holdings, but the heavy data lives here.

Keeping everything in one place means:

- **Atomic updates** – every instruction can read & write the latest totals.  
- **Smaller player accounts** – users only store what’s unique to them.  
- **Easier audits** – a single source of truth for the whole game.

---

## Data layout

Below is the full struct straight from `state.rs`.

<details>
<summary>Show the Rust</summary>

```rust title="state.rs"
// ────────────────────────── Game State ───────────────────────────
#[account]
#[derive(InitSpace)]
pub struct GameState {
    // Authority and dev accounts
    pub authority: Pubkey,       // Master authority PDA seed
    pub dev1: Pubkey,            // Developer 1
    pub dev2: Pubkey,            // Developer 2
    pub dev3: Pubkey,            // Developer 3

    // NFT infrastructure
    pub collection_key: Pubkey,  // NFT collection address
    pub candymachine_key: Pubkey,// Candy Machine that mints the NFTs

    // Economic parameters
    pub cooldown: u64,           // Minimum delay (sec) between hatch / sell
    pub market_eggs: u128,       // Eggs circulating in the open market

    // Premarket window
    pub premarket_end: u64,      // Timestamp when pre-market closes
    pub premarket_spent: u64,    // Global spending during the pre-market
    pub premarket_balance: u64,  // Current treasury of pre-market earnings
    pub premarket_earned: u64,   // Lifetime pre-market earnings

    // Balances (lamports)
    pub sell_and_ref_balance: u64,// Funds reserved for user sells & referrals
    pub dev_balance: u64,        // Accumulated dev fee balance
    pub final_balance: u64,      // Treasury for the end-game prize

    // Game progression
    pub game_over: bool,         // Set to true once the game is concluded
    pub event_index: u64,        // Incrementing event counter (global)
    pub game_index: u64,         // Unique identifier for the current game action
    pub nfts_minted: u16,        // Total NFTs minted so far

    // Environment options
    pub test_env: bool,          // Enables on-chain test functions

    // Program whitelist
    pub max_ixs: u8,
    #[max_len(10)]
    pub program_whitelist: Vec<Pubkey>,
}
```

</details>

### Field groups at a glance

| Category | What it stores | Why it matters |
|----------|----------------|----------------|
| **Authority & Devs** | PDA seed + 3 fixed dev wallets | Deterministic control, fee routing |
| **NFT Infra** | Collection & Candy Machine addresses | Links on-chain items to game logic |
| **Economics** | Cool-down timer, open-market egg float | Anti-bot measures & bonding-curve math |
| **Pre-Market** | Window close, spent, balances | Implements the *Fair Launch* mechanic |
| **Balances** | Lamports reserved for players, devs, final pot | Prevents accidental co-mingling of funds |
| **Progression** | Boolean game-over flag + counters | Determines what phase the game is in |
| **Environment** | `test_env` toggle | Unlocks test-only instructions for Anchor tests and devnet |
| **Whitelist** | Program call limits & allowed programs | Opt-in security for CPI integrations |

---

## Creation & initial values

`initialize.rs` is the only place that can create a fresh `GameState`.  
It wires up the dev wallets, seeds the economy, and locks the contract against re-init on mainnet.

<details>
<summary>Show the Rust</summary>

```rust title="instructions/initialize.rs"
pub fn initialize(
    ctx: Context<Initialize>,
    dev1: Pubkey,
    dev2: Pubkey,
    dev3: Pubkey,
    premarket_end: u64,
    cooldown: u64,
    test_env: bool,
) -> Result<()> {
    // ---------------- Security checks ----------------
    require!(
        dev1 != dev2 && dev1 != dev3 && dev2 != dev3,
        CustomErrors::InvalidDevs
    );
    require!(
        ctx.accounts.owner.key()
            == pubkey!("CdKqXMm7QDjMwfFR3GgWTRQE7x39BFbiLm8KWC4TibzR"),
        CustomErrors::InvalidOwner
    );

    // ---------------- State setup ----------------
    let game_state = &mut ctx.accounts.game_state;
    game_state.authority   = ctx.accounts.authority.key();
    game_state.market_eggs = MARKET_START.into();
    game_state.dev1        = dev1;
    game_state.dev2        = dev2;
    game_state.dev3        = dev3;
    game_state.dev_balance = **game_state.to_account_info().lamports.borrow();
    game_state.event_index = 1;
    game_state.game_index  = 1;
    game_state.premarket_end = premarket_end;
    game_state.cooldown      = cooldown;
    game_state.test_env      = test_env;
    game_state.max_ixs       = 5;
    game_state.program_whitelist = vec![];

    // Prevent duplicate init on mainnet
    require!(!ctx.accounts.lock_state.locked, CustomErrors::InitLocked);
    if !test_env {
        ctx.accounts.lock_state.locked = true;
    }

    // ---------------- Emit log ----------------
    emit!(Initialized {
        dev1,
        dev2,
        dev3,
        owner: ctx.accounts.authority.key(),
        premarket_end,
        test_env
    });

    Ok(())
}
```
</details>

### What `initialize` guarantees

1. **Unique dev wallets** – a duplicate address here would cause the dev withdraw to revert.  
2. **Verified owner** – only the published authority can deploy.  
3. **Fair-launch seed** – fills `market_eggs` with the constant `MARKET_START`.  
4. **Mainnet lock** – once live, a second initialize is impossible.  
---

## Player State vs. Game State

- **Game State** – the global ledger. One account forever.  
- **Player State** – one per player, created lazily on first action.  