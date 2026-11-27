import type { Story } from "./story";
import { hashString } from "./util";

/*
 * A logo for every demo business: a clean monogram badge in a colour chosen per industry,
 * as an SVG data URI (so it works as an <img src>, in the sidebar and on invoice and quote
 * layouts, with no file to host). The same colour is the business's brand colour.
 */

const PALETTE: [string, string][] = [
  ["#1e3a8a", "#3b82f6"],
  ["#0f766e", "#2dd4bf"],
  ["#9a3412", "#fb923c"],
  ["#6d28d9", "#a78bfa"],
  ["#be123c", "#fb7185"],
  ["#166534", "#4ade80"],
  ["#0e7490", "#22d3ee"],
  ["#854d0e", "#facc15"],
  ["#334155", "#94a3b8"],
  ["#a21caf", "#e879f9"],
];

export function brandFor(story: Story): { primary: string; light: string } {
  const [primary, light] = PALETTE[hashString(story.slug) % PALETTE.length];
  return { primary, light };
}

export function initialsOf(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? "S").slice(0, 2);
  return letters.toUpperCase();
}

export function businessLogo(story: Story): string {
  const { primary, light } = brandFor(story);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs>` +
    `<rect width="256" height="256" rx="56" fill="url(#g)"/>` +
    `<circle cx="206" cy="50" r="14" fill="#ffffff" fill-opacity="0.35"/>` +
    `<rect x="40" y="192" width="176" height="8" rx="4" fill="#ffffff" fill-opacity="0.55"/>` +
    `<text x="128" y="148" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="104" font-weight="700" fill="#ffffff">${initialsOf(story.business.name)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
