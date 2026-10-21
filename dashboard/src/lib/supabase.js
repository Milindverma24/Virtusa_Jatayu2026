import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Realistic supervisor mock data for instant preview before cloud keys are linked
const MOCK_RECORDS = [
  {
    device_id: 'ambulance-07',
    record_id: 'REC-9F3A4B21',
    encounter_id: 'ENC-4F2A91B7',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    input_type: 'voice',
    raw_text: '14:32 gave aspirin 324 mg PO chewed. IV 18 gauge left AC. 14:38 nitro point four under the tongue.',
    record_json: {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'MedicationAdministration',
            effectiveDateTime: '2026-10-21T14:32:00Z',
            medicationCodeableConcept: { text: 'aspirin' },
            dosage: { dose: { value: 324, unit: 'mg' }, route: { text: 'PO' } },
            note: [{ text: '14:32 gave aspirin 324 mg PO chewed' }]
          }
        },
        {
          resource: {
            resourceType: 'MedicationAdministration',
            effectiveDateTime: '2026-10-21T14:38:00Z',
            medicationCodeableConcept: { text: 'nitroglycerin' },
            dosage: { dose: { value: 0.4, unit: 'mg' }, route: { text: 'SL' } },
            note: [{ text: '14:38 nitro point four under the tongue' }]
          }
        },
        {
          resource: {
            resourceType: 'Procedure',
            performedDateTime: '2026-10-21T14:35:00Z',
            code: { text: 'IV access' },
            note: [{ text: 'IV 18 gauge left AC' }]
          }
        }
      ]
    },
    model_name: 'medgemma1.5',
    prompt_version: 'extract-v1.0',
    reviewed_by: 'Medic-07',
    prev_hash: 'GENESIS',
    hash: '9f3a4b21e05a2cd78129f1238491823749812739481273948712398471298374',
    received_at: new Date(Date.now() - 3500000).toISOString(),
  },
  {
    device_id: 'ambulance-03',
    record_id: 'REC-C38A1290',
    encounter_id: 'ENC-8B12CC44',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    input_type: 'image',
    raw_text: 'Anaphylaxis shock. Epi 0.3 mg IM right lateral thigh at 11:20. Placed on 15 L/min O2 non-rebreather.',
    record_json: {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'MedicationAdministration',
            effectiveDateTime: '2026-10-21T11:20:00Z',
            medicationCodeableConcept: { text: 'epinephrine' },
            dosage: { dose: { value: 0.3, unit: 'mg' }, route: { text: 'IM' } },
            note: [{ text: 'Epi 0.3 mg IM right lateral thigh at 11:20' }]
          }
        },
        {
          resource: {
            resourceType: 'MedicationAdministration',
            effectiveDateTime: '2026-10-21T11:22:00Z',
            medicationCodeableConcept: { text: 'oxygen' },
            dosage: { dose: { value: 15, unit: 'L/min' }, route: { text: 'INH' } },
            note: [{ text: '15 L/min O2 non-rebreather' }]
          }
        }
      ]
    },
    model_name: 'medgemma1.5',
    prompt_version: 'extract-v1.0',
    reviewed_by: 'Medic-12',
    prev_hash: '9f3a4b21e05a2cd78129f1238491823749812739481273948712398471298374',
    hash: 'a12bc44391827419827394871293847192837491827394817239487129384719',
    received_at: new Date(Date.now() - 7100000).toISOString(),
  }
];

export async function getAuditRecords() {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return data;
    }
  }
  return MOCK_RECORDS;
}

export async function getRecordByEncounter(encounterId) {
  const records = await getAuditRecords();
  return records.filter((r) => r.encounter_id === encounterId);
}
