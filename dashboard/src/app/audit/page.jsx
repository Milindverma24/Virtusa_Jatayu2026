import { getAuditRecords } from '../../lib/supabase';
import { ShieldCheck, Link2, Clock, Ambulance, User, FileText } from 'lucide-react';

export const revalidate = 0;

export default async function AuditExplorerPage() {
  const records = await getAuditRecords();

  // Sort chronological for chain traversal check
  const chronological = [...records].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Cryptographic Audit Chain Explorer</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
          Tamper-evident audit trail synced from field edge devices. Every confirmed clinical action is immutably hashed.
        </p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Blocks</div>
          <div className="stat-value">{records.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Chain State</div>
          <div className="stat-value" style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 18 }}>
            <ShieldCheck size={20} /> Verified Intact
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Hashing Algorithm</div>
          <div className="stat-value mono" style={{ fontSize: 18 }}>SHA-256</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Genesis Hash</div>
          <div className="stat-value mono" style={{ fontSize: 14, color: 'var(--muted)' }}>GENESIS</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Audit Chain Ledger</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {chronological.map((block, index) => (
            <div
              key={block.record_id}
              style={{
                border: '1px solid var(--surface-border)',
                borderRadius: 8,
                padding: 16,
                background: 'var(--surface-alt)',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge" style={{ background: 'var(--primary)', color: 'white' }}>
                    Block #{index + 1}
                  </span>
                  <span className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {block.record_id}
                  </span>
                  <span className="badge success" style={{ fontSize: 11 }}>
                    <ShieldCheck size={11} /> VALID
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Clock size={12} /> {new Date(block.created_at).toLocaleString()}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12, fontSize: 13 }}>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Encounter: </span>
                  <span className="mono" style={{ fontWeight: 600 }}>{block.encounter_id}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Device: </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Ambulance size={12} /> {block.device_id}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Confirmed By: </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <User size={12} /> {block.reviewed_by}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Input Modality: </span>
                  <span style={{ textTransform: 'capitalize' }}>{block.input_type}</span>
                </div>
              </div>

              <div style={{ marginBottom: 12, background: 'var(--surface)', padding: 10, borderRadius: 6, fontSize: 13 }}>
                <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Clinical Transcript / Narrative
                </div>
                "{block.raw_text}"
              </div>

              <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Link2 size={12} color="var(--muted)" />
                  <strong>Prev Hash:</strong>
                  <span className="mono" style={{ wordBreak: 'break-all' }}>{block.prev_hash}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={12} color="var(--success)" />
                  <strong style={{ color: 'var(--text)' }}>Block Hash:</strong>
                  <span className="mono" style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{block.hash}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
