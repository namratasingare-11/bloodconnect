# BloodConnect — Editorial Swiss Live Regional Blood Radar & Interactive Vault Map

BloodConnect will be elevated from a conventional healthcare portal into an unmistakable, high-utility civic life-saving instrument. Visitors will land immediately on a **Live Regional Blood Radar** paired with a **1-Tap Emergency SOS & Family Appeal Card**, framed in an **Editorial Swiss Medical** aesthetic with hairline architectural grids, tactile live surfaces, and real-time vault telemetry across accredited hospital blood banks and upcoming donation camps.

---

## User Review & Critical Decisions

Before building begins, please confirm the plan aligns with your vision:

- **Confirmed Design Direction**: **Editorial Swiss medical design with tactile live surfaces** — crisp alabaster and pure white canvases, architectural `1px` grid rules, bold Swiss typographic hierarchy, tabular clinical readouts, and restrained surgical crimson reserved strictly for urgent status and life-saving actions.
- **Confirmed Homepage Greeting**: **Live regional blood radar and 1-tap emergency SOS card** immediately above the fold, allowing visitors to inspect real-time blood availability by neighborhood and trigger or share an emergency blood dispatch in a single tap.
- **Confirmed Standout Feature**: **Interactive regional blood map with live vault pins** — available both directly inside the homepage hero radar and as an expandable full-viewport **Live Blood Map** workspace with blood group/component filters, hospital vault pins, donation camp pins, and a tactile inspector drawer.
- **Google Maps Platform Enablement (Interactive Prompt on Proceed)**: When you approve this plan, an interactive Google Maps Platform setup prompt will appear so BloodConnect can render live interactive maps, custom `AdvancedMarkerElement` vault pins, and real-time driving ETAs via the modern Google Maps Routes API. If you choose not to enable Google Maps, BloodConnect will automatically fall back to a high-precision interactive Swiss regional coordinate map so every feature continues to work seamlessly.
- **Optional Browser Geolocation**: Clicking **Locate Nearest Vault** will request standard browser location permission on demand (never automatically on page load) to calculate distance and driving time to the closest hospital blood vault with matching stock.
- **Full Feature Preservation**: All existing production systems — server-enforced 7-tier RBAC/PBAC authentication, TOTP MFA, MySQL database integration, Vercel serverless backend, `Ctrl+K` quick search, `.ics` calendar passes, donor eligibility calculator, and all four role dashboards — remain 100% intact.

---

## 1. Overview & Core Concept

### A. Above-the-Fold Live Regional Blood Radar & 1-Tap Emergency SOS Hero
Instead of a generic marketing banner, the homepage opens directly into a disciplined two-column **Swiss Editorial Command Surface**:

- **Left Primary Surface — Live Regional Blood Radar**:
  - An interactive map spanning regional hospital vaults (Mumbai clinical hubs from Fort and Worli to Bandra, Parel, Dadar, Andheri, and Mulund) and upcoming community donation camps.
  - Custom tactile map pins display live stock health at a glance (Available in clinical emerald, Low in amber, Critical in surgical crimson, Donation Camps in slate ink) with unit counts rendered in crisp tabular monospace figures.
  - A compact **8-Group Tactile Blood Selector Strip** (`O-`, `O+`, `A-`, `A+`, `B-`, `B+`, `AB-`, `AB+`) anchored to the radar header lets anyone tap a blood group to instantly re-color every vault pin, highlight compatible substitute vaults, and update live unit counts across the map.
  - A direct **Expand Full Map** action opens the full-viewport interactive map workspace with the active blood group filter preserved.
- **Right Tactile Surface — 1-Tap Emergency SOS & Family Appeal Card**:
  - Synchronized live with the selected blood group from the radar strip, displaying exact available units across the region and the nearest vault carrying matching stock.
  - **1-Tap Emergency Dispatch**: Launches the pre-filled Emergency Blood Request flow immediately with the chosen blood group, component, and highest-stock hospital vault pre-selected.
  - **1-Tap Family SOS Appeal Generator**: Everyday families in a crisis often need to broadcast an urgent request to relatives and local WhatsApp groups. A built-in tactile utility generates a structured, clinically accurate emergency appeal card (patient blood group, compatible substitute groups, verified hospital vault contact, and live BloodConnect lookup link) with **Copy Appeal Text** and **Share via WhatsApp / SMS** actions — zero friction, no sign-in required.
  - **Quick Dispatch Status Lookup**: Inline access to track an active `REQ-` dispatch code right from the hero card.

### B. Full-Viewport Interactive Regional Blood Map Workspace
Accessible from the hero radar, primary navigation, and quick search (`Ctrl+K`), the **Blood Map** view turns regional blood availability into an effortless spatial explorer:

- **Tactile Swiss Filter Rail**: Filter simultaneously by Blood Group (all 8 types + All Groups), Blood Component (`Whole Blood`, `Packed Red Cells`, `Platelets`, `Fresh Frozen Plasma`, `Cryoprecipitate`), and Map Layers (`Hospital Vaults`, `Donation Camps`, `Show Compatible Substitutes`).
- **Locate Nearest Vault & Real-Time Driving ETA**: One-click geolocation finds the visitor's position, sorts vaults by proximity and live stock, draws the cleanest route to the selected vault, and shows real-time driving distance and travel time via the modern Google Maps Routes API.
- **Tactile Vault & Camp Inspector Drawer**: Clicking any pin slides open an architectural Swiss clinical dossier showing:
  - Verified hospital accreditation license, full street address, 1-click copy phone, and live cold-chain status.
  - Live unit breakdown across all 5 blood components and exact compatible substitute counts when a rare group (such as `O-` or `AB-`) is low.
  - Direct contextual actions: **Request Emergency Units** (pre-filled for this hospital & blood group), **Book Donation Slot Here** (pre-filled booking pass with `.ics` export), **Get Driving Directions**, and **Register for Camp** (for camp pins).
- **Synchronized List & Map Split**: On desktop, a sleek scrollable vault ledger sits alongside the map canvas (clicking a row focuses and zooms the pin; clicking a pin highlights its ledger row). On mobile, a clean Map / List toggle keeps every action thumb-reachable.

### C. Editorial Swiss Medical Design System Elevation
To ensure BloodConnect does not look like a generic SaaS template, the entire landing experience and map workspace follow strict **Swiss International Typographic Style** principles:

- **Architectural Hairline Grids**: Sharp `1px` dividers (`#E2E8F0`) separating live clinical modules instead of floating drop-shadow boxes or decorative gradients.
- **Tactile Live Surfaces**: Crisp pure-white `#FFFFFF` interactive panels seated on a cool alabaster `#F8FAFC` structural ground, with crisp dark-ink `#0F172A` active states and instant tactile press feedback (`<= 200ms` compositor transitions).
- **Editorial Data Ledger**: Below the hero radar, the landing page flows seamlessly into a Swiss-ruled **Live Regional Stock Ledger** (click any blood group row to jump straight into the Blood Map or Find Blood), a tactile **Universal Compatibility & Donation Eligibility Strip**, and the **Accredited Hospital Network & Clinical FAQ** — removing redundant visual clutter while keeping every real feature sharper and faster to reach.

---

## 2. User Experience & Visual Design

### Core User Journeys

1. **Emergency Family / Patient Crisis Flow (Under 15 Seconds)**
   - **Landing**: Visitor opens BloodConnect and immediately sees the Live Regional Blood Radar and 1-Tap Emergency SOS Card without scrolling.
   - **Filter**: Visitor taps `O-` on the tactile blood group strip; map pins immediately highlight every vault carrying `O-` units (plus compatible substitutes if stock is tight), and the SOS card updates with the closest stocked hospital and live unit count.
   - **Action**: Visitor either clicks **Dispatch Urgent Request** (pre-filled with `O-` and the closest hospital) OR clicks **Generate Family SOS Appeal** to copy/share a formatted WhatsApp message containing exact compatible types and verified blood bank numbers.
   - **Directions**: Clicking a pin opens the inspector drawer with 1-tap driving ETA and hospital phone copy.

2. **Everyday Donor & Community Explorer Flow**
   - **Discover**: Donor opens the Full Blood Map workspace and toggles on the **Donation Camps** layer alongside **Hospital Vaults**.
   - **Locate**: Donor clicks **Locate Nearest Vault** to see nearby accredited centers and upcoming community drives ranked by distance.
   - **Book**: Donor clicks a nearby hospital or camp pin, inspects open slots and current shortage alerts for their blood group, and taps **Book Donation Slot** — generating their digital pass and downloadable `.ics` calendar reminder in seconds.

3. **Staff & Hospital Coordinator Flow**
   - Clinical staff and hospital admins retain immediate access to their existing role-protected dashboards, inventory management, cross-matching, and RBAC administration via the clean 3-zone navigation bar and `Ctrl+K` quick search palette.

### Visual Design System & Ergonomics

- **Color Architecture (60-30-10 Restraint)**:
  - **60% Canvas & Surface**: Crisp alabaster `#F8FAFC` background with pure white `#FFFFFF` tactile card surfaces and architectural `#E2E8F0` hairline grid rules.
  - **30% Typographic Structure**: Deep carbon slate `#0F172A` headlines and primary controls, neutral clinical slate `#475569` supporting labels, subtle `#F1F5F9` hover bands.
  - **10% Clinical Signal & Action**: Surgical crimson `#BE123C` strictly reserved for urgent SOS actions, critical shortage markers, and active blood group selections; clinical emerald `#059669` for verified healthy stock; warm amber `#D97706` for low stock thresholds.
- **Typography**:
  - **Display & Headings**: `Plus Jakarta Sans` (tight tracking `-0.025em`, bold editorial contrast).
  - **Body & Interface**: `DM Sans` for calm, legible clinical copy.
  - **Live Metrics & Coordinates**: `JetBrains Mono` with `tabular-nums` on every unit counter, coordinate readout, ETA, phone number, and request code so live updates never jitter.
- **Zero-Noise Discipline**: No static metadata pill tags, no decorative pulsing dots, no fake status telemetry, no thick left accent borders (`border-l-4`). Metadata uses clean unboxed Swiss hairline labels separated by middle dots (`·`).
- **Navigation Integrity**: Preserves the clean 3-zone Top Bar Contract (Brand mark left · Focused public links center including **Blood Map** · Search/Auth/Emergency right), plus full keyboard navigation (`Escape` closes inspector drawers and modals, `Ctrl+K` opens Quick Search).

---

## 3. Key Product Decisions & Trade-Offs

| Decision | Chosen Approach | Trade-Off & Rationale |
| :--- | :--- | :--- |
| **Interactive Map Stack** | Modern Google Maps Platform via `@vis.gl/react-google-maps`, custom `AdvancedMarkerElement` vault pins, and modern `Route.computeRoutes()` ETAs. | Avoids brittle deprecated Google Maps APIs (`Marker`, `DirectionsService`), delivers native smooth zoom/pan and real-time traffic ETAs, and keeps API keys strictly environment-managed. |
| **Resilient Offline / Declined Fallback** | Automatic Swiss Architectural Vector Map fallback using the exact same regional coordinates, pin inspector drawer, and blood group filters. | Guarantees BloodConnect never shows a broken map frame if Google Maps setup is declined or unavailable offline. |
| **Vault Geospatial Grounding** | Attach real latitude/longitude coordinates directly to BloodConnect's existing accredited hospital vaults and donation camps in the central database store. | Keeps 100% of pins grounded to real, verifiable database inventory counts and live unit updates (when staff issue or collect blood, the map pins update reactively). |
| **Family SOS Appeal Generator** | Pure client-side structured appeal builder with 1-click Copy and WhatsApp deep-link (`wa.me`) directly inside the hero SOS card. | Gives everyday families immediate real-world utility during a medical crisis without requiring external SMS credentials or paid third-party messaging gateways. |
| **Map Placement** | Dual presence: compact interactive **Live Regional Blood Radar** embedded above the fold on the homepage + dedicated full-viewport **Blood Map** view with URL routing (`/blood-map`). | Gives visitors instant "wow" and real utility within 1 second of landing, while giving deep explorers and hospitals an uncluttered full-screen spatial workspace. |

---

## 4. Technical Architecture & Data Strategy

### System Data & Interaction Flow

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                     BloodConnect Reactive Clinical Store                     │
│  • Hospitals (with real Mumbai lat/lng coordinates & accreditation metadata) │
│  • Blood Units (live stock by blood group, component, and vault allocation)  │
│  • Donation Camps (with venue lat/lng, slot capacity, and schedule)          │
│  • Appointments & Emergency Requests (reactive subscription broadcast)       │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ Live Subscription & Stock Aggregation
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                 Geospatial Vault & Compatibility Engine                      │
│  • Maps live inventory units across accredited hospital hubs                 │
│  • Computes stock health tier (Available / Low / Critical) per blood group   │
│  • Resolves ABO/Rh compatible substitute stock for rare types                │
│  • Calculates Haversine proximity + optional Google Maps Routes driving ETA  │
└───────────────┬──────────────────────────────────────────────┬───────────────┘
                │                                              │
                ▼                                              ▼
┌────────────────────────────────────────┐   ┌─────────────────────────────────┐
│    Homepage Editorial Swiss Hero       │   │   Full-Viewport Blood Map View  │
│  ┌──────────────────────────────────┐  │   │  ┌───────────────────────────┐  │
│  │ Live Regional Blood Radar Map    │  │   │  │ Filter Rail (Group,       │  │
│  │ • 8-Group Tactile Selector Strip │  │   │  │ Component, Vaults/Camps)  │  │
│  │ • Interactive Vault & Camp Pins  │  │   │  ├─────────────┬─────────────┤  │
│  │ • Expand to Full Map CTA         │  │   │  │ Vault List  │ Interactive │  │
│  └──────────────────────────────────┘  │   │  │ Ledger      │ Map Canvas  │  │
│  ┌──────────────────────────────────┐  │   │  │ (Synced)    │ + Route ETA │  │
│  │ 1-Tap Emergency SOS & Appeal     │  │   │  └─────────────┴──────┬──────┘  │
│  │ • Instant Stock & Nearest Vault  │  │   │                       ▼         │
│  │ • 1-Tap Pre-filled SOS Request   │  │   │  ┌───────────────────────────┐  │
│  │ • WhatsApp / Copy Appeal Card    │  │   │  │ Tactile Vault Inspector   │  │
│  └──────────────────────────────────┘  │   │  │ • Component Stock Matrix  │  │
└───────────────────┬────────────────────┘   │  │ • Book Donation / Request │  │
                    │                        │  │ • Driving ETA & Copy Call │  │
                    └────────────┬───────────┘  └───────────────┬───────────────┘
                                 ▼                              ▼
              ┌───────────────────────────────────────────────────┐
              │   Existing Preserved Workflows & RBAC Platform    │
              │  • Pre-filled EmergencyModal & Dispatch Tracker   │
              │  • Pre-filled DonationBookingModal + .ics Pass    │
              │  • History API Routing (/blood-map) & Ctrl+K      │
              │  • 7-Tier RBAC Auth, MFA, MySQL & Vercel Backend  │
              └───────────────────────────────────────────────────┘
```

### Data & State Strategy

- **Reactive Geospatial Store**: Extend the existing hospital and donation camp records with real neighborhood latitude/longitude coordinates across Mumbai (Fort, Parel, Worli, Dadar, Bandra West, Andheri East, Marol, Mulund West) and compute live per-vault stock distribution directly from the active blood unit inventory so every map pin reacts in real time when units are issued, reserved, or collected.
- **Google Maps Platform Runtime Layer**:
  - Uses `@vis.gl/react-google-maps` wrapped in a dedicated map provider reading `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`.
  - Uses custom `AdvancedMarkerElement` pins with required `mapId` and attribution IDs for crisp, interactive Swiss-styled vault badges directly on the map.
  - Uses modern `Route.computeRoutes()` on explicit user clicks (**Locate Nearest Vault** or **Calculate Driving ETA**) to avoid unnecessary background API calls and protect user quota.
  - Seamlessly switches to an interactive Swiss SVG coordinate radar map whenever an API key is not configured or Maps setup is skipped.
- **URL Routing & Global Search Integration**: Register `/blood-map` in the existing SPA History API router and Quick Search palette (`Ctrl+K`) so visitors can jump directly to any hospital vault on the map or share direct links cleanly.
