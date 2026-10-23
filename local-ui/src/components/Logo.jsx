import React from 'react';

/**
 * Sanjeevani Lekh mark: the Sanjeevani herb (leaf) with a heartbeat running through it.
 * Rendered on its own dark tile so it reads the same on paper and on dark surfaces.
 */
export default function Logo({ size = 32, className = '', title = 'Sanjeevani Lekh' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label={title}
    >
      <rect width="32" height="32" rx="8" fill="#0C1B22" />
      <path
        d="M16 4.2c6.4 3.7 9 9.9 6.4 15.6-1.3 2.9-3.8 5.3-6.4 8-2.6-2.7-5.1-5.1-6.4-8C7 14.1 9.6 7.9 16 4.2Z"
        stroke="#4BF2A2"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 17.5h7.2l2.1-3.4 3.1 8.6 2.6-11.2 1.8 6h8.2"
        stroke="#E4F1EC"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
