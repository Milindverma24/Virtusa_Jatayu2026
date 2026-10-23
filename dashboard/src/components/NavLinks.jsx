'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, Database, BarChart3 } from 'lucide-react';

const LINKS = [
  { href: '/', label: 'Encounters', Icon: Database },
  { href: '/audit', label: 'Audit Explorer', Icon: ShieldCheck },
  { href: '/stats', label: 'Quality & Compliance', Icon: BarChart3 },
];

export default function NavLinks() {
  const path = usePathname() || '/';
  return (
    <nav className="nav-bar" aria-label="Dashboard sections">
      {LINKS.map(({ href, label, Icon }) => {
        const active = href === '/' ? path === '/' || path.startsWith('/encounters') : path.startsWith(href);
        return (
          <Link key={href} href={href} className={`nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
            <Icon size={15} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
