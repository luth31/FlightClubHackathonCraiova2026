# FlyLeaf operations showcase

## The five-minute story

Use **Operațiuni la sol → Tura curentă**. The displayed clock is the demonstration's airport-local time; event records also retain the real UTC recording time. The default interactive mode never invents scans or opens a gate for the presenter. Real ADS-B traffic is a separate, read-only map mode.

1. **Before the pitch:** sign in on the presentation laptop and iPhone to the same airport. Reset to **Interactivă** and keep the clock paused. Prepare the card links below.
2. **Stage entrance:** the on-time staff scan their cards. Use the mobile confirmation to log the entry. The assigned G1 employee, Mara Stoica, has not arrived. The laptop receives the entries automatically.
3. **Reveal the problem:** advance to 08:04. G1 should open, but the assigned worker is absent. Advance to 08:22. Scan Alexandru Marin's reserve card and confirm entry. Select FL101 and open G1 with Alexandru as the operator. For the other flights, scan their assigned workers and open their gates before their due times, or leave them blocked intentionally; the metrics reflect the actual actions in this rehearsal.
4. **Show the consequence:** advance to 08:45. Boarding takes 16 modeled minutes from gate opening. FL101 leaves the stand at 08:38, 18 minutes after its 08:20 plan. Taxi follows departure from the stand; takeoff is a separate event. Closing the gate before boarding finishes pauses its progress.
5. **Explain and improve:** select **Vezi firul evenimentelor**. The expanded ledger shows scheduling, assignment, attendance, operator identity, planned/actual milestones and delay. Open **Proceduri SOP → Strategii și optimizare** to inspect the saved Luna analysis, supporting events, proposed steps and pilot. **Creează ciornă SOP** creates a full procedure document for review. After normal approval, use the existing controlled airport-sharing workflow.

Rehearse a second run with the assigned worker or a reserve present and G1 opened by 08:04. The departure can be on time. This is a causal demonstration, not a fixed animation.

**Replay automat** is a separate reset option for hands-free rehearsal. Never describe replay-generated scans as live card readings.

The draggable time axis spans 08:00–09:00. Drag its handle or use arrow keys for one-second inspection; event markers and previous/next buttons jump to milestones for the selected flight, including the substitute's NFC check-in. The map, staffing, gate state and KPIs follow the inspected time. **Istoric** reviews recorded events and **Proiecție** previews existing scenario rules. **Revino la tură** restores the active shift; **Avansează tura aici** explicitly applies a future time. Scrubbing preserves recorded history and pauses a running shift for authorized operators. The axis is separate from live ADS-B traffic.

**Camera lock:** click **Urmărește** beside the selected aircraft's details, or **Urmărește aeronava** in the map controls, once to follow it. **Urmărire activă**, the **Urmărire · FL101** badge and the highlighted lock show that following is active. Zoom and orbit remain available; selecting another flight transfers the lock. Click the active follow button/lock/badge again, use the airport overview, or press Escape to release it and pan freely. The lock survives map-style changes and timeline inspection; switching traffic source or losing the tracked ADS-B aircraft releases it. The details control is disabled when the aircraft has no mapped position.

After dragging, **Redă de aici** plays from the selected moment; **Pauză**, playback speed and next-event stepping remain available. Opening a completed run starts its viewer at 08:00, ready to replay at 30×, without resetting recorded events. Reaching the end while watching keeps the final state visible and offers **Reia redarea**. NFC opens the actual shift's station, using its recorded clock rather than the historical playback cursor.

## iPhone cards with NFC Tools

The station works in the browser; no native iOS application is claimed. iOS can open a supported NFC tag's URL. Safari does not expose the Android Web NFC scanning API. See [Apple background tag reading](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading) and [NFC Tools URL-writing instructions](https://www.wakdev.com/en/knowledge-base/how-to-guides/how-to-write-a-link-url-on-an-nfc-chip.html).

1. Open FlyLeaf at the HTTPS presentation address on the iPhone and sign in with an operations-enabled account.
2. On **Stație mobilă → Cardurile echipei**, copy the link for each person.
3. In NFC Tools choose **Write → Add a record → URL / URI**, paste the link, then write the card. The link identifies a demonstration card, not an authentication credential. Use the presentation hostname, not localhost.
4. Tap the card with the iPhone, open its notification, then press **Confirmă intrarea**. Opening a link alone never records attendance. If sign-in is required, the pending card survives the same-tab login round trip for up to 30 minutes.
5. The receipt shows the server's scenario timestamp. The laptop updates on its next poll. **Ieșire** is explicit; repeated taps never silently toggle the person's presence.

Card labels: Mara `DEMO-NFC-101`; Vlad `DEMO-NFC-102`; Ioana `DEMO-NFC-103`; Alexandru `DEMO-NFC-104`. A keyboard-style reader can enter the same label into the station. The preparation panel also supports rehearsal without hardware. Physical NFC hardware must still be rehearsed on the actual iPhone/tag combination; desktop mobile emulation checks the web flow only.

## Evidence and metrics

The ledger seeds seven historical days and three days of future plans, including scheduling three days ahead, staff/gate allocation, check-in, equipment/fuel readiness, boarding, off-block, takeoff, runway inspections, maintenance, handovers and SOP review. All of this history is explicitly synthetic. Current interactive events are persisted and update the same view.

Expand day → flight/airport activity → individual actions. Search people, actions, gates or flight numbers; filter a date or exceptions. Severity propagates to its flight and day. Forecast delays are marked as estimates; KPI totals count completed departures only. The home page uses the same metrics as the operational ledger.

The document/personnel audit remains separately permission-filtered in **Jurnal de activitate**; the operations ledger does not grant access to confidential leave records. Generated leave PDFs follow the leave workflow, retain previous versions and link back to **Echipă → Concedii**.

Luna proposals distinguish observed delay from hypothetical improvement. Observed delay is deduplicated by completed departure; pilot benefits remain unmeasured until tested. Each draft preserves the evidence and pilot plan used to generate it. The older deterministic `/strategies` endpoints remain for compatibility and are not the current UI.

## Deployment

Default development and the Tailscale presentation deployment remain separate. No global development hosts, ports or authentication mode are changed by this feature. The shared optional Google key remains available in either environment. See [TAILSCALE.md](TAILSCALE.md) for the presentation setup.

## SOP and optimization story

Open **Proceduri SOP** to browse twelve complete working procedures. Use **Analizează cu Luna** before rehearsal to prepare a saved analysis; a fresh analysis may take about a minute. In **Strategii și optimizare**, follow a citation back to its exact flight group, review the proposed steps and pilot, then create the SOP draft. Validate and obtain approval in the document workflow. Return to the procedure's local documents and choose **Partajează** to review the copy and send it to the partner airport. That action is available to the director or Conformitate reviewer only. An ordinary employee can read approved internal SOPs but cannot distribute them.
