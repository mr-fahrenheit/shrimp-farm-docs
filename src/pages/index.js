// src/pages/index.js
import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";

export default function Home() {
  // every GIF that lives in /static/img
  const gifs = [
    "/img/construction.gif",
    "/img/webmaster.gif",
    "/img/construction2.gif",
    "/img/construction3.gif",
  ];

  return (
    <Layout
      title="Shrimp Farm Docs"
      description="Official documentation hub for Shrimp Farm"
    >
      <main
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "4rem 1rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ marginBottom: "2rem", fontWeight: 600 }}>
          Shrimp Farm Docs
        </h1>

        {/* all four GIFs—simple & static */}
        {gifs.map((path, i) => (
          <img
            key={i}
            src={useBaseUrl(path)}
            alt="Under construction"
            style={{ maxWidth: 400, margin: "1rem auto" }}
          />
        ))}

        {/* quick-access links */}
        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            fontSize: "1.1rem",
            marginTop: "2rem",
          }}
        >
          {/* internal link uses <Link> to avoid full page reload */}
          <Link to="/developer-guide">Documentation</Link>

          <a
            href="https://x.com/MrFwashere"
            target="_blank"
            rel="noopener noreferrer"
          >
            Twitter / X
          </a>
          <a
            href="https://shrimpfarm.fun"
            target="_blank"
            rel="noopener noreferrer"
          >
            Website
          </a>
          <a
            href="https://github.com/mr-fahrenheit/shrimp-farm"
            target="_blank"
            rel="noopener noreferrer"
          >
            Verified Game Repo
          </a>
          <a
            href="https://github.com/mr-fahrenheit/shrimp-farm-docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Docs Repo
          </a>
          <a
            href="https://solscan.io/account/23BCUPpfPkfCu6bmPCaLgyTR8UkruWeUnEyeC5shr1mp"
            target="_blank"
            rel="noopener noreferrer"
          >
            Live Program (Solscan)
          </a>
          <a
            href="https://t.me/shrimpfarm"
            target="_blank"
            rel="noopener noreferrer"
          >
            Telegram
          </a>
          <a
            href="https://discord.gg/J3sQpfQkBG"
            target="_blank"
            rel="noopener noreferrer"
          >
            Discord
          </a>
        </nav>
      </main>
    </Layout>
  );
}
