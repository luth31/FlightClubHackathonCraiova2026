# FlyLeaf operations showcase

## Three presentation scenarios

Open **Operațiuni la sol → Tura curentă**. Select a scenario; every selection creates a new run paused at 08:00 and 30×. Previous runs remain in **Registru → Arhiva turelor**. The presentation has two departures and one arrival, so only FL101 needs attention.

| Scenario | FL101 result | Other aircraft |
| --- | --- | --- |
| Tură normală | G1 opens at 08:04; departure at 08:20, on time | FL202 departs on time; FL404 arrives normally |
| Poartă deschisă târziu | The assigned agent is absent; a substitute opens G1 at 08:22; departure at 08:38, 18 minutes late | Same normal baseline |
| Înlocuire rapidă | A reserve opens G1 at 08:07; departure at 08:23, 3 minutes late | Same normal baseline |

1. Start **Poartă deschisă târziu** with **Pornește**. Use 30×–120×, the next-event button or the draggable timeline to control the pace.
2. When projected delay reaches 15 minutes, FL101 turns red. A notification and persistent alert offer **Vezi registrul**, opening that flight's event chain.
3. Explain the chain: allocation → absent agent → substitute → late gate opening → boarding → delayed departure. Actual punctuality changes only after departure; a projected risk is not a completed delay.
4. Open **Proceduri SOP** to inspect saved analysis, supporting evidence and a reviewable procedure proposal. Approved documents can continue through controlled airport sharing.
5. Select **Înlocuire rapidă** to demonstrate the earlier reserve intervention. The clock and ledger reset together; the result is a modeled comparison, not a claim of measured real-world improvement.

## Compact controls

**Tura curentă**, **Registru** and **Proceduri SOP** are the three workspace views. The ledger shows only the selected run, including the inspected timeline frame; historical seeded flights do not dilute its KPIs. Expanding an individual flight reveals its expected/actual milestones.

NFC attendance is available under **Echipă → ⋯ (Mai multe opțiuni) → Pontaj NFC** for the director and authorized operations staff. The three automatic scenarios still generate their own attendance. For a card-driven shift, expand **Opțiuni tură → Pornește tură cu pontaj**; this starts a paused shift at 08:00 and archives the preceding shift. Start the clock there or in Operațiuni de sol. Confirm arrivals on the station, then select a present operator to open G1 from the flight panel. Those events drive the ledger and departure timing.

On iOS, use NFC Tools to write each colleague's **Copiază linkul NFC** URL as a URL record. The phone opens `#people?tab=attendance&card=…`; after login, explicitly confirm **Intrare** or **Ieșire**. Opening a URL never records attendance by itself. Existing `#operations?view=station&card=…` cards still work. Copy links from the hostname the phone will use (including the Tailscale airport hostname). The station also accepts card codes through its input for a keyboard reader or rehearsal.

**Opțiuni hartă** contains the simulation/ADS-B switch and the map style. Live traffic retains its shared ten-second cache and 15-second playback buffer; it does not drive simulated delay metrics. Click **Urmărește** once to lock onto an aircraft, again to release. Map styles and camera state remain mounted when moving between workspace tabs.

The timeline spans 08:00–09:00. Scrubbing pauses a running scenario and inspects history or projection without rewriting recorded events. **Revino la tură** returns to the stored clock; **Avansează tura aici** explicitly applies a future point. **Pornește** plays from the cursor, and **Reia redarea** replays a completed run. The restart icon creates a fresh instance of the same preset.
