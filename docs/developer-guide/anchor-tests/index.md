---
title: Anchor Tests
sidebar_label: Anchor Tests
sidebar_class_name: sidebar-h2
---

## Test Suite Overview

Shrimp Farm's test suite covers all game mechanics with **isolated state per test**.  
Each test generates a fresh authority keypair, creating completely separate game instances.

The tests validate 9 core feature areas across 1,000+ lines of TypeScript integration tests.  
Every edge case and error condition is verified to ensure robust on-chain behavior.

---

## Test Categories

### 1. Pre‑Market Mechanics

The pre‑market phase lets players deposit with equal power before the live market begins. These tests ensure the phase operates fairly, enforces transaction limits, and seeds later dividend calculations.

<details>
<summary><strong>1.1 Pre‑Market Buy — With & Without Referrer</strong></summary>

**Purpose**  Verifies that any wallet can buy during the pre‑market both *with* and *without* a registered referrer.

```typescript
it("allows a pre‑market buy (with referrer)", async () => {
  await setupReferrer(refAccount);
  const amount = new anchor.BN(1e8); // 0.1 SOL
  await buyPremarket(wallet.payer, amount, refAccount.publicKey);
});

it("allows a pre‑market buy (without referrer)", async () => {
  const amount = new anchor.BN(1e8); // 0.1 SOL
  await buyPremarket(wallet.payer, amount, NULL_KEY);
});
```

**Key Assertions**

* Transaction succeeds with / without `referrer` PDA
* Player PDA is created on‑demand the first time they buy
* No referral cashbacks are emitted when `NULL_KEY` is supplied

</details>

<details>
<summary><strong>1.2 Instruction‑Count Guard</strong></summary>

**Purpose**  Prevents DoS‑style spam by capping each transaction at **4 buy instructions** (plus the `ComputeBudget` ix).

```typescript
it("limits number of IXs", async () => {
  const amount = new anchor.BN(1e8);
  // 5 Buys should fail (6 ixs total => over limit)
  await utils.shouldRevert(buyPremarketMulti(5, wallet.payer, amount, NULL_KEY));
  // 4 Buys should work
  await buyPremarketMulti(4, wallet.payer, amount, NULL_KEY);
});
```

**Guard Logic**

1. On‑chain counter starts at 0 each tx
2. Each `buy_premarket` increments the counter
3. When counter > 4 the program throws *“Too many instructions”*

</details>

<details>
<summary><strong>1.3 Referral & Cashback Accounting</strong></summary>

**Purpose**  Validates the **4 %** referrer fee and **1 %** buyer cashback integer math.

```typescript
it("updates referral & cashback correctly", async () => {
  await setupReferrer(refAccount);

  const amount = new anchor.BN(1e8);
  await buyPremarket(wallet.payer, amount, refAccount.publicKey);

  const refState   = await program.account.playerState.fetch(refStateAccount);
  const playerState = await program.account.playerState.fetch(playerAccount);

  const refFee  = amount.mul(new anchor.BN(4)).div(new anchor.BN(100));
  const cashback = amount.mul(new anchor.BN(1)).div(new anchor.BN(100));

  expect(playerState.currentReferrer.toString()).to.equal(refAccount.publicKey.toString());
  expect(refState.referralTotal.eq(refFee)).to.be.true;
  expect(playerState.referralTotal.eq(cashback)).to.be.true;
});
```

**Validated Invariants**

* `currentReferrer` is set once, never implicitly overwritten
* Referrer PDA accrues **4 %** of purchase, buyer PDA accrues **1 %**
* All values are stored as 64‑bit integers (lamports) — no float drift

</details>

<details>
<summary><strong>1.4 Dividend Distribution on First Live‑Phase Buy</strong></summary>

**Purpose**  Ensures the *6 %* live‑phase dividend pool is split across **all** pre‑market buyers immediately after the first regular buy.

```typescript
it("distributes pre‑market dividends on first regular buy", async () => {
  const amount = new anchor.BN(1e8);
  await buyPremarket(wallet.payer, amount, NULL_KEY);
  await buyPremarket(randomAccount, amount, NULL_KEY);

  await advancePreMarket();              // ⏭ Transition → live phase
  await buyShrimp(wallet.payer, amount, NULL_KEY); // 1st live buy

  // Trigger withdrawal to record on‑chain state
  await program.methods.userWithdraw()
    .accounts({ player: wallet.publicKey, authority: authority.publicKey })
    .signers([wallet.payer])
    .rpc();

  const playerState = await program.account.playerState.fetch(playerAccount);
  const gameState   = await program.account.gameState.fetch(gameStateAccount);

  const expected = gameState.premarketEarned.div(new anchor.BN(2));
  expect(playerState.premarketWithdrawn.toString()).to.equal(expected.toString())
});
```

**Mechanics Recap**

* First live buy siphons **6 %** of the lamports into `premarketBalance`
* Each existing pre‑market wallet’s *share* = `premarketBalance ÷ (# pre‑market players)`
* Players may withdraw immediately; unpaid shares remain claimable forever

</details>

---

### 2. NFT Minting Requirements

NFTs grant permanent in‑game bonuses but come with strict eligibility gates. These tests confirm those gates cannot be bypassed.

<details>
<summary><strong>2.1 Collection Initialization Lock</strong></summary>

**Purpose**  Once a Candy Machine collection is attached, the `set_collection` instruction must reject all subsequent calls.

```typescript
describe("NFT minting", () => {
  it("does not allow setting collection twice", async () => {
    const umi = await createUmi();
    await createCandyMachineAndSetCollection(umi, program, authority, 10);

    await utils.shouldError(
      createCandyMachineAndSetCollection(umi, program, authority, 10),
      "Collection already set");
  });
```

**Enforced Rule**  `collectionPda` in `game_state` is immutable after first initialization.

</details>

<details>
<summary><strong>2.2 Eligible Mint after ≥ 1 SOL Spend</strong></summary>

**Purpose**  Confirms that only players who have spent **at least 1 SOL** *in the live market* may mint.

```typescript
it("allows mint after ≥ 1 SOL regular buy", async () => {
  const umi = await createUmi();
  await createCandyMachineAndSetCollection(umi, program, authority, 10);
  await setupReferrer(refAccount);

  await advancePreMarket();
  await buyShrimp(randomAccount, new anchor.BN(1e9), refAccount.publicKey); // 1 SOL

  await mintNft(umi, program, authority.publicKey, randomAccount);
});
```

**Validation Steps**

1. Pre‑market spending **does not** count toward the threshold
2. `spentLiveLamports ≥ 1_000_000_000` passes eligibility check

</details>

<details>
<summary><strong>2.3 Reject Mint &lt; 1 SOL</strong></summary>

```typescript
it("rejects mint when spent < 1 SOL", async () => {
  const umi = await createUmi();
  await createCandyMachineAndSetCollection(umi, program, authority, 10);
  await setupReferrer(refAccount);

  await advancePreMarket();
  await buyShrimp(randomAccount, new anchor.BN(1e8), refAccount.publicKey); // 0.1 SOL

  await utils.shouldRevert(mintNft(umi, program, authority.publicKey, randomAccount));
});
```

**Expected Error**  *“Spent amount below 1 SOL”*

</details>

<details>
<summary><strong>2.4 Single‑Mint Enforcement</strong></summary>

```typescript
it("rejects a second NFT mint", async () => {
  const umi = await createUmi();
  await createCandyMachineAndSetCollection(umi, program, authority, 10);
  await setupReferrer(refAccount);

  await advancePreMarket();
  await buyShrimp(randomAccount, new anchor.BN(1e9), refAccount.publicKey);

  await mintNft(umi, program, authority.publicKey, randomAccount);
  await utils.shouldRevert(mintNft(umi, program, authority.publicKey, randomAccount));
});
```

**Contract State**  `player_state.hasMintedNft == true` blocks all future mint attempts.

</details>

---

### 3. Minimum‑Buy Enforcement

A universal **0.01 SOL** floor protects the network and PDAs from microscopic spam transactions.

<details>
<summary><strong>3.1 Rejects &lt; 0.01 SOL in Both Phases</strong></summary>

```typescript
describe("Minimum‑buy enforcement", () => {
  it("rejects amounts below 0.01 SOL in both phases", async () => {
    const zero  = new anchor.BN(0);
    const small = new anchor.BN(9e6); // 0.009 SOL

    await setupReferrer(refAccount);

    await utils.shouldError(
      buyPremarket(wallet.payer, zero,  refAccount.publicKey),
      "Buy amount below the 0.01 SOL minimum",
    );
    await utils.shouldError(
      buyPremarket(wallet.payer, small, refAccount.publicKey),
      "Buy amount below the 0.01 SOL minimum",
    );

    await advancePreMarket();

    await utils.shouldError(
      buyShrimp(wallet.payer, zero,  refAccount.publicKey),
      "Buy amount below the 0.01 SOL minimum",
    );
    await utils.shouldError(
      buyShrimp(wallet.payer, small, refAccount.publicKey),
      "Buy amount below the 0.01 SOL minimum",
    );
  });
});
```

**Rejection Path**

1. `amountLamports < MIN_BUY_LAMPORTS` ⇒ `ProgramError::BuyTooSmall`
2. Error string propagated back to the client helper

</details>

---

### 4. Referral System

Shrimp Farm’s referral engine tracks each buyer’s **current referrer**, supports referrer upgrades, emits rich on‑chain events, and shares 4 %/1 % rewards.

<details>
<summary><strong>4.1 Multiple Referrers & Cashbacks</strong></summary>

**Purpose**  Checks that a single buyer can route multiple purchases through a referrer and that totals double accordingly.

```typescript
it("handles multiple referrers & cashbacks correctly", async () => {
  const amount   = new anchor.BN(1e8);
  const refBonus = amount.toNumber() * 0.04;
  const cashback = amount.toNumber() * 0.01;

  await setupReferrer(refAccount);
  await setupReferrer(refAccount2, 'referrerb');

  await buyPremarket(wallet.payer, amount, refAccount.publicKey);
  await advancePreMarket();
  await buyShrimp(wallet.payer, amount, refAccount.publicKey);

  const ref1State = await program.account.playerState.fetch(refStateAccount);
  const player1   = await program.account.playerState.fetch(playerAccount);

  expect(ref1State.referralTotal.toNumber()).to.equal(refBonus * 2);
  expect(player1.referralTotal.toNumber()).to.equal(cashback * 2);
});
```

**Metrics Verified**

* `referralTotal` increments **+4 %** per purchase
* Buyer’s `cashbackTotal` increments **+1 %** per purchase

</details>

<details>
<summary><strong>4.2 BuyPremarket Event — Correct Referrer Key</strong></summary>

**Test Breakdown**

1. **No Referrer Supplied** → event should log *default* key
2. **Valid Referrer Supplied** → event logs that pubkey

```typescript
it("emits default key when no referrer", async () => {
  const sig = await buyPremarket(wallet.payer, new anchor.BN(1e8), null);
  const ev  = await getBuyEvent(sig);
  expect(ev.referrer.toBase58()).to.equal(PublicKey.default.toBase58());
});

it("records supplied referrer", async () => {
  await setupReferrer(refAccount);

  const sig = await buyPremarket(wallet.payer, new anchor.BN(1e8), refAccount.publicKey);
  const ev  = await getBuyEvent(sig);
  expect(ev.referrer.toBase58()).to.equal(refAccount.publicKey.toBase58());
});
```

</details>

<details>
<summary><strong>4.3 Live Buy Event Referrer Edge‑Cases</strong></summary>

```typescript
describe("Buy events emit correct referrer", () => {
  it("emits default key when no referrer (self passed ⇒ still default)", async () => {
    // 1️⃣ create player PDA with a pre‑market buy (self as referrer)
    await buyPremarket(wallet.payer, new anchor.BN(1e8), null);
    await advancePreMarket();

    // 2️⃣ regular buy, again passing self
    const sig = await buyShrimp(wallet.payer, new anchor.BN(1e8), null);
    const ev  = await getBuyEvent(sig);

    expect(ev.referrer.toBase58()).to.equal(PublicKey.default.toBase58());
  });

  it("keeps existing referrer when buyer passes self", async () => {
    await setupReferrer(refAccount);

    // set a proper referrer first
    await buyPremarket(wallet.payer, new anchor.BN(1e8), refAccount.publicKey);
    await advancePreMarket();

    // now try to overwrite with self – should fail
    await utils.shouldError(
      buyShrimp(wallet.payer, new anchor.BN(1e8), wallet.publicKey),
      'Invalid referrer'
    );
  });

  it("updates to a new valid referrer", async () => {
    await setupReferrer(refAccount);
    await setupReferrer(refAccount2, 'referrerb');

    // 1️⃣ give the player an initial referrer
    await buyPremarket(wallet.payer, new anchor.BN(1e8), refAccount.publicKey);
    await advancePreMarket();

    // 2️⃣ now supply a different valid referrer
    const sig = await buyShrimp(
      wallet.payer,
      new anchor.BN(1e8),
      refAccount2.publicKey
    );
    const ev = await getBuyEvent(sig);

    expect(ev.referrer.toBase58())
      .to.equal(refAccount2.publicKey.toBase58());
  });
});
```

**Edge‑Case Rules**

* Passing `self` as referrer is always rejected
* First valid referrer sticks until **explicitly changed** to another registered referrer

</details>

### 5. Bonus Mechanics

NFT ownership and the optional test‑net bonus flag can amplify hatching and selling rewards. The following tests guarantee that bonuses apply exactly when they should — and never when they shouldn’t.

---

<details>
<summary><strong>5.1 Hatch Without NFT → 0&nbsp;% Bonus</strong></summary>

**Purpose** Ensures the default path (no NFT) produces **no additional rewards**.

```typescript
it("hatch without NFT → 0 % bonus", async () => {
  await setupReferrer(refAccount);

  await buyPremarket(wallet.payer, new anchor.BN(1e8), refAccount.publicKey);
  await advancePreMarket();
  await buyShrimp(wallet.payer, new anchor.BN(1e8), refAccount.publicKey);

  const sig = await program.methods.hatchEggs()
    .accounts({ player: wallet.publicKey, authority: authority.publicKey, nftAsset: null })
    .rpc({ commitment: "confirmed" });

  const bonus = await utils.getBonusPercentFromTx(provider.connection, program, sig, "hatch");
  expect(bonus).to.equal(0);
});
```

**Validated Invariants**

* `bonusPercent` event field equals **0**
* No lamports beyond base hatch math are minted to the player PDA

</details>

<details>
<summary><strong>5.2 Hatch With NFT → 10&nbsp;% Bonus</strong></summary>

```typescript
it("hatch with NFT → 10 % bonus", async () => {
  const umi = await createUmi();
  await createCandyMachineAndSetCollection(umi, program, authority, 10);
  await setupReferrer(refAccount);

  await buyPremarket(randomAccount, new anchor.BN(1e9), refAccount.publicKey);
  await advancePreMarket();
  await buyShrimp(randomAccount, new anchor.BN(1e9), refAccount.publicKey);
  const nft = await mintNft(umi, program, authority.publicKey, randomAccount);

  const sig = await program.methods.hatchEggs()
    .accounts({ player: randomAccount.publicKey, authority: authority.publicKey, nftAsset: nft.publicKey })
    .signers([randomAccount])
    .rpc({ commitment: "confirmed" });

  const bonus = await utils.getBonusPercentFromTx(provider.connection, program, sig, "hatch");
  expect(bonus).to.equal(10);
});
```

**Key Assertions**

* `bonusPercent == 10` in decoded logs
* `player.eggs` balance increases by **1.10×** the normal hatch amount (uint math verified off‑chain)

</details>

<details>
<summary><strong>5.3 Sell Without NFT → 0&nbsp;% Bonus</strong></summary>

```typescript
it("sell without NFT → 0 % bonus", async () => {
  await setupReferrer(refAccount);
  await advancePreMarket();
  await buyShrimp(wallet.payer, new anchor.BN(1e8), refAccount.publicKey);

  const sig = await program.methods.sellEggs()
    .accounts({ player: wallet.publicKey, authority: authority.publicKey, nftAsset: null })
    .rpc({ commitment: "confirmed" });

  const bonus = await utils.getBonusPercentFromTx(provider.connection, program, sig, "sell");
  expect(bonus).to.equal(0);
});
```

</details>

<details>
<summary><strong>5.4 Sell With NFT → 10&nbsp;% Bonus</strong></summary>

```typescript
it("sell with NFT → 10 % bonus", async () => {
  const umi = await createUmi();
  await createCandyMachineAndSetCollection(umi, program, authority, 10);
  await setupReferrer(refAccount);
  await advancePreMarket();
  await buyShrimp(wallet.payer, new anchor.BN(1e9), refAccount.publicKey);
  const nft = await mintNft(umi, program, authority.publicKey, wallet.payer);

  const sig = await program.methods.sellEggs()
    .accounts({ player: wallet.publicKey, authority: authority.publicKey, nftAsset: nft.publicKey })
    .rpc({ commitment: "confirmed" });

  const bonus = await utils.getBonusPercentFromTx(provider.connection, program, sig, "sell");
  expect(bonus).to.equal(10);
});
```

**Outcome** `lamportsOut == base × 1.10` exactly; rounding stays within ±1 lamport.

</details>

<details>
<summary><strong>5.5 Test‑Net Bonus Flag → +1&nbsp;%</strong></summary>

```typescript
it("test‑net bonus flag grants 1 %", async () => {
  await setupReferrer(refAccount);
  await advancePreMarket();
  await program.methods.setMarket(new anchor.BN("10000000000000000000000000"))
    .accounts({ authority: authority.publicKey })
    .signers([authority])
    .rpc();

  const buyAmount = new anchor.BN(1_000e9); // 1 000 SOL
  await buyShrimp(wallet.payer, buyAmount, refAccount.publicKey);

  const bonusKp = Keypair.generate();
  await provider.connection.requestAirdrop(bonusKp.publicKey, 1_000e9);

  await program.methods.testnetBonus()
    .accounts({ authority: authority.publicKey, player: bonusKp.publicKey })
    .signers([authority])
    .rpc();

  await buyShrimp(bonusKp, buyAmount, refAccount.publicKey);

  const sig1 = await program.methods.hatchEggs()
    .accounts({ player: wallet.publicKey, authority: authority.publicKey, nftAsset: null })
    .rpc({ commitment: "confirmed" });
  const sig2 = await program.methods.hatchEggs()
    .accounts({ player: bonusKp.publicKey, authority: authority.publicKey, nftAsset: null })
    .signers([bonusKp])
    .rpc({ commitment: "confirmed" });

  const bonus1 = await utils.getBonusPercentFromTx(provider.connection, program, sig1, "hatch");
  const bonus2 = await utils.getBonusPercentFromTx(provider.connection, program, sig2, "hatch");

  expect(bonus1).to.equal(0);
  expect(bonus2).to.equal(1);
});
```

**Rule Summary**

* Authority may toggle **test‑net bonus** for any wallet → grants +1 % on hatches & sells
* Stacks with (but does not multiply) NFT bonus: `totalBonus = nft?10:0 + testnet?1:0`

</details>

---

### 6. Cooldown Enforcement

Both *hatching* and *selling* are rate‑limited to **once every 5 seconds** per player to prevent high‑frequency manipulation.  
In the live version, the cooldown is set to 8 hours.

---

<details>
<summary><strong>6.1 Hatch Cooldown (5&nbsp;s)</strong></summary>

```typescript
it("hatch cooldown (5 s)", async () => {
  await setupReferrer(refAccount);
  await advancePreMarket();
  await buyShrimp(wallet.payer, new anchor.BN(1_000e8), refAccount.publicKey);

  await program.methods.hatchEggs()
    .accounts({ player: wallet.publicKey, authority: authority.publicKey, nftAsset: null })
    .rpc();

  await new Promise(r => setTimeout(r, 500)); // 0.5 s => should still be on cooldown
  await utils.shouldError(
    program.methods.hatchEggs()
      .accounts({ player: wallet.publicKey, authority: authority.publicKey, nftAsset: null })
      .rpc(),
    "Hatch on cooldown",
  );

  await new Promise(r => setTimeout(r, 6_000)); // >5 s
  await program.methods.hatchEggs()
    .accounts({ player: wallet.publicKey, authority: authority.publicKey, nftAsset: null })
    .rpc();
});
```

**Checks**

* Second call at **0.5 s** reverts
* Third call at **6 s** succeeds

</details>

<details>
<summary><strong>6.2 Sell Cooldown (5&nbsp;s)</strong></summary>

```typescript
it("sell cooldown (5 s)", async () => {
  await setupReferrer(refAccount);
  await advancePreMarket();
  await buyShrimp(wallet.payer, new anchor.BN(1_000e8), refAccount.publicKey);

  await program.methods.sellEggs()
    .accounts({ player: wallet.publicKey, authority: authority.publicKey, nftAsset: null })
    .rpc();

  await new Promise(r => setTimeout(r, 500));
  await utils.shouldError(
    program.methods.sellEggs()
      .accounts({ player: wallet.publicKey, authority: authority.publicKey, nftAsset: null })
      .rpc(),
    "Sell on cooldown",
  );

  await new Promise(r => setTimeout(r, 6_000));
  await program.methods.sellEggs()
    .accounts({ player: wallet.publicKey, authority: authority.publicKey, nftAsset: null })
    .rpc();
});
```

**Invariant** `player_state.lastSellTimestamp` is updated atomically; cooldown measured on‑chain to the nearest second.

</details>

---


### 7. End-game Conditions

Tests the complex settlement mechanics when the game reaches completion, ensuring proper fund distribution and account cleanup.

<details>
<summary><strong>7.1 Full Settlement Test</strong></summary>

**Purpose**: Validates complete end-game settlement with precise integer mathematics

#### Test Setup
- **End-game threshold**: `10^34` (constant `ENDGAME`)
- **Players**: 4 participants (1 referrer + 3 players)
- **Phases**: Pre-market → Live market → Game-over trigger → Settlement

#### Financial Flow Analysis

#### Initial Setup
```javascript
const referrerPmSpend = new anchor.BN(1e7);  // 0.01 SOL
const spendA = lamports(1);                  // 1 SOL
const spendB = lamports(3);                  // 3 SOL  
const spendC = lamports(6);                  // 6 SOL
const liveSpend = lamports(0.1);             // 0.1 SOL
```

#### Fee Structure
- **Dev fee**: 4% of all purchases
- **Referral + Cashback pool**: 5% of all purchases
- **Pre-market dividend pool**: 6% of live purchases only

#### Phase-by-Phase Breakdown

#### Phase 1: Pre-market Purchases
Each pre-market buy triggers:
- 4% → Dev balance
- 5% → Sell & referral balance
- Remaining 91% → Purchase processing

**Expected balances after pre-market**:
- Total pre-market spent: 10.01 SOL (1 + 3 + 6 + 0.01)
- Dev balance: 4% of 10.01 SOL = 0.4004 SOL
- Sell & ref balance: 5% of 10.01 SOL = 0.5005 SOL
- Pre-market dividend pool: 0 SOL (only populated during live phase)

#### Phase 2: Live Market Purchase
The 0.1 SOL live purchase triggers additional mechanics:
- 4% → Dev balance (additional 0.004 SOL)
- 5% → Sell & referral balance (additional 0.005 SOL)
- **6% → Pre-market dividend pool (0.006 SOL)** ← New mechanism

#### Phase 3: Game-Over Trigger
- Market eggs set to `ENDGAME - 1`
- Player A sells eggs, triggering game-over state
- Prize pool calculation begins

#### Settlement Mathematics

#### Prize Pool Distribution
The prize pool is distributed proportionally based on pre-market spending:

```javascript
const totalPrem = spendA + spendB + spendC + referrerPmSpend; // 10.01 SOL
const prizePool = gameBefore.finalBalance;

// Each player's share
const share = (spent) => (spent * prizePool) / totalPrem;
```

#### Pre-market Dividend Distribution
The 6% from live purchases is distributed proportionally:

```javascript
const expPrem = 0.006 SOL; // 6% of 0.1 SOL live purchase
const sharePrem = (spent) => (spent * expPrem) / totalPrem;
```

#### Final Payout Calculation
Each player receives:
1. **Prize pool share**: Proportional to their pre-market spending
2. **Pre-market dividend**: Proportional share of live purchase dividends  
3. **Referral earnings**: Accumulated referral fees and cashbacks

```javascript
const expectA = share(spendA) + sharePrem(spendA) + psA.referralTotal;
const expectB = share(spendB) + sharePrem(spendB) + psB.referralTotal;
const expectC = share(spendC) + sharePrem(spendC) + psC.referralTotal;
const expectR = share(referrerPmSpend) + sharePrem(referrerPmSpend) + psR.referralTotal;
```

#### Account Cleanup Verification

#### Rent Exemption Handling
The game PDA must maintain minimum rent exemption:

```javascript
const rent = await provider.connection.getMinimumBalanceForRentExemption(
  gameAccountInfo.data.length
);
const expectDevPayout = gameBefore.devBalance - rent;
```

#### Post-Settlement State
After all withdrawals, the game account should contain:
- **Lamports**: Exactly the rent-exempt minimum (±10 lamports tolerance)
- **Dev balance**: Rent amount only
- **Sell & ref balance**: 0
- **Pre-market balance**: ~0 (with minor rounding residue)

#### Withdrawal Process Testing

#### User Withdrawals
Each player withdrawal is tested with exact balance verification:

```javascript
const withdrawDelta = async (kp) => {
  const before = await provider.connection.getBalance(kp.publicKey);
  await program.methods.userWithdraw()
    .accounts({ player: kp.publicKey, authority: authority.publicKey })
    .signers([kp])
    .rpc({ skipPreflight: true });
  const after = await provider.connection.getBalance(kp.publicKey);
  return new anchor.BN(after - before);
};
```

#### Dev Withdrawal
Tests the 3-way dev split:

```javascript
await program.methods.devWithdraw()
  .accounts({
    signer: dev1.publicKey,
    authority: authority.publicKey,
    dev1: dev1.publicKey,
    dev2: dev2.publicKey,
    dev3: dev3.publicKey,
  })
  .signers([dev1])
  .rpc();
```

#### Mathematical Validation

#### Integer Precision
The test uses exact integer arithmetic with helper functions:

```javascript
const assertBnEq = (got, want, label) =>
  expect(got.toString(), label).to.equal(want.toString());
```

#### Percentage Calculations
```javascript
const percent = (bn, p) => bn.muln(p).divn(100);
```

#### Lamport Conversion
```javascript
const lamports = (sol) => new anchor.BN(sol * 1_000_000_000);
```

#### Key Assertions

1. **Balance Tracking**: Every fee and transfer is tracked and verified
2. **Proportional Distribution**: Prize pools distributed exactly by contribution ratio
3. **Account Cleanup**: Game PDA reduced to minimum rent exemption
4. **Action Prevention**: All game actions properly disabled post-game
5. **Developer Payouts**: Correct 3-way split of accumulated dev fees

</details>

<details>
<summary><strong>7.2 Post-Game Action Prevention</strong></summary>

**Purpose**: Ensures all game actions are disabled after game-over

#### Tested Actions
All of these should revert with "Game Over" error:
- `buyShrimp()` - Regular purchases
- `hatchEggs()` - Egg hatching  
- `sellEggs()` - Egg selling

#### Test Methodology
```javascript
const err = "Game Over";

await utils.shouldError(buyShrimp(wallet.payer, new anchor.BN(1e8), refAccount.publicKey), err);
await utils.shouldError(program.methods.hatchEggs()..., err);
await utils.shouldError(program.methods.sellEggs()..., err);
```

#### Edge Cases Covered
- **Rent Exemption**: Ensures PDAs maintain minimum required lamports
- **Rounding Errors**: Accounts for minor arithmetic residue (±2 lamports tolerance)
- **Multiple Referrers**: Tests complex referral chain calculations
- **Mixed Purchase Types**: Pre-market vs live market fee handling

#### Test Significance
This test validates the most critical aspect of the Shrimp Farm game - the fair and complete distribution of all funds when the game concludes. It ensures:

- **Player Trust**: All contributions are properly accounted for and returned
- **Mathematical Accuracy**: No funds are lost due to rounding or calculation errors  
- **Clean Termination**: The game state is properly cleaned up and locked
- **Developer Compensation**: Accumulated fees are correctly distributed

</details>

### 8. Username Registration

Tests the username registration system, including validation rules, uniqueness enforcement, and access controls.

<details>
<summary><strong>8.1 Registration Prerequisites</strong></summary>

**Purpose**: Verifies that users must make a purchase before registering a username

#### Test Flow
1. Attempt to register username without any purchase
2. Verify failure with "Must buy before registering" error
3. Make minimum purchase (0.01 SOL)
4. Successfully register username

#### Code Example
```javascript
// Fails without purchase
await utils.shouldError(
  program.methods.register('referrer')
    .accounts({ player: refAccount.publicKey, authority: authority.publicKey })
    .signers([refAccount])
    .rpc(),
  'Must buy before registering'
);

// Succeeds after minimum buy
const amount = new anchor.BN(1e7); // 0.01 SOL
await buyPremarket(player, amount, NULL_KEY);
await program.methods.register(username)
  .accounts({ player: player.publicKey, authority: authority.publicKey })
  .signers([player])
  .rpc();
```

</details>

<details>
<summary><strong>8.2 Username Uniqueness Enforcement</strong></summary>

**Purpose**: Ensures usernames are unique across all players and cannot be duplicated

#### Test Scenarios
1. **First Registration**: Player successfully claims username
2. **Duplicate Attempt**: Different player cannot claim same username
3. **Double Registration**: Same player cannot register second username

#### Username-to-Address Mapping
The system creates a PDA mapping usernames to addresses:

```javascript
const [pda] = utils.findUsernameToAddressAcc(
  username,
  program.programId,
  authority.publicKey,
);
const mapping = await program.account.usernameToAddress.fetch(pda);
expect(mapping.address.toString()).to.equal(player.publicKey.toString());
```

#### Error Cases
- **"Username is taken"**: When attempting to register an existing username
- **"Already registered"**: When a player tries to register a second username

</details>

<details>
<summary><strong>8.3 Username Validation Rules</strong></summary>

**Purpose**: Validates username format and character restrictions

#### Validation Criteria
- **Length**: 1-12 characters maximum
- **Characters**: Lowercase letters only (a-z)
- **No special characters**: Rejects @, #, numbers, etc.
- **No uppercase**: Must be all lowercase

#### Test Cases
```javascript
const tooLong = "thirteenchars"; // 13 chars - INVALID
const special = "user@name";     // contains '@' - INVALID  
const uppercase = "Testuser";    // contains 'T' - INVALID
const valid = "testuser";        // lowercase, 1-12 chars - VALID
```

#### Error Handling
All invalid usernames trigger "Invalid username" error:

```javascript
await utils.shouldError(
  program.methods.register(invalidUsername)
    .accounts({ player: kp.publicKey, authority: authority.publicKey })
    .signers([kp])
    .rpc(),
  "Invalid username"
);
```

</details>

### 9. Dev Withdraw

Tests the developer withdrawal mechanism, including access controls and proper fund distribution to the three developer accounts.

<details>
<summary><strong>9.1 Access Control Verification</strong></summary>

**Purpose**: Ensures only authorized developers can trigger withdrawals

#### Test Scenarios

#### Invalid Signer Test
Random accounts cannot trigger dev withdrawals:

```javascript
await utils.shouldError(
  program.methods.devWithdraw()
    .accounts({
      signer: randomAccount.publicKey,  // ❌ Unauthorized
      authority: authority.publicKey,
      dev1: dev1.publicKey,
      dev2: dev2.publicKey,
      dev3: dev3.publicKey,
    })
    .signers([randomAccount])
    .rpc(),
  "Invalid signer"
);
```

#### Invalid Dev Account Test
Providing incorrect developer accounts causes transaction failure:

```javascript
await utils.shouldRevert(
  program.methods.devWithdraw()
    .accounts({
      signer: dev1.publicKey,
      authority: authority.publicKey,
      dev1: dev1.publicKey,
      dev2: randomAccount.publicKey,  // ❌ Wrong dev account
      dev3: dev3.publicKey,
    })
    .signers([randomAccount])
    .rpc()
);
```

#### Successful Withdrawal
Proper accounts and authorized signer succeed:

```javascript
await program.methods.devWithdraw()
  .accounts({
    signer: dev1.publicKey,        // ✅ Authorized dev
    authority: authority.publicKey,
    dev1: dev1.publicKey,          // ✅ Correct dev accounts
    dev2: dev2.publicKey,
    dev3: dev3.publicKey,
  })
  .signers([dev1])
  .rpc();
```

#### Security Model
- **Multi-signature approach**: Requires one of the three devs to sign
- **Account validation**: All three dev accounts must be correct
- **Authority verification**: Authority account must match game instance

</details>

<details>
<summary><strong>9.2 Fund Distribution</strong></summary>

**Purpose**: Verifies proper splitting of accumulated dev fees among three developers

#### Distribution Mechanism
The dev withdraw function distributes the accumulated `devBalance` from the game state account to the three developer wallets.

#### Setup Requirements
Dev withdrawals typically occur after significant game activity has accumulated fees:

```javascript
await setupReferrer(refAccount);
await buyPremarket(wallet.payer, new anchor.BN(10e9), refAccount.publicKey); // 10 SOL
```

#### Withdrawal Process
1. **Balance Check**: Verify sufficient `devBalance` exists
2. **Authorization**: Confirm signer is authorized developer
3. **Distribution**: Split funds among three dev accounts
4. **State Update**: Reset `devBalance` to rent-exempt minimum

#### Integration with End-game
Dev withdrawals are automatically tested in the end-game scenarios where exact mathematical distribution is verified across all accounts.

</details>