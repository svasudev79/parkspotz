"use client";

import { useState } from "react";
import { secondaryButtonClass } from "./ui";

// Copies this page's address, so a guest can keep the link to their receipt.
export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      window.prompt("Copy this link and keep it safe:", window.location.href);
    }
  }

  return (
    <button type="button" onClick={copy} className={`${secondaryButtonClass} print:hidden`}>
      {copied ? "Link copied" : "Copy the link to this receipt"}
    </button>
  );
}
