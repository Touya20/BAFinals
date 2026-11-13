# Step-by-Step Guide: Building the RoadReady BA Dashboard with React + Vite

This guide builds an interactive dashboard for the RoadReady Motor Works case study. It follows the business analytics process as three connected pages: **Descriptive** (what happened), **Predictive** (what is likely to happen) and **Prescriptive** (what to do). Everything runs in the browser with no Python or backend.

**Stack:** React 18, Vite, Recharts (charts), plain CSS.

---

## Step 1: Plan the Pages and What Each One Answers

| Page | Question | Interactive controls | Charts |
|---|---|---|---|
| 1. Descriptive | What happened? | Month range, mechanic, service chips, measure picker | Revenue by service, jobs per month, causes of delay, load by weekday |
| 2. Predictive | What is likely to happen? | Growth slider, forecast horizon, parts month, risk cut-off | Forecast with range band, parts needed, no-return rate by delay, risk drivers |
| 3. Prescriptive | What should we do? | Planning month, mechanics, hours, min overhauls, service level, lead time, response rate, cost per contact | Demand vs recommended jobs, reorder points, net gain curve |

How the pages connect:
- Descriptive findings (peaks in Dec and Apr-May, late jobs linked to lost customers) define what the predictive models measure.
- The growth assumption set on Predictive is carried into Prescriptive.
- Prescriptive turns forecasts and risk scores into decisions, with an action table that links each action back to a finding and a prediction.

---

## Step 2: Create the Vite Project

```bash
npm create vite@latest roadready-dashboard -- --template react
cd roadready-dashboard
npm install recharts
npm run dev
```

Requires Node 18 or newer. Open the address Vite prints to confirm the starter page loads.

`package.json` should contain:

```json
{
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1", "recharts": "^2.15.0" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.3", "vite": "^5.4.10" }
}
```

---

## Step 3: Set Up the Folder Structure

Delete the starter content in `src/` and create:

```
src/
├── main.jsx                 # mounts the app
├── App.jsx                  # stage navigation + shared state
├── styles.css               # light and dark themes
├── pages/
│   ├── Descriptive.jsx
│   ├── Predictive.jsx
│   └── Prescriptive.jsx
├── components/
│   └── ui.jsx               # Card, Kpi, Slider, Select, TableView, chart styles
├── lib/
│   └── analytics.js         # pure functions (no React)
└── data/
    ├── constants.js         # services, prices, hours, parts rates
    └── generate.js          # simulated data (swap for real data later)
```

Design rule: keep calculations in `lib/analytics.js` as plain functions. Pages only call them and draw results. This makes the logic easy to test in Node without a browser.

---

## Step 4: Define the Shop Constants

`src/data/constants.js` holds facts used everywhere:

```js
export const SERVICES = ["Preventive maintenance", "Brakes, tires & chain", "Electrical & ignition", "Engine & transmission", "Accident & body repair"];
export const SHORT = ["Preventive", "Brakes/tires/chain", "Electrical", "Overhaul", "Body repair"];
export const N_SERV = [1320, 480, 288, 192, 120];     // jobs per year
export const TICKET = [1200, 2500, 2000, 8000, 3000]; // average price (PHP)
export const PARTS_COST = [480, 1125, 700, 3200, 1500];
export const HOURS = [1, 2.5, 3, 16, 6];              // labor hours per job
export const MONTHS = ["Nov 25", "Dec 25", /* ... */ "Oct 26"];
export const FMONTHS = ["Nov 26", "Dec 26", "Jan 27", "Feb 27", "Mar 27", "Apr 27"];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const CREW = 4;
export const DAY_HOURS = 8;
```

Also list the 12 fast-moving parts with a unit price and parts used per job for each service (`rates: [preventive, brakes, electrical, overhaul, body]`).

---

## Step 5: Create the Data Layer

`src/data/generate.js` builds 12 months of job orders from a **seeded random generator** so the numbers are the same on every load:

```js
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

The generator:
1. Lists open days (Mon-Sat) from Nov 1 2025 to Oct 31 2026.
2. Weights each day by month (peaks in Dec, Apr, May) and weekday (Fri and Sat heaviest).
3. Creates 2,400 jobs split by service, with price, parts cost, labor hours and mechanic.
4. Adds delays: parts stockouts about 22% of jobs (worse in peak months), mechanic overload worse on Fri/Sat, plus small shares for customer approval and diagnosis. Roughly 68% of jobs finish on time.
5. Assigns jobs to about 1,700 customers, with repeat visits less likely after a late first job.
6. Trains a small **logistic regression** (gradient descent, about 40 lines) on customer features to produce a no-return risk score, and reports AUC on a held-out 30%.
7. Simulates weekly parts demand to get a mean and normal swing per part.

`getData()` returns one object that every page reads:

```js
{ jobs, customers, parts, histMonth, mix, hoursPerJob, marginRatio, repeatRate, churn }
```

**To use real data later:** write a loader that reads your job-order CSV and returns the same shape. No page code changes.

Expected CSV columns: `job_id, date, customer_id, service_type, mechanic, labor_hours, price, parts_cost, promised_date, completed_date, days_late, delay_reason, comeback`.

---

## Step 6: Write the Analytics Functions

`src/lib/analytics.js` contains pure functions.

**Descriptive**

```js
export function kpis(jobs) {
  const n = jobs.length; if (!n) return null;
  let rev = 0, mar = 0, ot = 0, act = 0, cb = 0;
  const cs = new Map();
  for (const j of jobs) {
    rev += j.price; mar += j.price - j.partsCost; if (j.delay === 0) ot++;
    act += j.actual; cb += j.cb; cs.set(j.cust, (cs.get(j.cust) || 0) + 1);
  }
  let rep = 0; cs.forEach((v) => { if (v > 1) rep++; });
  return { n, rev, mar, marginPct: mar / rev, onTime: ot / n, turnaround: act / n, comeback: cb / n, repeat: rep / cs.size };
}
```

Also: `filterJobs`, `serviceTotals`, `monthlyJobs`, `lateReasons`, and `utilization` (labor hours divided by available hours, per weekday).

**Predictive**

```js
// Same month last year, scaled by a growth assumption, with an 80% range.
export function forecast(histMonth, growthPct) {
  return FMONTHS.map((label, k) => {
    const n = histMonth[k] * (1 + growthPct / 100);
    const sd = Math.sqrt(n * 1.5);
    return { k, label, n, lo: Math.max(0, n - 1.28 * sd), hi: n + 1.28 * sd };
  });
}
```

Also: `partsForMonth` (forecast jobs x service mix x parts per job) and `histogram` for the risk scores.

**Prescriptive**

Labor allocation maximizes margin subject to one labor-hours limit. With one constraint plus job-count bounds, filling jobs in order of **margin per labor hour** is the exact answer to the linear program:

```js
export function solveLabor({ margin, hours, demand, capacity, minIdx = 3, minJobs = 0 }) {
  const x = new Array(margin.length).fill(0);
  const mv = Math.min(minJobs, demand[minIdx], capacity / hours[minIdx]);
  x[minIdx] = mv;
  let left = capacity - mv * hours[minIdx], shadow = 0;
  const order = [...x.keys()].sort((a, b) => margin[b] / hours[b] - margin[a] / hours[a]);
  for (const i of order) {
    const room = demand[i] - x[i];
    if (room <= 0) continue;
    const can = Math.min(room, left / hours[i]);
    x[i] += can; left -= can * hours[i];
    if (can < room - 1e-9) { shadow = margin[i] / hours[i]; break; } // value of one extra hour
  }
  return { x, used: capacity - left, shadow, total: x.reduce((s, v, i) => s + v * margin[i], 0) };
}
```

Reorder points use demand during the lead time plus safety stock:

```js
export function reorderPlan(partsMonth, leadDays, serviceLevelPct) {
  const z = zOf(serviceLevelPct / 100);               // normal z-score for the service level
  return partsMonth.map((p) => {
    const lead = (p.wk * leadDays) / 7;                // expected demand during lead time
    const safety = z * p.sigma * Math.sqrt(leadDays / 7);
    return { name: p.name, lead, safety, reorder: Math.ceil(lead + safety), safetyCost: safety * p.price };
  });
}
```

Retention ranks one-visit customers by `risk x first ticket`, then accumulates `response x risk x ticket x margin - cost per contact` to find the best number of customers to contact.

---

## Step 7: Build Shared UI Components

`src/components/ui.jsx` exports small reusable pieces:

- `Card`, `Kpi` (label, value, note, status pill), `Pill` (icon + label, never color alone)
- `Slider` and `Select` (labelled controls)
- `TableView`: a collapsible table under each chart so values can be read without hovering
- Chart styling written with CSS variables so light and dark mode work automatically:

```js
export const axisProps = { tick: { fill: "var(--ink2)", fontSize: 12 }, axisLine: { stroke: "var(--axis)" }, tickLine: { stroke: "var(--axis)" } };
export const gridProps = { stroke: "var(--grid)" };
export const tooltipProps = { contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" } };
```

---

## Step 8: Build the App Shell

`src/App.jsx` shows the three stages as a numbered pipeline and holds the state shared between pages:

```jsx
export default function App() {
  const data = useMemo(() => getData(), []);
  const [tab, setTab] = useState("descriptive");
  const [growth, setGrowth] = useState(0);   // set on Predictive, used on Prescriptive

  return (
    <main className="wrap">
      <header>...title, data badge, CSV download button...</header>
      <nav role="tablist">
        {STAGES.map((s, i) => (
          <React.Fragment key={s.id}>
            {i > 0 && <span className="arrow">→</span>}
            <button role="tab" aria-selected={tab === s.id} onClick={() => setTab(s.id)}>
              {s.no} {s.name}: {s.q}
            </button>
          </React.Fragment>
        ))}
      </nav>
      {tab === "descriptive" && <Descriptive data={data} onNext={() => setTab("predictive")} />}
      {tab === "predictive" && <Predictive data={data} growth={growth} setGrowth={setGrowth} onNext={() => setTab("prescriptive")} />}
      {tab === "prescriptive" && <Prescriptive data={data} growth={growth} />}
    </main>
  );
}
```

---

## Step 9: Build the Descriptive Page

State: `from`, `to`, `svc` (selected services), `mech`, `metric`.

Pattern used on every page: filters change state, `useMemo` recomputes the numbers, charts redraw.

```jsx
const jobs = useMemo(() => filterJobs(data.jobs, { from: lo, to: hi, svc: new Set(svc), mech }), [data, lo, hi, svc, mech]);
const k = useMemo(() => kpis(jobs), [jobs]);
```

Layout, top to bottom:
1. Filter bar (month selects, mechanic select, service chips; at least one service stays on)
2. KPI tiles: revenue, contribution margin, on-time %, turnaround, repeat customers (status pills against targets of 85% and 48%)
3. Four charts in a responsive grid:
   - Horizontal bar: revenue, margin, jobs or labor hours by service (picker)
   - Bar: jobs per month
   - Horizontal bar: late jobs by cause
   - Bar: load by weekday with a dashed 85% line
4. "What the data says" card with sentences generated from the filtered numbers, and a button to continue to step 2.

Show a warning message if filters return no jobs.

---

## Step 10: Build the Predictive Page

State: `horizon`, `pmonth`, `riskMin`, `riskSvc`. The growth slider uses the shared `growth` state from `App`.

Sections:
1. Controls and a note that growth is an assumption (12 months cannot estimate a trend).
2. KPI tiles: peak month, next 3 months vs last year, peak-week labor need vs capacity (status pill), churn model AUC.
3. Forecast chart: actual line, dashed forecast line and a shaded 80% band, built with a stacked transparent area plus a visible band area:

```jsx
<ComposedChart data={series}>
  <Area dataKey="lo" stackId="b" stroke="none" fill="transparent" legendType="none" />
  <Area dataKey="band" stackId="b" stroke="none" fill="var(--s2)" fillOpacity={0.18} name="80% range" />
  <Line dataKey="actual" stroke="var(--s1)" />
  <Line dataKey="forecast" stroke="var(--s2)" strokeDasharray="6 4" />
</ComposedChart>
```

4. Parts needed for the chosen month (horizontal bars).
5. No-return rate by how late the first job was.
6. Risk drivers: model weights, red raises risk and blue lowers it, with a note that the AUC is optimistic.
7. Risk cut-off slider, a small histogram and a table of the top 10 customers by expected value.

---

## Step 11: Build the Prescriptive Page

Shared controls: planning month (defaults to the peak month) and extra walk-in demand.

**Decision 1, labor.** Sliders: mechanics, hours per mechanic, minimum overhauls. Calls `solveLabor`. Tiles: weekly margin, gain over trimming everything evenly, worth of one extra hour, jobs moved to midweek. Chart: expected demand vs recommended jobs per service.

**Decision 2, parts.** Sliders: service level and lead time. Stacked bars of lead-time demand plus safety stock, a reorder-at table and the cash tied up in safety stock.

**Decision 3, retention.** Sliders: response rate, cost per contact, customers to contact, with a "use the best number" button. Line chart of net gain vs customers contacted with a marker at the selected count. Tiles: net gain (pill), extra returning customers, new repeat rate.

**Action plan table.** Three rows: Finding, Prediction, Action, filled with live numbers from the controls. This is where the three stages visibly connect.

---

## Step 12: Style with CSS Variables

In `src/styles.css`:

1. Define every color as a token on `:root` (light values).
2. Redefine the tokens under `@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]`.
3. Use one accent color for controls. Reserve the categorical colors (blue, orange, aqua, yellow, magenta) for services and delay causes, and keep the same color for the same service on every chart.
4. Use `display: grid` with `repeat(auto-fit, minmax(min(100%, 420px), 1fr))` for chart grids so they stack on phones.
5. Give each chart a fixed height container (about 290px), since Recharts' `ResponsiveContainer` needs one.
6. Add visible focus outlines and respect `prefers-reduced-motion`.

---

## Step 13: Test the Logic Without a Browser

Because the calculations are plain functions, run them in Node:

```js
// scripts/check.mjs
import { getData } from "../src/data/generate.js";
import { kpis, forecast, solveLabor } from "../src/lib/analytics.js";

const D = getData();
console.log("jobs", D.jobs.length, "AUC", D.churn.auc.toFixed(2));
// LP must never use more hours than capacity
const lp = solveLabor({ margin, hours, demand, capacity: 160, minJobs: 1 });
if (lp.used > 160 + 1e-6) throw new Error("LP exceeds capacity");
```

Add `"check": "node scripts/check.mjs"` to `package.json` scripts and run `npm run check`.

Browser checks:

| Test | What to check |
|---|---|
| KPI accuracy | Totals match a manual Excel pivot of the same data |
| Filters | Every chart and tile updates; empty filter shows a warning |
| Forecast | Moving the growth slider changes both the Predictive chart and the Prescriptive demand |
| Labor | Hours used never exceed hours available; raising mechanics lowers the value of an extra hour |
| Parts | Higher service level or longer lead time raises reorder points |
| Retention | The net gain curve rises, flattens, then falls; the best number sits at the peak |
| Layout | No sideways scrolling at 400px width; works in light and dark mode |

---

## Step 14: Build and Deploy

```bash
npm run build      # outputs dist/
npm run preview    # test the production build locally
```

Host the `dist/` folder on any static host (Netlify, Vercel, GitHub Pages, or a shop computer). If you later load real customer data, do not publish names or phone numbers to a public site, and add a login.

---

## Step 15: Connect Real Data and Maintain

1. Replace `getData()` with a loader for your job-order CSV or an API, keeping the same output shape.
2. Re-run the churn model whenever new months arrive. With 24 months of history, replace the seasonal projection with a model you can backtest and report its error.
3. Review KPI targets monthly: on-time at least 85%, repeat rate at least 48%.
4. Ask the owner, service advisor and parts clerk to try their page and note what they could not find.

---

## Assumptions to Review

- The demo data is simulated from a fixed seed to match the case study, so figures such as the repeat rate will differ slightly from the case narrative.
- The forecast is last year's same month times a growth factor, because one year of data cannot estimate a trend.
- The churn model's AUC is optimistic: recently acquired customers have had little time to return.
- Labor optimization uses one constraint (labor hours).
- Retention gain assumes a contacted customer's chance of being won back is response rate x their risk score, and that a return job is worth their first ticket.

---

## Quick Checklist

- [ ] Vite + React project created, Recharts installed
- [ ] Folder structure in place
- [ ] Constants defined
- [ ] Data generator (or real-data loader) returns the shared object
- [ ] Analytics functions written and checked in Node
- [ ] Shared UI components built
- [ ] App shell with stage navigation and shared growth state
- [ ] Descriptive page built
- [ ] Predictive page built
- [ ] Prescriptive page built
- [ ] Light and dark themes working
- [ ] Tests passed
- [ ] Built and deployed
