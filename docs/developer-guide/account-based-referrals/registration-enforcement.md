---
title: Registration Enforcement
sidebar_label: Registration Enforcement
sidebar_class_name: sidebar-h3
---

## What is Registration Enforcement?

**Registration Enforcement** requires players to register before they can be used as referrers.  
This prevents spam and ensures only committed players can earn referral rewards.  
The system is optional but enabled by default to maintain game integrity.

When a referral is processed, the contract checks:
- The referrer's `player_state.registered` flag is set to `true`
- This flag is only set after successful registration (which requires the minimum buy)

---

## How registration enforcement works

The enforcement happens during referral processing with a simple validation check.

### 1  Registration Requirement (`helpers.rs`)

During referral processing, the contract validates the referrer's registration status:

1. Extract the referrer's PlayerState account
2. Check the `registered` field is `true` 
3. Reject the referral if the referrer isn't registered
4. Continue with normal referral processing if valid

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

    // ... continue with referral processing
}
```

</details>

### 2  Minimum Buy Requirement (`register.rs`)

Registration requires a minimum buy to prevent spam:

1. Check the player's total spending across premarket and market buys
2. Require at least `MIN_BUY` (0.01 SOL) has been spent before registration
3. Only after meeting this requirement can players register and become eligible referrers

<details>
<summary>Show the Rust</summary>

```rust title="instructions/register.rs"
pub fn register(ctx: Context<Register>, username: String) -> Result<()> {
    // ... other validations ...

    // Check player has at least a minimum buy
    require!(ctx.accounts.player_state.market_spent + ctx.accounts.player_state.premarket_spent >= MIN_BUY, CustomErrors::MinBuyNotMet);

    // ... continue with registration ...

    // Mark player as registered
    ctx.accounts.player_state.registered = true;

    Ok(())
}
```

</details>

### 3  Spam Prevention Benefits

This enforcement prevents several attack vectors:

1. **API Spam**: Without the minimum buy requirement, users could register unlimited usernames for free
2. **Referral Farming**: Only players who've invested in the game can earn referral rewards  
3. **Resource Exhaustion**: Limits the number of registered accounts to legitimate participants

The 0.01 SOL minimum buy creates a small economic barrier that deters spam while remaining accessible to genuine players. This enforcement can be made optional by removing the registration check, but it's enabled by default to maintain game quality.