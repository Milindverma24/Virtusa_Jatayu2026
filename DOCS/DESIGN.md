# Design

How Field-to-Record looks, feels, and behaves for the people using it.

---

## 1. Design principles

1. **Busy hands, quick eyes.** A paramedic may have gloves on and a patient in front of them. Big buttons, few steps, nothing to type if they don't want to. 
2. **Never hide uncertainty.** If the AI isn't sure, the screen shows it loudly. A flagged item is never quietly accepted.
3. **The original words are always visible.** Every extracted value links back to the exact words it came from.
4. **The human decides.** The AI makes a draft. Only the responder can confirm it.
5. **Works in bad conditions.** Bright sunlight, dark ambulances, shaky hands, no internet.

## 2. Users and their moments

| User | Moment | What they need |
|---|---|---|
| Paramedic | Mid-treatment | Tap once, speak, done |
| Paramedic | After the patient is stable | Review the draft, fix flags, confirm |
| Nurse | At handover | One clear page: what, how much, how, when |
| Supervisor | Later, at a desk | All records, flags, and proof nothing was changed |

## 3. Screens (local responder app)

### 3.1 Capture

```
┌─────────────────────────────────────────┐
│  Field-to-Record          ● Offline     │
│  Encounter ENC-4F2A91B7    14:31        │
├─────────────────────────────────────────┤
│                                         │
│              ┌───────────┐              │
│              │           │              │
│              │    🎙      │              │
│              │  HOLD TO  │              │
│              │   SPEAK   │              │
│              └───────────┘              │
│                                         │
│      [ ⌨  Type note ]  [ 📷 Photo ]      │
│                                         │
│  Recent:                                │
│  14:32  aspirin 324 mg PO        ✓      │
│  14:35  IV access 18G            ⚠      │
└─────────────────────────────────────────┘
```

- Big hold-to-speak button (at least 120 × 120 px). Release to stop.
- A live timer and audio level bar while recording.
- Status pill at the top: **● Offline** (grey) or **● Online, 3 to sync** (blue).

### 3.2 Processing

```
┌─────────────────────────────────────────┐
│  ✓ Audio received                       │
│  ✓ Transcribed            3.1 s         │
│  ◌ Extracting medications…              │
└─────────────────────────────────────────┘
```

Shows each step with a tick and the time it took. No vague spinner.

### 3.3 Review (the most important screen)

```
┌──────────────────────────────────────────────────────────────┐
│  Review draft                         2 items need review ⚠  │
├───────────────────────────┬──────────────────────────────────┤
│  WHAT YOU SAID            │  WHAT WAS RECORDED               │
│                           │                                  │
│  14:32 gave [aspirin 324  │  ✓ 14:32 Aspirin                 │
│  mg PO chewed]. IV 18     │     324 mg · PO        [Edit]    │
│  gauge left AC. Then      │                                  │
│  [nitro point four under  │  ⚠ 14:38 Nitroglycerin           │
│  the tongue].             │     0.4 mg · SL        [Edit]    │
│                           │     Time not stated — guessed?   │
│  [ Edit text & re-run ]   │     [ Accept ] [ Fix ] [ Remove ]│
│                           │                                  │
│                           │  ⚠ IV access                     │
│                           │     18G · left AC      [Edit]    │
│                           │     No time stated               │
│                           │                                  │
│                           │  [ + Add item ]                  │
├───────────────────────────┴──────────────────────────────────┤
│  Responder ID: [ Medic-07 ]     [ CONFIRM RECORD ] (locked)  │
└──────────────────────────────────────────────────────────────┘
```

- **Left:** original text. Words used for each item are highlighted. Tapping an item on the right highlights its words on the left.
- **Right:** extracted items as cards.
- **Flagged cards** have an amber border, a ⚠ icon, and a plain reason ("Dose is higher than usual for this drug", "These words weren't found in your note").
- **Confirm is locked** until every flagged card is accepted, fixed, or removed.
- On narrow screens, the two columns stack, with the original text collapsible above.

### 3.4 Confirmed

```
┌─────────────────────────────────────────┐
│  ✓ Record saved                         │
│  ENC-4F2A91B7 · 14:41 · Medic-07        │
│  Hash 9f3a…c21e                         │
│                                         │
│  [ View handover report ]  [ New note ] │
└─────────────────────────────────────────┘
```

### 3.5 Handover report

A single printable page:

```
FIELD-TO-RECORD · HANDOVER                     ENC-4F2A91B7
Generated 14:52 · Confirmed by Medic-07 · Chain verified ✓

MEDICATIONS
Time    Drug             Dose     Route   Notes
14:32   Aspirin          324 mg   PO      chewed
14:38   Nitroglycerin    0.4 mg   SL

PROCEDURES
Time    Procedure        Details
14:35   IV access        18G, left antecubital

Record hash: 9f3a4b…c21e   Prev: 1d77e0…a903
Source: voice · Model: medgemma1.5 · Prompt: extract-v1.0
This is a draft aid, not a medical device record.
```

### 3.6 Audit view

- Timeline of every saved row for the encounter.
- Corrections shown as "Correction of #12" with a link to the original.
- A **Verify chain** button. Green "Chain intact" or red "Chain broken at row #14".

## 4. Cloud dashboard (Vercel)

Read-only. For supervisors and auditors.

| Page | Content |
|---|---|
| Encounters | Table: ID, device, time, number of items, flags, sync status |
| Encounter detail | Same layout as the handover report, plus raw text |
| Audit | Chain status per device, last verified time |
| Stats | Records per day, % flagged, most common flag reasons |

## 5. Visual style

### Colour

| Role | Light | Dark | Use |
|---|---|---|---|
| Background | `#F7F8FA` | `#0F1216` | Page |
| Surface | `#FFFFFF` | `#181C22` | Cards |
| Text | `#14171C` | `#E8EBEF` | Main text |
| Muted text | `#5B6472` | `#9AA3AF` | Labels |
| Primary | `#1F5EFF` | `#5B8CFF` | Buttons, links |
| Success | `#1E8E4E` | `#3CCB7F` | Confirmed, chain OK |
| Warning | `#B86E00` | `#F5A524` | Needs review |
| Danger | `#C62828` | `#FF6B6B` | Errors, chain broken |

- Dark mode by default (ambulances at night). Follows system setting.
- Never use colour alone. Every state also has an icon and a word.

### Type

- **Inter** for interface text. **JetBrains Mono** for hashes, times, and doses.
- Body 17 px minimum. Doses and drug names 20 px, semi-bold.
- Bundled locally so it works offline.

### Layout

- 8 px spacing grid.
- Touch targets at least 48 × 48 px. Main action 120 px.
- Works from 375 px (phone) to 1440 px (laptop).

## 6. Interaction rules

| Situation | Behaviour |
|---|---|
| Hold-to-speak released under 1 s | Ignore, show "Hold to record" |
| No speech detected | "Didn't catch that. Try again." |
| Low OCR confidence | Low lines highlighted in amber in the original text |
| Model running slow | After 10 s show "Still working…" with a cancel button |
| Ollama not running | Full-screen banner: "AI engine is off. Open Ollama." |
| Editing an item | Inline form. Dropdowns for route and unit, number field for dose |
| Removing an item | Undo toast for 5 s |
| Leaving with an unconfirmed draft | Warning dialog. Drafts kept locally until confirmed or discarded |

## 7. Writing style in the app

- Plain words. "Needs review", not "Low confidence entity".
- Say what to do. "Check this dose" instead of "Validation error".
- Spell out abbreviations on hover (PO = by mouth, SL = under the tongue).

## 8. Accessibility

- WCAG 2.1 AA contrast.
- Full keyboard use: `Space` to record, `Tab` through cards, `Enter` to confirm.
- Screen reader labels on every icon and status.
- Respects reduced motion.

## 9. Data design rules

- Doses are always a number plus a unit. Never free text like "a little".
- Times are `HH:MM` 24-hour, local device time, with full UTC timestamp stored.
- Routes and units come from a fixed list (see `PROMPTS.md`).
- Every item keeps its `source_text`.
- Drug names are stored in lowercase generic form ("nitroglycerin", not "nitro" or "NTG"), with the spoken form kept in `source_text`.
