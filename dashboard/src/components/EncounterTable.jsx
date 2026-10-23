'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ShieldCheck, ArrowRight } from 'lucide-react';

/** Filterable encounter table. Rows arrive pre-formatted from the server page. */
export default function EncounterTable({ rows }) {
  const devices = Array.from(new Set(rows.map((r) => r.device)));
  const [filter, setFilter] = useState('all');

  return (
    <div className="card table-card">
      <div className="table-tools">
        <span className="eyebrow">Synced encounters</span>
        <div className="chips" role="group" aria-label="Filter by vehicle">
          <button type="button" className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>All</button>
          {devices.map((d) => (
            <button type="button" key={d} className={`chip${filter === d ? ' on' : ''}`} onClick={() => setFilter(d)}>{d}</button>
          ))}
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Encounter</th><th>Vehicle</th><th>Confirmed by</th><th>Last activity</th><th>Items</th><th>Chain</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={filter !== 'all' && filter !== r.device ? 'is-hidden' : undefined}>
                <td><span className="mono" style={{ fontWeight: 500 }}>{r.id}</span></td>
                <td><span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>{r.device}</span></td>
                <td>{r.responders}</td>
                <td><span style={{ fontSize: 13, color: 'var(--muted)' }}>{r.when}</span></td>
                <td><strong>{r.items}</strong> <span style={{ color: 'var(--muted)', fontSize: 12 }}>items</span></td>
                <td><span className="badge success"><ShieldCheck size={12} /> Verified</span></td>
                <td><Link href={`/encounters/${r.id}`} className="btn">View report <ArrowRight size={14} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
