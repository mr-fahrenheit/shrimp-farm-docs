---
title: String-Based Usernames
sidebar_label: String-Based Usernames
sidebar_class_name: sidebar-h3
---

## What are String-Based Usernames?

**String-Based Usernames** let players use memorable names instead of wallet addresses for referrals.  
Players can register a unique username that maps to their wallet address.  
Other players can then refer using the username string instead of the full public key.

This makes referrals much more user-friendly:
- Share "shrimpking" instead of "7xKz...9fGh"  
- Easier to remember and communicate
- Still backed by the same account-based validation system

Username requirements are configurable but default to 1-12 lowercase ASCII letters only.

---

## How username registration works

The username system creates bidirectional mappings between addresses and usernames through two separate account types.

### 1  Account Structure (`state.rs`)

Two account types handle the username mapping:

1. `UsernameToAddress`: Maps username strings to wallet addresses
2. `AddressToUsername`: Maps wallet addresses back to their usernames
3. Both accounts use PDAs seeded with the relevant data

<details>
<summary>Show the Rust</summary>

```rust title="state.rs"
// Usernames
#[account]
#[derive(InitSpace)]
pub struct UsernameToAddress {
    pub address: Pubkey,
}

impl UsernameToAddress {
    pub const SEED: &'static [u8] = b"username_to_address";
}

#[account]
#[derive(InitSpace)]
pub struct AddressToUsername {
    #[max_len(12)]
    pub username: String,
}

impl AddressToUsername {
    pub const MAX_USERNAME_LENGTH: usize = 12;
    pub const SEED: &'static [u8] = b"address_to_username";
}
```

</details>

### 2  Registration Process (`register.rs`)

Players register usernames through a dedicated instruction:

1. Validate username format (1-12 lowercase ASCII characters by default)
2. Check the player meets minimum buy requirements
3. Ensure username isn't already taken
4. Create bidirectional mapping accounts
5. Mark player as registered and emit event

Username format rules are configurable and can be adjusted based on game requirements.

<details>
<summary>Show the Rust</summary>

```rust title="instructions/register.rs"
#[derive(Accounts)]
#[instruction(username: String)]
pub struct Register<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    /// CHECK: Does not impact anything
    #[account()]
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
        space = 8 + UsernameToAddress::INIT_SPACE,
        seeds = [UsernameToAddress::SEED, username.as_bytes(), authority.key().as_ref()],
        bump
    )]
    pub username_to_address_account: Account<'info, UsernameToAddress>,

    #[account(
        init_if_needed,
        payer = player,
        space = 8 + AddressToUsername::INIT_SPACE,
        seeds = [AddressToUsername::SEED, player.key().as_ref(), authority.key().as_ref()],
        bump
    )]
    pub address_to_username_account: Account<'info, AddressToUsername>,

    /// CHECK: account constraints checked in account trait
    #[account(address = sysvar::instructions::id())]
    pub sysvar_instructions: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn register(ctx: Context<Register>, username: String) -> Result<()> {
    // Check transaction restrictions
    limit_instructions(&ctx.accounts.sysvar_instructions, ctx.accounts.game_state.max_ixs, &ctx.accounts.game_state.program_whitelist).unwrap();

    // Username must be 1-12 characters, all lowercase ASCII letters
    if username.len() < 1
        || username.len() > AddressToUsername::MAX_USERNAME_LENGTH
        || !username.chars().all(|c| c.is_ascii_lowercase())
    {
        return err!(CustomErrors::InvalidUsername);
    }

    // Check player has at least a minimum buy
    require!(ctx.accounts.player_state.market_spent + ctx.accounts.player_state.premarket_spent >= MIN_BUY, CustomErrors::MinBuyNotMet);

    // Get state
    let game_state = &mut ctx.accounts.game_state;
    let username_to_address = &mut ctx.accounts.username_to_address_account;
    let address_to_username = &mut ctx.accounts.address_to_username_account;

    // Check if username is taken
    if username_to_address.address != Pubkey::default()
        && username_to_address.address != *ctx.accounts.player.key
    {
        return err!(CustomErrors::UsernameTaken);
    }

    // Check if player address has already registered
    if !address_to_username.username.is_empty() {
        return err!(CustomErrors::AlreadyRegistered);
    }

    // Update state
    address_to_username.username = username.clone();
    username_to_address.address = *ctx.accounts.player.key;
    ctx.accounts.player_state.registered = true;

    // Emit event
    let now: u64 = clock::Clock::get().unwrap().unix_timestamp.try_into().unwrap();
    emit!(UserRegistered {
        event_index: game_state.event_index,
        player: ctx.accounts.player.key(),
        username,
        timestamp: now,
    });

    // Update indexes
    game_state.event_index = game_state.event_index.checked_add(1).unwrap();

    Ok(())
}

#[event]
pub struct UserRegistered {
    /// The unique sequential index of this event.
    pub event_index: u64,
    /// The address of player registering.
    pub player: Pubkey,
    /// The selected username of player.
    pub username: String,
    /// The timestamp when the event was emitted.
    pub timestamp: u64,
}
```

</details>

### 3  Frontend Integration

The frontend handles username lookups through simple account fetches:

1. **Check Availability**: Fetch the `UsernameToAddress` PDA to see if a username is taken
2. **Resolve Username**: Convert usernames to addresses for referral transactions  
3. **Reverse Lookup**: Get a player's username from their wallet address

<details>
<summary>Show the JavaScript</summary>

```javascript title="frontend/username-utils.js"
export const checkUsernameAvailability = async (connection, wallet, username) => {
  try {
    const provider = await getProvider(connection, wallet);
    let program = new anchor.Program(idl, provider);
   
    // Attempt to fetch the UsernameToAddress PDA account
    const [usernameToAddressAccount] = await utils.findUsernameToAddressAcc(username, authority);
    let addr = await program.account.usernameToAddress.fetch(usernameToAddressAccount);
 
    // If the account exists (fetch doesn't throw an error), the username is taken
    return addr;
  } catch (error) {
    if (error.message.includes("Account does not exist")) {
      return false;
    } else {
      console.error("Error while checking username availability:", error);
      return false;
    }
  }
};

/**
 * Fetch a username directly from the on-chain AddressToUsername PDA.
 * Returns `null` when the PDA is missing or on any error.
 */
export const getUsernameByAddress = async (connection, targetAddress) => {
  try {
    // read-only provider is fine (wallet param left undefined)
    const provider = await getProvider(connection);
    const program  = new anchor.Program(idl, provider);
    const [addrToUserPda] = utils.findAddressToUsernameAcc(
      new PublicKey(targetAddress),
      AUTHORITY,                 // same constant declared above
    );
    const account = await program.account.addressToUsername.fetch(addrToUserPda);
    return account.username;     // normal JS string
  } catch (err) {
    if (err?.message?.includes("Account does not exist")) return null;
    console.error("getUsernameByAddress error:", err);
    return null;
  }
};

export const checkAddressAssociation = async (connection, wallet) => {
  try {
    const provider = await getProvider(connection, wallet);
    let program = new anchor.Program(idl, provider);
   
    // Attempt to fetch the AddressToUsername PDA account
    const [addressToUsernameAccount] = utils.findAddressToUsernameAcc(wallet.publicKey, authority);
   
    let username = await program.account.addressToUsername.fetch(addressToUsernameAccount);
    return username.username;
  } catch (error) {
    if (error.message.includes("Account does not exist")) {
      return false;
    } else {
      console.error("Error while checking address association:", error);
      return false;
    }
  }
};
```

</details>

### 4  Username-Based Referrals

When making a buy with a username referral:

1. The frontend resolves the username to a wallet address using the `UsernameToAddress` account
2. Pass the resolved address to the standard buy instruction
3. The contract validates the referrer through normal account-based flow
4. Process the referral using the existing referral system

This system provides the convenience of memorable names while maintaining the security and validation of the underlying account-based referral system.