// Verified, non-redundant application navigation items
// Only pages and screens that genuinely exist in Sanjeevani Lekh are included.
export const NAV_ITEMS = [
  {
    label: 'Emergency Capture',
    description: 'Field voice recording, quick notes, and triage ePCR.',
    links: [
      { label: 'Voice & Text Capture', href: '/app?screen=capture', screen: 'capture' },
      { label: 'Handover Report (ePCR)', href: '/app?screen=handover', screen: 'handover' }
    ]
  },
  {
    label: 'Cryptographic Trust',
    description: 'Tamper-evident forward SHA-256 blockchain ledger.',
    links: [
      { label: 'Audit Verification Ledger', href: '/app?screen=audit', screen: 'audit' },
      { label: 'Interactive Tamper Demo', href: '/#tamper-demo', screen: null }
    ]
  },
  {
    label: 'Documentation',
    description: 'System architecture, dual-zone offline flow & API specs.',
    links: [
      { label: 'System Architecture & Flow', href: '/docs', screen: 'docs' },
      { label: '10-Step Clinical Pipeline', href: '/docs#pipeline', screen: 'docs' },
      { label: 'Cryptographic Ledger & API', href: '/docs#hash-chain', screen: 'docs' }
    ]
  }
];
