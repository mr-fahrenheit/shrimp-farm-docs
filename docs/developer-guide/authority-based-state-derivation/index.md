---
title: Authority-Based State Derivation
sidebar_label: Authority-Based State Derivation
sidebar_class_name: sidebar-h2
---

## What is Authority-Based State Derivation?

All game state and player state accounts in Shrimp Farm are **tied to an authority key**.  
This means every piece of on-chain data is derived using the authority's public key as a seed.

The authority key acts as a unique identifier that creates isolated game instances.  
Different authority keys = completely separate games with their own state.

This design started as a necessity for our Anchor tests, but turned into a clean architectural pattern.

---

## Why We Built It This Way

### Testing Requirements

The local Solana validator used by `anchor test` doesn't support resetting state between tests.  
Without authority-based derivation, all tests would share the same game state—causing interference.

Our solution: generate a fresh authority keypair for each test, creating isolated game instances.

<details>
<summary>Show the test setup</summary>

```typescript title="tests/shrimp.ts"
beforeEach(async () => {
  await new Promise(r => setTimeout(r, 1000)); // prevent validator crashes
  
  /* fresh game for every test */
  authority = Keypair.generate();
  gameStateAccount = utils.findGameDataAcc(authority.publicKey);
  
  playerAccount = await utils.findPlayerDataAcc(
    wallet.publicKey, 
    authority.publicKey
  );
  
  refAccount = Keypair.generate();
  refStateAccount = await utils.findPlayerDataAcc(
    refAccount.publicKey, 
    authority.publicKey
  );
});
```

</details>

### Clean Architecture

Authority-based derivation creates predictable, collision-free account addresses.  
Every account type follows the same pattern: `[specific_seeds, authority_key]`.

---

## How Accounts Are Derived

All Program Derived Addresses (PDAs) include the authority key as the final seed:

**Game State:** `["shrimp", authority]`  
**Player State:** `[player_pubkey, "shrimp", authority]`  
**Contract Data:** `["contractdata", authority]`

<details>
<summary>Show the derivation utilities</summary>

```typescript title="utils.ts"
const findPlayerDataAcc = (player: PublicKey, authority: PublicKey) => {
  const [playerDataAcc, _] = PublicKey.findProgramAddressSync(
    [player.toBuffer(), Buffer.from("shrimp"), authority.toBuffer()],
    SHRIMP_PROGRAM_ID
  );    
  return playerDataAcc;
};

const findGameDataAcc = (authority: PublicKey) => {
  const [gameDataAcc] = PublicKey.findProgramAddressSync(
    [Buffer.from("shrimp"), authority.toBuffer()],
    SHRIMP_PROGRAM_ID
  );
  return gameDataAcc;
};

const findContractDataAcc = (authority: PublicKey) => {
  const [contractDataAcc] = PublicKey.findProgramAddressSync(
    [Buffer.from("contractdata"), authority.toBuffer()],
    SHRIMP_PROGRAM_ID
  );
  return contractDataAcc;
};
```

</details>

---

## Authority-Only Functions

The authority key also controls several admin functions that only work during initialization or in test environments:

**`set_market`** - Manually adjust market state (test env only)  
**`end_premarket`** - Force pre-market to end early (test env only)  
**`testnet_bonus`** - Toggle 1% bonus for specific accounts  
**`set_collection`** - Set NFT collection (called once at deployment)

These functions verify the signer matches the stored authority before executing.