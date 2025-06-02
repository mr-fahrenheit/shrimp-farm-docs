#!/usr/bin/env node
// scripts/gen-shrimp-docs.js  – CommonJS flavour

const fs   = require('fs/promises');
const path = require('path');

const docsRoot = './docs/developer-guide';

const pages = {
  'Non-Token Based Gameplay': [],
  'Fair Launch Mechanic': [],
  'Advanced NFT Integration': [
    'Ownership Verification',
    'CPI Minting',
  ],
  'Large Data Storage': [
    'Game State Account',
    'User State Accounts',
  ],
  'Account-Based Referrals': [
    'String-Based Usernames',
    'Optional Registration Enforcement',
  ],
  'Authority-Based State Derivation': [
    'Anchor Tests',
    'Optional Game Factory',
  ],
};

(async () => {
  await fs.mkdir(docsRoot, { recursive: true });

  for (const [parent, children] of Object.entries(pages)) {
    const dir = path.join(
      docsRoot,
      parent.toLowerCase().replace(/ /g, '-'),
    );
    await fs.mkdir(dir, { recursive: true });

    // parent index page
    await fs.writeFile(
      path.join(dir, 'index.md'),
`---
title: ${parent}
sidebar_label: ${parent}
sidebar_class_name: sidebar-h1
---

> TODO — describe **${parent}** here.
`);

    // child pages
    for (const child of children) {
      const childSlug = child.toLowerCase().replace(/ /g, '-');
      await fs.writeFile(
        path.join(dir, `${childSlug}.md`),
`---
title: ${child}
sidebar_label: ${child}
sidebar_class_name: sidebar-h2
---

> TODO — describe **${child}** here.
`);
    }
  }
  console.log('✅ Shrimp Farm stubs generated');
})();
