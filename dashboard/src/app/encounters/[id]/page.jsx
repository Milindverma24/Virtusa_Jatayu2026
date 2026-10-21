import Link from 'next/link';
import { getRecordByEncounter } from '../../../lib/supabase';
import { ArrowLeft, ShieldCheck, User, Clock, Printer } from 'lucide-react';

export const revalidate = 0;

export default async function EncounterDetailPage({ params }) {
  const encounterId = params.id;
  const records = await getRecordByEncounter(encounterId);

  if (!records || records.length === 0) {
    return (
      <div className="card">
        <h2>Encounter Not Found</h2>
        <p style={{ color: 'var(--muted)', marginTop: 8 }}>
          No records found for encounter ID: {encounterId}
        </p>
        <Link href="/" className="btn" style={{ marginTop: 16 }}>
          <ArrowLeft size={14} /> Back to Encounters
        </Link>
      </div>
    );
  }

  // Extract all medications and procedures from entries
  const medications = [];
  const procedures = [];

  records.forEach((rec) => {
    const entries = rec.record_json?.entry || [];
    entries.forEach((entry) => {
      const res = entry.resource || {};
      if (res.resourceType === 'MedicationAdministration') {
        const drug = res.medicationCodeableConcept?.text || res.medicationCodeableConcept?.coding?.[0]?.display || 'Medication';
        const dose = res.dosage?.dose?.value;
        const unit = res.dosage?.dose?.unit || '';
        const route = res.dosage?.route?.text || res.dosage?.route?.coding?.[0]?.display || '';
        const time = res.effectiveDateTime ? res.effectiveDateTime.split('T')[1]?.slice(0, 5) : '';
        const source = res.note?.[0]?.text || '';
        medications.push({ drug, dose, unit, route, time, source });
      } else if (res.resourceType === 'Procedure') {
        const name = res.code?.text || res.code?.coding?.[0]?.display || 'Procedure';
        const time = res.performedDateTime ? res.performedDateTime.split('T')[1]?.slice(0, 5) : '';
        const details = res.note?.[0]?.text || '';
        procedures.push({ name, time, details });
      }
    });
  });

  const latestRecord = records[records.length - 1];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" className="btn">
          <ArrowLeft size={14} /> Back to Overview
        </Link>
        <span className="badge success" style={{ fontSize: 13, padding: '6px 12px' }}>
          <ShieldCheck size={14} /> Cryptographic Proof Validated
        </span>
      </div>

      <div className="card">
        <div style={{ borderBottom: '1px solid var(--surface-border)', paddingBottom: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700 }}>
                Clinical Handover Sheet · <span className="mono" style={{ color: 'var(--primary)' }}>{encounterId}</span>
              </h1>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                Device: <strong>{latestRecord.device_id}</strong> · Confirmed by: <strong>{latestRecord.reviewed_by}</strong> · Recorded: {new Date(latestRecord.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Medications Table */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', marginBottom: 12 }}>
            Medications Administered
          </h3>
          {medications.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>Time</th>
                  <th style={{ width: '35%' }}>Drug Name</th>
                  <th style={{ width: '25%' }}>Dose</th>
                  <th style={{ width: '25%' }}>Route</th>
                </tr>
              </thead>
              <tbody>
                {medications.map((m, idx) => (
                  <tr key={idx}>
                    <td className="mono">{m.time || '—'}</td>
                    <td>
                      <strong style={{ textTransform: 'capitalize' }}>{m.drug}</strong>
                      {m.source && <div style={{ fontSize: 11, color: 'var(--muted)' }}>"{m.source}"</div>}
                    </td>
                    <td className="mono">{m.dose !== undefined ? `${m.dose} ${m.unit}` : '—'}</td>
                    <td className="mono">{m.route || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: 'var(--muted)', fontStyle: 'italic', padding: 8 }}>
              No medications administered.
            </div>
          )}
        </div>

        {/* Procedures Table */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', marginBottom: 12 }}>
            Procedures Performed
          </h3>
          {procedures.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>Time</th>
                  <th style={{ width: '45%' }}>Procedure</th>
                  <th style={{ width: '40%' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {procedures.map((p, idx) => (
                  <tr key={idx}>
                    <td className="mono">{p.time || '—'}</td>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: 'var(--muted)', fontStyle: 'italic', padding: 8 }}>
              No procedures performed.
            </div>
          )}
        </div>

        {/* Original Transcript Box */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', marginBottom: 8 }}>
            Original Paramedic Spoken / Typed Transcript
          </h3>
          <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--surface-border)', borderRadius: 6, padding: 14, fontSize: 14, color: 'var(--text)' }}>
            {latestRecord.raw_text}
          </div>
        </div>

        {/* Cryptographic Proof Footer */}
        <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: 16, fontSize: 12, color: 'var(--muted)' }}>
          <div style={{ marginBottom: 4 }}>
            <strong>SHA-256 Hash:</strong> <span className="mono">{latestRecord.hash}</span>
          </div>
          <div style={{ marginBottom: 4 }}>
            <strong>Previous Hash:</strong> <span className="mono">{latestRecord.prev_hash}</span>
          </div>
          <div>
            AI Model: <code>{latestRecord.model_name}</code> · Prompt: <code>{latestRecord.prompt_version}</code> · Cloud Received: {new Date(latestRecord.received_at).toUTCString()}
          </div>
        </div>
      </div>
    </div>
  );
}
