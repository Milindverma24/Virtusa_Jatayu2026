import { getAuditRecords } from '../lib/supabase';
import StatCard from '../components/StatCard';
import ShiftBoard from '../components/ShiftBoard';
import Sparkline from '../components/Sparkline';
import IntegrityRing from '../components/IntegrityRing';
import EncounterTable from '../components/EncounterTable';

export const revalidate = 0;

const DAYS = 14;

export default async function EncountersPage() {
  const records = await getAuditRecords();
  const now = Date.now();

  // Aggregate by encounter_id
  const map = {};
  records.forEach((r) => {
    if (!map[r.encounter_id]) {
      map[r.encounter_id] = {
        encounter_id: r.encounter_id,
        device_id: r.device_id,
        first_created: r.created_at,
        last_created: r.created_at,
        responders: new Set(),
        records: [],
      };
    }
    const e = map[r.encounter_id];
    if (r.created_at < e.first_created) e.first_created = r.created_at;
    if (r.created_at > e.last_created) e.last_created = r.created_at;
    e.responders.add(r.reviewed_by);
    e.records.push(r);
  });
  const encounters = Object.values(map);

  const totalItems = records.reduce((acc, r) => acc + (r.record_json?.entry?.length || 0), 0);
  const deviceCount = new Set(records.map((r) => r.device_id)).size;

  // Encounters per day for the sparkline
  const perDay = Array.from({ length: DAYS }, () => 0);
  encounters.forEach((e) => {
    const age = Math.floor((now - new Date(e.first_created).getTime()) / 86400000);
    if (age >= 0 && age < DAYS) perDay[DAYS - 1 - age] += 1;
  });
  const peak = Math.max(...perDay);

  const rows = encounters.map((e) => ({
    id: e.encounter_id,
    device: e.device_id,
    responders: Array.from(e.responders).join(', '),
    when: new Date(e.last_created).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
    items: e.records.reduce((acc, r) => acc + (r.record_json?.entry?.length || 0), 0),
  }));

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Read-only supervisor view · synced via Supabase</div>
        <h1>The whole shift on one board.</h1>
        <p>Every vehicle gets a lane. Open any encounter to read the record and check its hash.</p>
      </div>

      <div className="stats-grid">
        <StatCard label="Field encounters" value={encounters.length} />
        <StatCard label="Confirmed clinical items" value={totalItems} />
        <StatCard label="Vehicles reporting" value={deviceCount} />
        <StatCard label="Records in chain" value={records.length} color="var(--success)" />
      </div>

      <ShiftBoard encounters={encounters} now={now} />

      <div className="mid-grid">
        <div className="card">
          <div className="card-head" style={{ marginBottom: 0 }}>
            <span className="eyebrow">Encounters, last {DAYS} days</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>peak {peak}</span>
          </div>
          <Sparkline values={perDay} />
        </div>
        <div className="card">
          <IntegrityRing total={records.length} />
        </div>
      </div>

      <EncounterTable rows={rows} />
    </div>
  );
}
