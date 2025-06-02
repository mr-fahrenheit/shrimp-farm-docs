// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Shrimp Farm Docs',
  tagline: 'Shrimp Farm on Solana',
  favicon: 'img/egg.png',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://mr-fahrenheit.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/shrimp-farm-docs/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'mr-fahrenheit', // Usually your GitHub org/user name.
  projectName: 'shrimp-farm-docs', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          // 👇 Add this line ↓
          routeBasePath: '/',      // removes “/docs” from every URL

          path: 'docs',            // keep using the existing folder
          sidebarPath: './sidebars.js',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: 'img/docusaurus-social-card.jpg',
      navbar: {
        title: 'Shrimp Farm',
        logo: {
          alt: 'Shrimp Farm Logo',
          src: 'img/egg.png',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'mainSidebar',
            position: 'left',
            label: 'Documentation',
          },
          {
            href: 'https://shrimpfarm.fun/',
            label: 'Main Site',
            position: 'right',
          },
          {
            href: 'https://github.com/mr-fahrenheit/shrimp-farm',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Documentation',
            items: [
              {
                label: 'Developer Guide',
                to: 'developer-guide',
              },
              {
                label: 'Technical Reference',
                to: 'reference',
              },
            ],
          },
          {
            title: 'Links',
            items: [
              {
                label: 'Shrimp Farm',
                href: 'https://shrimpfarm.fun/',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/mr-fahrenheit/shrimp-farm',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Shrimp Farm. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['rust', 'toml'], // Add Rust support for Solana code
      },
    }),
};

export default config;