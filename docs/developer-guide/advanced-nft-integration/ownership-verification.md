---
title: Ownership Verification
sidebar_label: Ownership Verification
sidebar_class_name: sidebar-h2
---

## Why we verify NFT ownership

Shrimp Farm awards each Shrimp Farm NFT holder a **10 % bonus** to their egg production.  
To keep this benefit fair, the program must prove—on-chain—that

1. the caller truly owns the NFT, and  
2. the NFT belongs to the correct Shrimp Farm collection.

This page documents how that verification works and why it is secure.

---

## 1  Passing the asset account

When a player calls **`sell_eggs`** or **`hatch_eggs`** the front-end will automatically include any Shrimp Farm NFT that they own with the rest of the game accounts.

<details>
<summary>accounts.rs (relevant section)</summary>

```rust
use mpl_core::accounts::BaseAssetV1;

#[derive(Accounts)]
pub struct SellAndHatchAccounts<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    /// CHECK: verified against `game_state.authority`
    #[account(address = game_state.authority)]
    pub authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [GameState::SEED, authority.key().as_ref()],
        bump
    )]
    pub game_state: Account<'info, GameState>,

    #[account(
        mut,
        seeds = [player.key().as_ref(), PlayerState::SEED, authority.key().as_ref()],
        bump
    )]
    pub player_state: Account<'info, PlayerState>,

    #[account(mut)]
    pub nft_asset: Option<Account<'info, BaseAssetV1>>,

    /// CHECK: deterministic sysvar PDA
    #[account(address = sysvar::instructions::id())]
    pub sysvar_instructions: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
```

</details>

### Why a forged account can’t slip through

In testing we attempted to supply a hand-crafted `BaseAssetV1` whose data deserialized correctly.  
Anchor rejected it because the account **owner** was not the genuine Metaplex program.  
That check happens *before* our instruction logic runs, so every `BaseAssetV1` we receive is guaranteed to be real.

---

## 2  Computing the bonus

Both instruction handlers share the same logic:

```rust
// Determine bonuses: NFT holder (+10 %) and optional testnet bonus (+1 %).
let mut bonus_percent: u128 = 0;

if !game_state.collection_key.to_string().eq("11111111111111111111111111111111") {
    if is_nft_holder(
        &ctx.accounts.nft_asset,
        ctx.accounts.player.key(),
        game_state.collection_key
    )? {
        bonus_percent += NFT_BONUS;          // +10 %
    }
}

// +1 % for test-net players
if player_state.testnet_player {
    bonus_percent += TESTNET_BONUS;
}

if bonus_percent > 0 {
    eggs = eggs
        .checked_mul(100 + bonus_percent).unwrap()
        .checked_div(100).unwrap();
}
```

Plain-English flow:

1. Skip the NFT bonus if the collection key is still the “null” address (only true on a mis-configured deployment).  
2. Call **`is_nft_holder`** → returns `true` only if ownership checks pass.  
3. Add **+10 %** to `bonus_percent`.  
4. Optionally add **+1 %** for test-net players.  
5. Multiply the egg total by `(100 + bonus_percent) / 100`.

---

## 3  Verifying the NFT (`helpers.rs`)

<details>
<summary>helpers.rs</summary>

```rust
pub fn is_nft_holder(
    maybe_nft_asset: &Option<Account<BaseAssetV1>>,
    player: Pubkey,
    collection_key: Pubkey,
) -> Result<bool> {
    // Was an NFT account supplied?
    if let Some(nft_asset) = maybe_nft_asset {
        // (1) The account owner must be the signer
        require!(
            nft_asset.owner.eq(&player),
            self::CustomErrors::InvalidOwner
        );

        // (2) NFT must belong to a collection
        if let UpdateAuthority::Collection(collection) = nft_asset.update_authority {
            // (3) Collection PDA must match the game's collection key
            require!(
                collection.eq(&collection_key),
                self::CustomErrors::InvalidCollection
            );
            return Ok(true);
        } else {
            // NFT is not part of a collection
            return err!(self::CustomErrors::InvalidAsset);
        }
    }
    // No NFT supplied → no bonus
    Ok(false)
}
```

</details>

### Why these checks are sufficient

| Guarantee                                        | Enforcement method                                                                                          |
|--------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| **NFT is a genuine Metaplex Core asset**         | Anchor rejects any `BaseAssetV1` not owned by the real Metaplex program.                                     |
| **Caller really owns the NFT**                   | `nft_asset.owner` must equal the signer’s public key.                                                        |
| **NFT belongs to the Shrimp Farm collection**    | `update_authority` must be a collection PDA equal to `game_state.collection_key`.                            |

If any step fails, the transaction reverts and the player receives **no bonus**.

---

## 4  Putting it all together

1. Player calls **`sell_eggs`** or **`hatch_eggs`** and optionally includes an NFT account.  
2. Anchor proves the NFT account is genuine.  
3. Our instruction confirms ownership and collection membership, then sets `bonus_percent = 10`.  
4. Egg production is multiplied by **110 %**, giving verified holders an advantage that is enforced entirely by the Solana runtime.
