---
title: NFT Minting via CPI
sidebar_label: NFT Minting via CPI
sidebar_class_name: sidebar-h2
---

## Why CPI?

**CPI (Cross-Program Invocation)** lets Shrimp Farm call the **Metaplex Core Candy Machine** directly, so the game includes the NFT-mint instruction in *every* buy transaction.  
If the on-chain conditions are met the CPI mints the NFT; otherwise the instruction simply returns `Ok()`, costing only compute.  
Players never click a separate mint link, and the NFTs inherit every Candy Machine feature—random item selection, collection metadata, royalties, etc.—with no extra token plumbing.

---

## High-level flow

1. **Create** a Collection NFT and Candy Machine (TypeScript helper in `/tests/nft.ts`).  
2. **Register** both keys on-chain via `set_collection` (Rust).  
3. **Buy** in Pre-Market or Market. Every buy transaction also carries `mint_nft`; if the wallet’s cumulative spend ≥ `NFT_MIN_BUY` *and* supply isn’t exhausted, the CPI mints the next NFT. Otherwise `mint_nft` no-ops with `Ok()`.

---

## 1 Setting up the Candy Machine (TypeScript)

All collection metadata lives in the helper script, so you never redeploy the contract just to tweak artwork.

<details>
<summary>Show the TypeScript</summary>

~~~ts
/**
 * Creates a Candy Machine & a Collection NFT using Metaplex,
 * then wires them into Shrimp Farm.
 */
export async function createCandyMachineAndSetCollectionWithKeys(
  umi: Umi,
  shrimpProgram: Program<Shrimp>,
  authority: Keypair,
  collection: KeypairSigner,
  candyMachine: KeypairSigner,
  totalItems = 1024,
): Promise<{ collection: KeypairSigner; candyMachine: KeypairSigner }> {
  /* 1 — Create the collection NFT */
  await createCollection(umi, {
    collection,
    name: 'Shrimp Farm',
    uri: 'https://arweave.net/y07lP84vWYNKLDRGuLN9Q6r8S9oHUOze2HMchkPxy-A',
    plugins: [
      {
        type: 'Royalties',
        basisPoints: 300,
        creators: [
          {
            address: metaplexPublicKey(
              'MrFFFfy8qifTYGvPZAvWr9Tfkpi32u7ZQn9dZfA4C1o',
            ),
            percentage: 100,
          },
        ],
        ruleSet: ruleSet('None'),
      },
    ],
  }).sendAndConfirm(umi);

  /* 2 — Spin up the Candy Machine */
  await createCandyMachine(umi, {
    candyMachine,
    collection: collection.publicKey,
    collectionUpdateAuthority: umi.identity,
    itemsAvailable: totalItems,
    authority: umi.identity.publicKey,
    isMutable: true,
    configLineSettings: some({
      prefixName: 'Farmer #',
      nameLength: 4,
      prefixUri:
        'https://arweave.net/SoyEoRPeCPcvlO_2SQ3NL4mpX8VLOGTXESuq4wT5MRY/',
      uriLength: 9,
      isSequential: false,
    }),
  }).sendAndConfirm(umi);

  /* 3 — Stream metadata into the machine (40-item batches) */
  const batchSize = 40;
  for (let i = 0; i < totalItems; i += batchSize) {
    const batch: { name: string; uri: string }[] = [];
    for (let j = i + 1; j <= Math.min(i + batchSize, totalItems); j++) {
      batch.push({ name: ${j}, uri: ${j}.json });
    }
    await addConfigLines(umi, {
      candyMachine: candyMachine.publicKey,
      index: i,
      configLines: batch,
    }).sendAndConfirm(umi);
  }

  /* 4 — Tell Shrimp Farm which Candy Machine to use */
  await shrimpProgram.methods
    .setCollection()
    .accounts({
      authority: authority.publicKey,
      candyMachine: candyMachine.publicKey,
      candyMachineAuthority: new PublicKey(umi.payer.publicKey.toString()),
    })
    .signers([authority])
    .rpc({ commitment: 'confirmed' });

  return { collection, candyMachine };
}
~~~

</details>

> **Batch size 40** hit the sweet spot for our URI length; tune for your own data.

---

## 2 Registering the collection on-chain (`set_collection.rs`)

The helper above ultimately triggers one on-chain instruction that stores three things:

| Field                  | Purpose                                          |
| ---------------------- | ------------------------------------------------ |
| `collection_key`       | Mint address of the *Shrimp Farm* Collection NFT |
| `candymachine_key`     | Candy Machine that will serve the NFTs           |
| **PDA mint authority** | PDA allowed to mint when Shrimp Farm says so     |

### Instruction sequence

1. **Guard rail** – abort if a collection is already set.  
2. **Deserialize** the Candy Machine to fetch `collection_mint`.  
3. **Write** both keys into `GameState`.  
4. **CPI** to Candy Machine: `set_mint_authority(new_pda)` (discriminator `[67, 127, 155, 187, 100, 174, 103, 121]`).  
5. **Emit** `NFTCollectionSet` event.

<details>
<summary>Show the Rust</summary>

~~~rust
pub fn set_collection(ctx: Context<SetCollection>) -> Result<()> {
    // 1 — Prevent re-initialisation
    require!(
        ctx.accounts.game_state.collection_key
            == pubkey!("11111111111111111111111111111111"),
        CustomErrors::CollectionAlreadySet
    );

    // 2 — Read the candy machine to grab its collection mint
    let cm: CandyMachine = AccountDeserialize::try_deserialize(
        &mut &ctx.accounts.candy_machine.data.borrow()[..],
    )?;
    ctx.accounts.game_state.collection_key = cm.collection_mint;
    ctx.accounts.game_state.candymachine_key = *ctx.accounts.candy_machine.key;

    // 3 — Tell the candy machine that our PDA is the mint authority
    let ix = Instruction {
        program_id: ctx.accounts.candy_machine_program.key(),
        accounts: vec![
            AccountMeta::new(*ctx.accounts.candy_machine.key, false),
            AccountMeta::new_readonly(*ctx.accounts.candy_machine_authority.key, true),
            AccountMeta::new_readonly(*ctx.accounts.nft_mint_authority.key, true),
        ],
        data: SET_MINT_AUTHORITY_DISCRIMINATOR.to_vec(),
    };

    invoke_signed(
        &ix,
        &[
            ctx.accounts.candy_machine.to_account_info(),
            ctx.accounts.candy_machine_authority.to_account_info(),
            ctx.accounts.nft_mint_authority.to_account_info(),
        ],
        &[&[
            CANDY_MACHINE_AUTHORITY_SEED.as_bytes(),
            &ctx.accounts.authority.key().to_bytes(),
            &[ctx.bumps.nft_mint_authority],
        ]],
    )?;

    // 4 — Emit event
    emit!(NFTCollectionSet {
        collection: ctx.accounts.game_state.collection_key,
        authority: ctx.accounts.nft_mint_authority.key(),
    });
    Ok(())
}
~~~

</details>

---

## 3 Minting from inside the game (`mint_nft.rs`)

Every buy transaction appends this instruction.  
When a player’s cumulative spend crosses **`NFT_MIN_BUY`**, and the global cap of `1024` isn’t hit, the CPI mints **exactly one** Farmer NFT.

### Guard rails

* Skip if the player already owns a Farmer NFT.  
* Skip if the global cap `1024` is hit.  
* Skip if cumulative spend < `NFT_MIN_BUY`.  
* **Always return `Ok()`** when skipped, so the surrounding buy never fails.  
* No rent drain: uses PDA signer (`mint_authority`) so the Candy Machine still enforces its own rules.

### Instruction outline

| Step | Purpose                                                                                |
| ---- | -------------------------------------------------------------------------------------- |
| 1    | Mark `player_state.minted = true`                                                      |
| 2    | Assemble all Candy Machine accounts (12 total)                                         |
| 3    | CPI to Candy Machine `mint` (discriminator `[84, 175, 211, 156, 56, 250, 104, 118, 0, 0, 0, 0]`) |
| 4    | Increment `game_state.nfts_minted`                                                     |
| 5    | Emit `NftMinted` with running total                                                    |

<details>
<summary>Show the Rust</summary>

~~~rust
pub fn mint_nft(ctx: Context<MintNft>) -> Result<()> {
    // 0 — Early exits
    if ctx.accounts.player_state.minted
        || (ctx.accounts.player_state.market_spent
            + ctx.accounts.player_state.premarket_spent)
            < NFT_MIN_BUY
        || ctx.accounts.game_state.nfts_minted == 1024
    {
        return Ok(());
    }

    // 1 — Burn the flag to prevent duplicates
    ctx.accounts.player_state.minted = true;

    // 2 — CPI into the candy machine
    let ix = Instruction {
        program_id: ctx.accounts.candy_machine_program.key(),
        accounts: vec![ /* 12 metas, see full file */ ],
        data: MINT_DISCRIMINATOR.to_vec(),
    };

    invoke_signed(
        &ix,
        &[
            /* the same 12 AccountInfos */
        ],
        &[&[
            CANDY_MACHINE_AUTHORITY_SEED.as_bytes(),
            &ctx.accounts.authority.key().to_bytes(),
            &[ctx.bumps.mint_authority],
        ]],
    )?;

    // 3 — Book-keeping
    ctx.accounts.game_state.nfts_minted += 1;
    emit!(NftMinted {
        event_index: ctx.accounts.game_state.event_index,
        player: ctx.accounts.player.key(),
        nfts_minted: ctx.accounts.game_state.nfts_minted,
        timestamp: Clock::get()?.unix_timestamp as u64,
    });
    ctx.accounts.game_state.event_index =
        ctx.accounts.game_state.event_index.checked_add(1).unwrap();
    Ok(())
}
~~~

</details>

---

## Takeaways

* **No front-end mint button**—the front-end always inserts the mint instruction automatically.  
* **Metaplex Core** avoids token-account bloat, so CPI fits in one transaction.  
* **All logic lives on-chain**: eligibility, supply cap, and rich events for indexers.
