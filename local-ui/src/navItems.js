// Verified, non-redundant application navigation items
// Only pages and screens that genuinely exist in Sanjeevani Lekh are included.
export const NAV_ITEMS = [
  {
    label: 'Paramedic Field App',
    description: 'Offline voice dictation, clinical OCR, and verified ePCR handover.',
    links: [
      { label: 'Voice & Text Capture', href: '/app?screen=capture', screen: 'capture' },
      { label: 'Clinical Review & Verification', href: '/app?screen=review', screen: 'review' },
      { label: 'Handover Report (ePCR)', href: '/app?screen=handover', screen: 'handover' }
    ]
  },
  {
    label: 'Security & Cryptographic Trust',
    description: 'Tamper-evident forward SHA-256 blockchain ledger & vitals telemetry.',
    links: [
      { label: 'Interactive Tamper Demo', href: '/#tamper-demo', screen: null },
      { label: 'Audit Verification Ledger', href: '/app?screen=audit', screen: 'audit' },
      { label: 'Real-Time Vitals Telemetry', href: '/#hero', screen: null }
    ]
  },
  {
    label: 'Documentation & Architecture',
    description: 'System architecture, dual-zone offline flow & API specs.',
    links: [
      { label: 'System Architecture & Flow', href: '/docs', screen: 'docs' },
      { label: '10-Step Clinical Pipeline', href: '/docs#pipeline', screen: 'docs' },
      { label: 'Cryptographic Ledger & API', href: '/docs#hash-chain', screen: 'docs' }
    ]
  }
];
