# Southwest RE Centers — Volunteer Dashboard

A static dashboard that lists every volunteer from the "Southwest RE Centers | Human Resource Volunteer Form" Google Sheet, with a sortable/filterable table and a click-through detail view showing full profile + headshot. No backend server — data comes live from a Google Apps Script web app.

## How it works
- `apps-script/Code.gs` — deployed as a Google Apps Script Web App. Reads the response sheet and returns each volunteer as JSON. Caches the result for 2 minutes (`CACHE_SECONDS`) so repeat loads are fast even as the roster grows.
- `index.html` / `style.css` / `app.js` — static frontend. Fetches that JSON, caches a copy in the browser (`localStorage`) for instant repeat visits, and renders the table + detail modal. Deploy this folder to Netlify.

## 1. Deploy the Apps Script backend

1. Open the response sheet: **Southwest RE Centers | Human Resource Volunteer Form** in Google Sheets.
2. Go to **Extensions → Apps Script**.
3. Delete the placeholder `Code.gs` content and paste in the contents of `apps-script/Code.gs` from this folder.
4. Click **Deploy → Manage deployments → Edit (pencil icon)** on your existing deployment → **New version** → **Deploy**. (If you don't have a deployment yet, use **Deploy → New deployment → Web app**, execute as **Me**, access **Anyone**.)
5. The Web app URL stays the same across versions — you don't need to update `app.js` again unless you create a brand-new deployment.

## 2. Point the dashboard at your Apps Script URL

`app.js` already has `APPS_SCRIPT_URL` set. Only change it if you ever create a new deployment (new deployments get a new URL).

## 3. Deploy to Netlify

Drag the `rec-volunteer-dashboard` folder onto [app.netlify.com/drop](https://app.netlify.com/drop), or connect it as a Git repo. Static site, no build command, publish directory is the project root.

## What changed in this update

- **Speed**: `Code.gs` now caches its JSON response server-side for 2 minutes (`CacheService`), and only reads formulas for the photo column instead of the whole sheet. The frontend also caches the last-loaded roster in the browser and paints it instantly on repeat visits, then quietly re-fetches the live data in the background. The **Refresh** button always forces a live, uncached pull (`?nocache=1`).
- **RE Center fix**: the Tally question text changed to "Indicate the RE Center where you will serve:", which no longer matched the old hardcoded header. `Code.gs` now matches columns by keyword (e.g. anything containing "re center") instead of an exact string, so future wording tweaks in Tally won't silently break a column again.
- **New fields captured**: Country of Birth, T-Shirt Size, Jamatkhana, Studies Completed in USA, Occupation, and both seva-history questions are now pulled through and shown in the detail view.
- **Table columns**: Name, RE Center, Position, Grade Level, Age, Gender, Contact, Email. (Everything else — Jamatkhana, Education, Occupation, seva history, etc. — is in the click-through detail panel. Let me know if you'd rather swap what's in the table vs. the detail view.)
- **Rows per page**: defaults to 250.
- **Theme**: modern ombre green header (deep forest → emerald → mint gradient) with a matching gradient table header.

## Notes

- **Headshots**: Tally hosts uploaded files at `storage.tally.so/private/...` with a signed access token in the URL. These are direct, publicly viewable image links, so no transformation is needed — falls back to initials if a photo fails to load.
- **Cache freshness**: new submissions can take up to 2 minutes to appear automatically (server cache), or instantly via the Refresh button.
- **Field mapping resilience**: `Code.gs` matches sheet columns by keyword, not exact text (see `findColumn`). If you add a brand-new question in Tally, add a matching entry to the `col` object in `Code.gs` and redeploy.
- **Access control**: the Apps Script URL returns all volunteer data (including contact info) to anyone with the link. Don't publish the URL publicly.
