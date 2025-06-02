---
title: Fair Launch Mechanic
sidebar_label: Fair Launch Mechanic
sidebar_class_name: sidebar-h2
---

## What is the Fair Launch / Pre‑Market?

The **Pre‑Market** is open for a configurable length after deployment.  
We chose 3 days for the live version of Shrimp Farm.  
During this window, all SOL deposits have equal power—no front-running possible.

When the window closes, all deposits combine into one large buy that starts the game.  
Pre‑Market participants get three ongoing rewards:

1. Shrimp from the initial combined purchase
2. 6% of all future buy and sell transactions  
3. A share of remaining funds when the game ends (proportional to their deposit)

---

## How the program enforces it

Below is a plain‑English walkthrough. Feel free to expand the code blocks for the exact Rust implementation.

### 1  Initialization (`initialize.rs`)

1. The deployment script passes a `premarket_end` timestamp.
2. `initialize` stores it on‑chain: `game_state.premarket_end = premarket_end`.
3. Until that timestamp, the contract treats every buy as a *Pre‑Market* buy.

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
    // … other setup …
    game_state.premarket_end = premarket_end;
    Ok(())
}
```

</details>

Once `premarket_end` is reached:

* `premarket_buy` reverts.
* Shrimp balances for each buyer become fixed.
* Egg production starts ticking.

---

### 2  Buying during Pre‑Market (`buy_premarket.rs`)

Each buy simply:

* Transfers the player’s SOL into the treasury account.
* Adds the amount to both `game_state.premarket_spent` and `player_state.premarket_spent`.

<details>
<summary>Show the Rust</summary>

```rust title="instructions/buy_premarket.rs"
// Transfer SOL from player to treasury
transfer_lamports(
    &ctx.accounts.player,
    &game_state.to_account_info(),
    &ctx.accounts.system_program,
    amount,
)?;

// Track spending
game_state.premarket_spent  = game_state.premarket_spent .checked_add(amount).unwrap();
player_state.premarket_spent = player_state.premarket_spent.checked_add(amount).unwrap();
```

</details>

---

### 3  Calculating shrimp & eggs (`helpers.rs`)

To keep on‑chain math cheap but precise, we scale percentages by a large **inflation factor (100 000)**.  The helper functions:

* `get_my_shrimp` — converts a player’s share of total SOL into Shrimp.
* `get_eggs_since_last_hatch` — turns elapsed seconds × shrimp into eggs.
* `get_my_eggs` — returns *extra eggs* + freshly produced eggs.

<details>
<summary>Show the Rust</summary>

```rust title="helpers.rs"
/// Player‑specific share of the Pre‑Market pool
pub fn get_my_shrimp(player_state: &PlayerState, game_state: &GameState) -> u128 {
    let player_share = if game_state.premarket_spent > 0 {
        player_state.premarket_spent
            .checked_mul(100_000)
            .unwrap()
            .checked_div(game_state.premarket_spent)
            .unwrap()
    } else { 0 };

    let shrimp_from_pool = if player_share > 0 {
        let total_shrimp = calculate_egg_buy(game_state.premarket_spent as u128, 0, MARKET_START);
        total_shrimp
            .checked_mul(player_share as u128)
            .unwrap()
            .checked_div(100_000)
            .unwrap()
    } else { 0 };

    player_state.shrimp
        .checked_add(shrimp_from_pool.checked_div(EGGS_TO_HATCH_1SHRIMP).unwrap())
        .unwrap()
}

/// Eggs produced since `last_interaction` (or `premarket_end` if never interacted)
pub fn get_eggs_since_last_hatch(player_state: &PlayerState, game_state: &GameState) -> u128 {
    let now = Clock::get().unwrap().unix_timestamp as u128;
    let anchor = if player_state.last_interaction == 0 {
        game_state.premarket_end as u128
    } else {
        player_state.last_interaction as u128
    };
    (now - anchor) * get_my_shrimp(player_state, game_state)
}
```

</details>

If a player **never** hatched or sold, `last_interaction == 0`, so we treat `premarket_end` as their anchor—egg production starts right when the Pre‑Market closes.

---

### 4  Withdrawing rewards (`user_withdraw.rs`)

When a player withdraws, the contract:

1. Computes their *inflated* share of Pre‑Market spending.
2. Pays out any unclaimed portion of the 6 % fee pool.
3. If the game is over, also pays their slice of the final balance.

<details>
<summary>Show the Rust</summary>

```rust title="instructions/user_withdraw.rs"
if player_state.premarket_spent > 0
    && game_state.premarket_balance > 0
    && now > game_state.premarket_end
{
    let share = (player_state.premarket_spent as u128)
        .checked_mul(INFLATION_FACTOR).unwrap()
        .checked_div(game_state.premarket_spent as u128).unwrap();

    // 6 % fee pool
    let earned = share
        .checked_mul(game_state.premarket_earned as u128).unwrap()
        .checked_div(INFLATION_FACTOR).unwrap() as u64;
    // …snip: update balances & optional prize payout …
}
```

</details>

A tiny remainder (“black‑holed lamports”) can appear due to integer division, but it’s typically just a few lamports and has no practical impact.

---

## Quick recap

* **Equal footing** — every SOL in the Pre‑Market has identical weight.
* **Three perpetual rewards** — shrimp, 6 % fees, final balance.
* **Lazy maths** — rewards are calculated only when needed, keeping compute low.
