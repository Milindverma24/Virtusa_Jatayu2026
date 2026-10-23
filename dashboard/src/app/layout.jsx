import './globals.css';
import { Database, Activity } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';
import NavLinks from '../components/NavLinks';

export const metadata = {
  title: 'Sanjeevani Lekh · Supervisor Dashboard',
  description: 'Supervisor and auditor cloud review portal for field clinical notes',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Tiro+Devanagari+Hindi&display=swap"
        />
      </head>
      <body>
        <div className="layout-wrapper">
          <header className="dashboard-header">
            <div className="brand">
              <span className="brand-mark">संजीवनी लेख</span>
              <span className="brand-sub">Supervisor &amp; Auditor Portal</span>
            </div>
            <div>
              {isSupabaseConfigured ? (
                <span className="badge success">
                  <Database size={13} /> Supabase connected
                </span>
              ) : (
                <span className="badge warning">
                  <Activity size={13} /> Demo / preview mode
                </span>
              )}
            </div>
          </header>

          <NavLinks />

          <main className="content-body">{children}</main>
        </div>
      </body>
    </html>
  );
}
