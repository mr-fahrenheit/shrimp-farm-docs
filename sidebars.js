/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  mainSidebar: [
    {
      type: 'category',
      label: 'Developer Guide',
      link: { type: 'doc', id: 'developer-guide' },
      className: 'sidebar-h0',         // custom CSS for first level
      items: [
        // 1-level docs
        'developer-guide/non-token-based-gameplay/index',
        'developer-guide/fair-launch-mechanic/index',
        'developer-guide/anchor-tests/index',

        // Nested subcategories
        {
          type: 'category',
          label: 'Advanced NFT Integration',
          link: { type: 'doc', id: 'developer-guide/advanced-nft-integration/index' },
          className: 'sidebar-h1',
          items: [
            'developer-guide/advanced-nft-integration/ownership-verification',
            'developer-guide/advanced-nft-integration/cpi-minting',
          ],
        },
        {
          type: 'category',
          label: 'Large Data Storage',
          link: { type: 'doc', id: 'developer-guide/large-data-storage/index' },
          className: 'sidebar-h1',
          items: [
            'developer-guide/large-data-storage/game-state-account',
            'developer-guide/large-data-storage/user-state-accounts',
          ],
        },
        {
          type: 'category',
          label: 'Account-Based Referrals',
          link: { type: 'doc', id: 'developer-guide/account-based-referrals/index' },
          className: 'sidebar-h1',
          items: [
            'developer-guide/account-based-referrals/string-based-usernames',
            'developer-guide/account-based-referrals/registration-enforcement',
          ],
        },
        {
          type: 'category',
          label: 'Authority-Based State Derivation',
          link: { type: 'doc', id: 'developer-guide/authority-based-state-derivation/index' },
          className: 'sidebar-h1',
          items: [
            'developer-guide/authority-based-state-derivation/game-factory',
          ],
        },
      ],
    },

    // Keep your Reference section
    {
      type: 'doc',
      id: 'reference',
      label: 'Technical Reference',
    },
  ],
};

export default sidebars;
