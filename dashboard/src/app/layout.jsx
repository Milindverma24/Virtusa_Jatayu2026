import './globals.css';
import Link from 'next/link';
import { ShieldCheck, Database, BarChart3, Activity } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';

export const metadata = {
  title: 'Sanjeevani Lekh · Supervisor Dashboard',
  description: 'Supervisor and auditor cloud review portal for field clinical notes',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="layout-wrapper">
          <header className="dashboard-header">
            <div className="brand">
              <span>🚑 Sanjeevani Lekh</span>
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
                Supervisor & Auditor Portal
              </span>
            </div>
            <div>
              {isSupabaseConfigured ? (
                <span className="badge success">
                  <Database size={13} /> Supabase Connected
                </span>
              ) : (
                <span className="badge warning">
                  <Activity size={13} /> Demo / Preview Mode
                </span>
              )}
            </div>
          </header>

          <nav className="nav-bar">
            <Link href="/" className="nav-link">
              <Database size={15} /> Encounters
            </Link>
            <Link href="/audit" className="nav-link">
              <ShieldCheck size={15} /> Audit Explorer
            </Link>
            <Link href="/stats" className="nav-link">
              <BarChart3 size={15} /> Quality & Compliance
            </Link>
          </nav>

          <main className="content-body">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
