# CC_DB — Next.js dashboard

React/Next.js rewrite of the Customer Care dashboard. Replaces the hand-rolled
static site at the repo root with a Next.js app that exports to a static
`out/` directory and still deploys to GitHub Pages.

## Why this exists

The static version is already as light as a page can be — the bottleneck is
the Apps Script `/exec` call behind the dashboard (response times swing
3–15s with cold starts). This rebuild **does not change that**. What it adds:

- Immediate UI skeleton — the layout renders before the data lands
- Component-scoped state (easier to extend with more sheet tabs)
- `useMemo` filters/aggregations so re-rendering doesn't re-run every filter

## Run locally

```bash
cd dashboard-next
npm install
npm run dev
# open http://localhost:3000/CC_DB
```

The `basePath` defaults to `/CC_DB` to match the GitHub Pages URL
`snackible.github.io/CC_DB/`. To run at the root path:

```bash
NEXT_PUBLIC_BASE_PATH="" npm run dev
```

## Build a static export

```bash
npm run build
# → dashboard-next/out/   (plain HTML/CSS/JS, no Node runtime needed to serve)
```

Copy the contents of `out/` to wherever the site is served from.

## Where things live

- `app/page.jsx` — mounts `<Dashboard />`
- `components/Dashboard.jsx` — all state, KPI strip, pie, tabs, Customise
- `components/CancellationPie.jsx` — Chart.js pie wrapper
- `components/GenericSheetTab.jsx` — any sheet beyond the two hand-written ones
- `lib/api.js` — JSONP loader with retries (Apps Script `/exec` 404s on `fetch`)
- `lib/reasons.js` — reason normalisation + categorical palette
- `lib/format.js` — date/currency/key helpers
- `app/globals.css` — ported from the original `style.css`

## Adding another sheet tab

Add an entry to `GENERIC_SHEETS` at the top of `components/Dashboard.jsx`:

```js
{
  id: 'razorpay',
  apiSheet: 'razorpay',
  apiUrl: '',              // leave blank to reuse APPS_SCRIPT_URL
  label: 'Razorpay refunds',
  searchPlaceholder: 'Search…',
  dateField: 'dateRefunded',  // optional — adds a Customise date range
  selectFilters: [{ field: 'status', label: 'status' }],
  columns: null,              // null = auto-detect from first row
}
```

The Apps Script backend must also handle `?sheet=razorpay`.
