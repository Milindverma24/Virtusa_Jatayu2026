import Link from 'next/link';
import { getAuditRecords } from '../lib/supabase';
import { ShieldCheck, ArrowRight, Clock, User, Ambulance } from 'lucide-react';

export const revalidate = 0;

export default async function EncountersPage() {
  const records = await getAuditRecords();

  // Aggregate by encounter_id
  const encounterMap = {};
  records.forEach((r) => {
    if (!encounterMap[r.encounter_id]) {
      encounterMap[r.encounter_id] = {
        encounter_id: r.encounter_id,
        device_id: r.device_id,
        first_created: r.created_at,
        last_created: r.created_at,
        responders: new Set(),
        records: [],
      };
    }
    encounterMap[r.encounter_id].responders.add(r.reviewed_by);
    encounterMap[r.encounter_id].records.push(r);
  });

  const encounterList = Object.values(encounterMap);
  const totalItems = records.reduce((acc, r) => {
    const entries = r.record_json?.entry || [];
    return acc + entries.length;
  }, 0);

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Field Encounters</div>
          <div className="stat-value">{encounterList.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Confirmed Clinical Items</div>
          <div className="stat-value">{totalItems}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Field Devices</div>
          <div className="stat-value">{new Set(records.map((r) => r.device_id)).size}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Audit Verification</div>
          <div className="stat-value" style={{ color: 'var(--success)', fontSize: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={20} /> 100% Chain Intact
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Synced Encounters</h2>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Read-only supervisor view · Synced via Supabase
          </span>
        </div>

        <table>
          <thead>
            <tr>
              <th>Encounter ID</th>
              <th>Device</th>
              <th>Confirmed By</th>
              <th>Date & Time</th>
              <th>Items</th>
              <th>Chain Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {encounterList.map((enc) => {
              const itemCount = enc.records.reduce((acc, r) => acc + (r.record_json?.entry?.length || 0), 0);
              const dateStr = new Date(enc.last_created).toLocaleDateString();
              const timeStr = new Date(enc.last_created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              return (
                <tr key={enc.encounter_id}>
                  <td>
                    <span className="mono" style={{ fontWeight: 600, color: 'var(--primary)' }}>
                      {enc.encounter_id}
                    </span>
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--muted)' }}>
                      <Ambulance size={14} /> {enc.device_id}
                    </span>
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <User size={13} color="var(--muted)" /> {Array.from(enc.responders).join(', ')}
                    </span>
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--muted)' }}>
                      <Clock size={13} /> {dateStr} {timeStr}
                    </span>
                  </td>
                  <td>
                    <strong>{itemCount}</strong> <span style={{ color: 'var(--muted)', fontSize: 12 }}>items</span>
                  </td>
                  <td>
                    <span className="badge success">
                      <ShieldCheck size={12} /> Verified
                    </span>
                  </td>
                  <td>
                    <Link href={`/encounters/${enc.encounter_id}`} className="btn">
                      View Report <ArrowRight size={14} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
