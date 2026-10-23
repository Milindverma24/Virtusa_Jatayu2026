import { createContext, useContext } from 'react';

export const NetContext = createContext({ online: false, setOnline: () => {} });
export const useNet = () => useContext(NetContext);

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Real SHA-256 hex digest via SubtleCrypto, with a small non-cryptographic fallback for insecure contexts. */
export async function sha256Hex(text) {
  try {
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    /* fall through to the fallback */
  }
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  return ((h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')).repeat(4);
}
