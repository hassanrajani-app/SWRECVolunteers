/**
 * Southwest RE Centers — Volunteer Dashboard backend
 *
 * Deploy this as a Web App (Extensions > Apps Script in the response sheet,
 * or script.google.com as a standalone script). It reads the volunteer
 * response sheet and serves each row as JSON for the static dashboard.
 *
 * See ../README.md for full deployment steps.
 */

// ===== CONFIG =====
// The Google Sheet that collects Tally submissions:
// "Southwest RE Centers | Human Resource Volunteer Form"
const SHEET_ID = '1U2EoQ62hoHJcLCUcWpHeauk67VcKSkFJgPFOmsvUwPM';
// Tab name inside that spreadsheet. Change if your tab is renamed.
const SHEET_NAME = 'Sheet1';
// How long (seconds) to serve a cached copy before re-reading the sheet.
// Keeps the dashboard fast even with hundreds of rows. Max allowed by
// Apps Script is 21600 (6 hours). Pass ?nocache=1 in the URL to bypass.
const CACHE_SECONDS = 120;

function doGet(e) {
  try {
    const bypassCache = e && e.parameter && e.parameter.nocache === '1';
    const cache = CacheService.getScriptCache();
    const cacheKey = 'volunteers_json_v2';

    if (!bypassCache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
      }
    }

    const json = JSON.stringify(buildVolunteers());

    try {
      // CacheService has a 100KB per-key limit. If the roster grows past
      // that, caching is silently skipped and every request just reads
      // the sheet directly (still correct, just not cache-accelerated).
      cache.put(cacheKey, json, CACHE_SECONDS);
    } catch (cacheErr) {
      // payload too large for cache — ignore and continue uncached
    }

    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Finds the index of the first header whose lowercased text contains every
// given keyword. This is deliberately fuzzy: Tally form question wording
// changes over time (e.g. "Indicate your RE Center:" became "Indicate the
// RE Center where you will serve:"), and exact-string matching breaks
// silently every time that happens. Keyword matching survives most edits.
function findColumn(headers, keywords) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i]).toLowerCase();
    if (keywords.every((k) => h.indexOf(k) > -1)) return i;
  }
  return -1;
}

function buildVolunteers() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  const range = sheet.getDataRange();
  const values = range.getValues();

  if (values.length < 2) return [];

  const headers = values[0].map(function (h) { return String(h).trim(); });

  const col = {
    submissionId: findColumn(headers, ['submission', 'id']),
    submittedAt: findColumn(headers, ['submitted']),
    fullName: findColumn(headers, ['full name']),
    contact: findColumn(headers, ['contact']),
    email: findColumn(headers, ['email']),
    dob: findColumn(headers, ['date of birth']),
    gender: findColumn(headers, ['gender']),
    countryOfBirth: findColumn(headers, ['country of birth']),
    tshirtSize: findColumn(headers, ['t-shirt']),
    jamatkhana: findColumn(headers, ['jamatkhana']),
    center: findColumn(headers, ['re center']),
    position: findColumn(headers, ['position']),
    gradeMain: findColumn(headers, ['grade level']),
    education: findColumn(headers, ['education level']),
    studiesInUSA: findColumn(headers, ['studies completed']),
    occupation: findColumn(headers, ['occupation']),
    sevaOutside: findColumn(headers, ['outside', 'of the re system']),
    sevaHistory: findColumn(headers, ['seva history']),
    photo: findColumn(headers, ['headshot']),
  };

  // Only pull formulas for the photo column (in case it's a HYPERLINK()
  // formula rather than a plain URL) — much cheaper than reading formulas
  // for the whole sheet.
  const photoFormulas = col.photo > -1 && values.length > 1
    ? sheet.getRange(2, col.photo + 1, values.length - 1, 1).getFormulas()
    : [];

  const volunteers = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (col.fullName === -1 || !row[col.fullName]) continue; // skip blank rows

    const photoRaw = col.photo > -1 ? row[col.photo] : '';
    const photoFormula = col.photo > -1 && photoFormulas[i - 1] ? photoFormulas[i - 1][0] : '';

    volunteers.push({
      id: col.submissionId > -1 ? String(row[col.submissionId] || i) : String(i),
      submittedAt: formatDate(col.submittedAt > -1 ? row[col.submittedAt] : ''),
      fullName: get(row, col.fullName),
      contact: get(row, col.contact),
      email: get(row, col.email),
      dob: formatDate(col.dob > -1 ? row[col.dob] : ''),
      gender: get(row, col.gender),
      countryOfBirth: get(row, col.countryOfBirth),
      tshirtSize: get(row, col.tshirtSize),
      jamatkhana: get(row, col.jamatkhana),
      center: get(row, col.center),
      position: get(row, col.position),
      gradeLevel: get(row, col.gradeMain),
      education: get(row, col.education),
      studiesInUSA: get(row, col.studiesInUSA),
      occupation: get(row, col.occupation),
      sevaOutside: get(row, col.sevaOutside),
      sevaHistory: get(row, col.sevaHistory),
      photoUrl: extractUrl(photoRaw, photoFormula),
    });
  }

  return volunteers;
}

function get(row, index) {
  return index > -1 ? String(row[index] || '') : '';
}

function formatDate(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'MM/dd/yyyy');
  }
  return String(value);
}

// Handles plain URL text, and cells that render as =HYPERLINK("url","label").
function extractUrl(displayValue, formulaValue) {
  const candidates = [String(formulaValue || ''), String(displayValue || '')];
  for (let i = 0; i < candidates.length; i++) {
    const match = candidates[i].match(/https?:\/\/[^\s")]+/);
    if (match) return match[0];
  }
  return '';
}
