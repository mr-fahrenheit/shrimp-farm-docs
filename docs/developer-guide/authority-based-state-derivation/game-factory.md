---
title: Game Factory
sidebar_label: Game Factory
sidebar_class_name: sidebar-h3
---

## Single Instance Lock

By design, Shrimp Farm allows only **one game instance per program** on mainnet.  
This is enforced through a `LockState` account that prevents multiple initializations.

When `test_env` is false, the first successful `initialize` call locks the program forever.  
Subsequent initialize attempts will fail with `CustomErrors::InitLocked`.

<details>
<summary>Show the lock mechanism</summary>

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
    // ... other setup ...
    
    // For mainnet deploy, prevent multiple initializes
    require!(!ctx.accounts.lock_state.locked, CustomErrors::InitLocked);
    if !test_env {
        ctx.accounts.lock_state.locked = true;
    }
    
    // ... rest of initialization ...
    Ok(())
}
```

</details>

---

## Why Not Multi-Instance?

The authority-based architecture would technically support multiple game instances.  
Users could deploy their own games, collect fees, and run parallel competitions.

**We chose single-instance for several reasons:**

**Reduced scope** - Multi-instance adds complexity to deployment and management  
**Cleaner API** - Our event indexing doesn't get polluted with events from other instances  
**Focus** - Single game means we can optimize the experience without worrying about variants  
**Control** - We maintain authority over game parameters and economic balance

---

## Authority-Only Functions

The locked authority key controls several admin functions:

**Development Functions** (test env only):
- `set_market` - Manually adjust market state for testing
- `end_premarket` - Force pre-market period to end early

**Live Functions**:
- `testnet_bonus` - Toggle 1% bonus for specific accounts during testing phases
- `set_collection` - Set the NFT collection address (called once at deployment)

<details>
<summary>Show authority verification</summary>

```rust title="accounts.rs"
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
    
    // ... other accounts ...
}
```

</details>

---

## Future Possibilities

While we implemented single-instance, the architecture supports expansion.  
A future version could remove the lock and allow:

- User-created game instances with custom parameters
- Fee collection for instance creators  

The authority-based derivation makes this technically straightforward.