---
title: Advanced NFT Integration
sidebar_label: Advanced NFT Integration
sidebar_class_name: sidebar-h1
---

## Overview

Shrimp Farm integrates [Metaplex Core](https://developers.metaplex.com/core) NFTs directly into gameplay through two key innovations:

1. **CPI Minting** - NFTs are automatically minted within buy transactions when players reach spending thresholds
2. **Verified Ownership** - NFT holders receive a 10% egg production bonus through on-chain ownership verification

We chose Metaplex Core over traditional SPL tokens because Core assets are simpler (single account vs multiple), cheaper, and fit better within transaction limits for CPI minting.

We believe this is the first implementation of CPI-based Candy Machine minting and verified NFT gameplay bonuses, if not in general then certainly for Metaplex Core.

---

## Implementation

- **[NFT Minting via CPI](./cpi-minting)** - Technical details of automatic minting
- **[Ownership Verification](./ownership-verification)** - Security and bonus verification system