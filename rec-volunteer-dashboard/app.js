// ===== CONFIG =====
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyLSM-W-afz-Ncf8m7pTQQG4UMFJ2J9hn17oIgzP2S63TlLRIidDFlehlJi1nrvngba-g/exec";

// ===== Firebase config =====
// Paste the config object from Firebase console → Project settings →
// General → "Your apps" → SDK setup and configuration. These values
// (including apiKey) are meant to be public in client apps — they just
// identify which Firebase project to talk to. The actual security comes
// from real sign-in plus the server-side check in Code.gs, not from
// keeping this object secret. See README.md for full setup steps.
const firebaseConfig = {
  apiKey: "AIzaSyAJYnW0Q6MwER-tzI-Z2NT8R0NucIc3i1U",
  authDomain: "swrecvolunteers.firebaseapp.com",
  projectId: "swrecvolunteers",
  appId: "1:821676294622:web:a00fefa4a3f782436d1d4f",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

let volunteers = [];
// Whether the signed-in coordinator is allowed to edit records — set from
// the Coordinators sheet's "Edit Access" column (see Code.gs) each time
// data loads (live or from cache). The pencil button is only ever shown
// when this is true, but the real enforcement is server-side in doPost —
// this flag is just what drives the UI, never trusted as security on its
// own.
let canEdit = false;

// ITREB Programs module state — independent of the volunteer roster
// above. programLeads/programStatuses are the dropdown option lists,
// sourced from Code.gs (PROGRAM_LEADS/PROGRAM_STATUSES) rather than
// hardcoded here, so the two never drift out of sync.
let programs = [];
let programLeads = [];
let programStatuses = [];

// Attendance Metrics module state — one row per Category + RE Center,
// already aggregated server-side in Code.gs (cumulative across every date
// recorded so far). Read-only: nothing here is ever written back.
let attendance = [];
let attendanceAsOf = "";
const ATTENDANCE_CATEGORIES = [
  { key: "Pre-Primary", grid: "attendanceGridPrePrimary", empty: "attendanceEmptyPrePrimary", overall: "attendanceOverallPrePrimary" },
  { key: "Primary", grid: "attendanceGridPrimary", empty: "attendanceEmptyPrimary", overall: "attendanceOverallPrimary" },
  { key: "Secondary", grid: "attendanceGridSecondary", empty: "attendanceEmptySecondary", overall: "attendanceOverallSecondary" },
];

// Which modules and admin rights the signed-in person has — fetched once
// right after sign-in (resource=me) and used to decide which hub tiles to
// show. Just drives the UI; the real enforcement for every module lives
// server-side in Code.gs, same as canEdit above.
let meModules = [];
let meIsAdmin = false;

// Admin screen state — the full Coordinators sheet, only ever fetched for
// someone the server has already confirmed is an admin.
let coordinators = [];

// filter state
const filters = {
  search: "",
  centers: new Set(),
  positions: new Set(),
  grades: new Set(),
  statuses: new Set(),
  servingPrograms: new Set(),
};

// sort + pagination state
let sortKey = "fullName";
let sortDir = "asc";
let pageSize = 250;
let currentPage = 1;

const el = {
  stateMessage: document.getElementById("stateMessage"),
  searchInput: document.getElementById("searchInput"),
  countLabel: document.getElementById("countLabel"),
  refreshBtn: document.getElementById("refreshBtn"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  exportBtn: document.getElementById("exportBtn"),
  pageSizeSelect: document.getElementById("pageSizeSelect"),
  tableBody: document.getElementById("tableBody"),
  pagination: document.getElementById("pagination"),
  volTable: document.getElementById("volTable"),
  overlay: document.getElementById("detailOverlay"),
  detailPrevBtn: document.getElementById("detailPrevBtn"),
  detailNextBtn: document.getElementById("detailNextBtn"),
  detailNavCount: document.getElementById("detailNavCount"),
  closeDetail: document.getElementById("closeDetail"),
  editDetailBtn: document.getElementById("editDetailBtn"),
  detailPhoto: document.getElementById("detailPhoto"),
  detailHeaderText: document.getElementById("detailHeaderText"),
  detailFields: document.getElementById("detailFields"),
  detailSaveError: document.getElementById("detailSaveError"),
  detailEditActions: document.getElementById("detailEditActions"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  saveEditBtn: document.getElementById("saveEditBtn"),
  passwordGate: document.getElementById("passwordGate"),
  hubRoot: document.getElementById("hubRoot"),
  dashboardRoot: document.getElementById("dashboardRoot"),
  gateForm: document.getElementById("gateForm"),
  gateEmail: document.getElementById("gateEmail"),
  gatePassword: document.getElementById("gatePassword"),
  gateError: document.getElementById("gateError"),
  gateInfo: document.getElementById("gateInfo"),
  forgotPasswordBtn: document.getElementById("forgotPasswordBtn"),
  lockBtn: document.getElementById("lockBtn"),
  signedInAs: document.getElementById("signedInAs"),
  hubLockBtn: document.getElementById("hubLockBtn"),
  hubSignedInAs: document.getElementById("hubSignedInAs"),
  moduleVolunteerDashboard: document.getElementById("moduleVolunteerDashboard"),
  backToHubBtn: document.getElementById("backToHubBtn"),
  moduleProgramsBtn: document.getElementById("moduleProgramsBtn"),
  programsRoot: document.getElementById("programsRoot"),
  backToHubBtnPrograms: document.getElementById("backToHubBtnPrograms"),
  programsSignedInAs: document.getElementById("programsSignedInAs"),
  programsRefreshBtn: document.getElementById("programsRefreshBtn"),
  programsLockBtn: document.getElementById("programsLockBtn"),
  programsStateMessage: document.getElementById("programsStateMessage"),
  programsContent: document.getElementById("programsContent"),
  programsSearchInput: document.getElementById("programsSearchInput"),
  programsInWorkGrid: document.getElementById("programsInWorkGrid"),
  programsInWorkCount: document.getElementById("programsInWorkCount"),
  programsInWorkEmpty: document.getElementById("programsInWorkEmpty"),
  programsInWorkTableWrap: document.getElementById("programsInWorkTableWrap"),
  programsApprovedGrid: document.getElementById("programsApprovedGrid"),
  programsApprovedCount: document.getElementById("programsApprovedCount"),
  programsApprovedEmpty: document.getElementById("programsApprovedEmpty"),
  programsApprovedTableWrap: document.getElementById("programsApprovedTableWrap"),
  programsRejectedGrid: document.getElementById("programsRejectedGrid"),
  programsRejectedCount: document.getElementById("programsRejectedCount"),
  programsRejectedEmpty: document.getElementById("programsRejectedEmpty"),
  programsRejectedTableWrap: document.getElementById("programsRejectedTableWrap"),
  moduleAttendanceBtn: document.getElementById("moduleAttendanceBtn"),
  attendanceRoot: document.getElementById("attendanceRoot"),
  backToHubBtnAttendance: document.getElementById("backToHubBtnAttendance"),
  attendanceSignedInAs: document.getElementById("attendanceSignedInAs"),
  attendanceRefreshBtn: document.getElementById("attendanceRefreshBtn"),
  attendanceLockBtn: document.getElementById("attendanceLockBtn"),
  attendanceStateMessage: document.getElementById("attendanceStateMessage"),
  attendanceContent: document.getElementById("attendanceContent"),
  attendanceTotalValue: document.getElementById("attendanceTotalValue"),
  attendanceAsOf: document.getElementById("attendanceAsOf"),
  attendanceGridPrePrimary: document.getElementById("attendanceGridPrePrimary"),
  attendanceGridPrimary: document.getElementById("attendanceGridPrimary"),
  attendanceGridSecondary: document.getElementById("attendanceGridSecondary"),
  attendanceEmptyPrePrimary: document.getElementById("attendanceEmptyPrePrimary"),
  attendanceEmptyPrimary: document.getElementById("attendanceEmptyPrimary"),
  attendanceEmptySecondary: document.getElementById("attendanceEmptySecondary"),
  attendanceOverallPrePrimary: document.getElementById("attendanceOverallPrePrimary"),
  attendanceOverallPrimary: document.getElementById("attendanceOverallPrimary"),
  attendanceOverallSecondary: document.getElementById("attendanceOverallSecondary"),
  attendanceTrendOverlay: document.getElementById("attendanceTrendOverlay"),
  closeAttendanceTrend: document.getElementById("closeAttendanceTrend"),
  yoyBtn: document.getElementById("yoyBtn"),
  yoyOverlay: document.getElementById("yoyOverlay"),
  closeYoy: document.getElementById("closeYoy"),
  yoyChart: document.getElementById("yoyChart"),
  yoyEmpty: document.getElementById("yoyEmpty"),
  yoyNote: document.getElementById("yoyNote"),
  attendanceTrendTitle: document.getElementById("attendanceTrendTitle"),
  attendanceTrendSubtitle: document.getElementById("attendanceTrendSubtitle"),
  attendanceTrendChart: document.getElementById("attendanceTrendChart"),
  attendanceTrendEmpty: document.getElementById("attendanceTrendEmpty"),
  hubStateMessage: document.getElementById("hubStateMessage"),
  moduleGrid: document.getElementById("moduleGrid"),
  moduleAdminBtn: document.getElementById("moduleAdminBtn"),
  modulePmpBtn: document.getElementById("modulePmpBtn"),
  pmpRoot: document.getElementById("pmpRoot"),
  backToHubBtnPmp: document.getElementById("backToHubBtnPmp"),
  adminRoot: document.getElementById("adminRoot"),
  backToHubBtnAdmin: document.getElementById("backToHubBtnAdmin"),
  adminSignedInAs: document.getElementById("adminSignedInAs"),
  adminRefreshBtn: document.getElementById("adminRefreshBtn"),
  adminLockBtn: document.getElementById("adminLockBtn"),
  adminStateMessage: document.getElementById("adminStateMessage"),
  adminContent: document.getElementById("adminContent"),
  adminAddForm: document.getElementById("adminAddForm"),
  adminAddMsg: document.getElementById("adminAddMsg"),
  adminAddError: document.getElementById("adminAddError"),
  adminAddBtn: document.getElementById("adminAddBtn"),
  adminPeopleList: document.getElementById("adminPeopleList"),
  adminPeopleCount: document.getElementById("adminPeopleCount"),
  adminSearchInput: document.getElementById("adminSearchInput"),
  adminRoleFilter: document.getElementById("adminRoleFilter"),
};

// ===== Helpers =====

function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function parseDob(str) {
  if (!str) return null;
  let d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  const m = String(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    d = new Date(+m[3], +m[1] - 1, +m[2]);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function calculateAge(dobStr) {
  const d = parseDob(dobStr);
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

// Small colored dot + label, used both in the table and the detail modal
// so "who's still active" reads at a glance rather than as plain text.
function statusBadgeHtml(status) {
  const isInactive = status === "Inactive";
  return `<span class="status-badge ${isInactive ? "status-inactive" : "status-active"}"><span class="status-dot"></span>${escapeHtml(status || "Active")}</span>`;
}

function gradeTags(v) {
  return (v.gradeLevel || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function withComputed(list) {
  return (Array.isArray(list) ? list : []).map((v) => ({
    ...v,
    age: calculateAge(v.dob),
  }));
}

// Shared by loadVolunteers (read) and saveDetailEdit (write) so the two
// paths can never drift apart on what a given user's cache key is.
// v4: bumped when the Code.gs response shape changed from a bare array
// to { me, volunteers } — a v3 cache entry would otherwise get
// misparsed as an empty roster (cachedData.volunteers is undefined on
// a plain array) until overwritten by the next live fetch.
function cacheKeyFor(user) {
  return "sw-re-volunteers-cache-v4-" + user.uid;
}

// ===== Load data (stale-while-revalidate) =====

// Wraps fetch with a client-side timeout and safe JSON parsing, used by
// every request to the Apps Script backend. Apps Script has no fixed
// SLA — a cold start, a shared-quota hiccup, or the sheet simply growing
// can occasionally make a request take far longer than normal, and when
// Apps Script itself hits an execution-time or quota limit, it returns an
// HTML error page instead of JSON. Before this helper existed, a slow
// request just meant "Loading…" forever with no way out, and an HTML
// response meant a raw "Unexpected token <" thrown straight at the user.
// Both now surface as one clear, actionable message instead.
async function fetchJson(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { ...options, cache: "no-store", signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("The server is taking too long to respond. Please try again in a moment.");
    }
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error("Server error (" + res.status + ") — try again.");
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("The server sent back an unexpected response. Please try again in a moment.");
  }
}

// Friendly text for the error codes Code.gs can return once server-side
// auth is wired up (see README.md's Firebase section for the full list).
function friendlyAuthError(code) {
  const messages = {
    not_provisioned:
      "Your account isn't set up with dashboard access yet. Ask your Southwest RE Centers admin to grant you access.",
    module_forbidden: "Your role doesn't include this module. Ask your admin if you need it.",
    invalid_token: "Your sign-in session expired — sign out and back in.",
    missing_token: "Your sign-in session expired — sign out and back in.",
    verification_failed: "Couldn't verify your sign-in — try refreshing the page.",
    missing_id: "Something went wrong preparing that edit — try again.",
    missing_updates: "Something went wrong preparing that edit — try again.",
    not_found: "Couldn't find that record — try refreshing the page.",
    forbidden: "You don't have permission to do that.",
    save_failed: "Couldn't save your changes — try again.",
    invalid_email: "Enter a valid email address.",
    missing_coordinator: "Something went wrong preparing that save — try again.",
    cannot_remove_last_admin: "Can't do that — it would leave nobody with Admin access. Make someone else an admin first.",
    invalid_role: "Pick a role for this person.",
    centers_required: "Pick at least one center (or All centers) for a Principal.",
    grades_required: "Pick at least one grade level (or All grade levels) for a Principal.",
  };
  return messages[code] || code;
}

function meCacheKeyFor(user) {
  return "sw-re-me-cache-v2-" + user.uid;
}

// Fetched right after sign-in, before a single hub tile is shown. Decides
// which of Attendance/Volunteer/Programs/PMP render at all, and whether the
// Admin tile shows up. A signed-in Firebase account with no Coordinators
// row gets nothing — not even the Volunteer Dashboard — since the
// Coordinators sheet (via the Admin screen) is meant to be the one source
// of truth for every module now, not just volunteer center-scoping.
//
// moduleGrid starts (and stays, on a cold load) hidden until access is
// known, then reveals every tile at once with visibility already applied.
// Previously the grid was shown immediately while individual gated tiles
// stayed hidden until this finished — which meant the two ungated tiles
// (Safeguarding/Launchpad) popped in right away and everything else
// visibly trickled in a few seconds later. Same stale-while-revalidate
// pattern as loadVolunteers/loadPrograms/loadAttendance/loadCoordinators:
// a returning session paints instantly (correctly) from cache while this
// still re-checks live in the background, since access can change.
async function loadMe() {
  const user = auth.currentUser;
  if (!user) return;

  el.hubStateMessage.classList.add("hidden");

  const cacheKey = meCacheKeyFor(user);
  let paintedFromCache = false;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const cachedData = JSON.parse(cached);
      meModules = Array.isArray(cachedData.modules) ? cachedData.modules : [];
      meIsAdmin = !!cachedData.isAdmin;
      if (cachedData.name || cachedData.email) {
        el.hubSignedInAs.textContent = cachedData.name || cachedData.email;
      }
      applyModuleVisibility();
      el.moduleGrid.classList.remove("hidden");
      paintedFromCache = true;
    }
  } catch (e) {
    /* ignore corrupt cache */
  }

  if (!paintedFromCache) {
    el.moduleGrid.classList.add("hidden");
    el.hubStateMessage.classList.remove("hidden");
    el.hubStateMessage.textContent = "Loading your modules…";
  }

  try {
    const idToken = await user.getIdToken();
    const params = new URLSearchParams({ idToken, resource: "me" });
    const url = APPS_SCRIPT_URL + (APPS_SCRIPT_URL.includes("?") ? "&" : "?") + params.toString();

    const data = await fetchJson(url);
    if (data && data.error) throw new Error(friendlyAuthError(data.error));

    meModules = Array.isArray(data.me && data.me.modules) ? data.me.modules : [];
    meIsAdmin = !!(data.me && data.me.isAdmin);
    if (data.me && (data.me.name || data.me.email)) {
      el.hubSignedInAs.textContent = data.me.name || data.me.email;
    }
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        modules: meModules,
        isAdmin: meIsAdmin,
        name: data.me && data.me.name,
        email: data.me && data.me.email,
      }));
    } catch (e) {
      /* storage full/unavailable — not fatal */
    }

    applyModuleVisibility();
    el.hubStateMessage.classList.add("hidden");
    el.moduleGrid.classList.remove("hidden");
  } catch (err) {
    if (!paintedFromCache) {
      el.moduleGrid.classList.add("hidden");
      el.hubStateMessage.classList.remove("hidden");
      el.hubStateMessage.textContent = "Couldn't load your access: " + err.message;
    }
  }
}

// Shows/hides each hub tile based on meModules/meIsAdmin. Tiles with no
// data-module attribute (the external links) are always shown — this only
// governs the modules the Admin screen actually manages.
//
// Hub tiles are grouped into labeled .module-section blocks (Dashboards,
// Facilities & Safety, External Links, Admin). A section made up entirely
// of gated tiles — Dashboards for someone with none of Attendance/
// Volunteer/Programs, or Admin for a non-admin — would otherwise show its
// heading with nothing underneath, so after the per-tile pass above, hide
// any section that has no visible .module-card left in it.
function applyModuleVisibility() {
  document.querySelectorAll("#moduleGrid [data-module]").forEach((tile) => {
    tile.classList.toggle("hidden", meModules.indexOf(tile.dataset.module) === -1);
  });
  if (el.moduleAdminBtn) el.moduleAdminBtn.classList.toggle("hidden", !meIsAdmin);

  document.querySelectorAll("#moduleGrid .module-section").forEach((section) => {
    const hasVisibleTile = !!section.querySelector(".module-card:not(.hidden), .policy-tile:not(.hidden)");
    section.classList.toggle("hidden", !hasVisibleTile);
  });
}

async function loadVolunteers({ forceFresh = false } = {}) {
  if (APPS_SCRIPT_URL.includes("PASTE_YOUR")) {
    el.stateMessage.classList.remove("hidden");
    el.stateMessage.textContent =
      "Set APPS_SCRIPT_URL in app.js to your deployed Apps Script web app URL. See README.md.";
    return;
  }

  const user = auth.currentUser;
  if (!user) return; // shouldn't happen — loadVolunteers only runs once signed in

  // Cache key is scoped to this specific signed-in user's uid. Different
  // coordinators only ever see their own assigned centers (enforced
  // server-side in Code.gs), so a shared browser must never paint one
  // coordinator's cached rows for another — a global cache key would risk
  // exactly that for a split second before the live fetch overwrote it.
  const cacheKey = cacheKeyFor(user);

  // 1. Paint instantly from local cache (if any) so the table never sits
  //    on a blank "Loading…" screen for repeat visits.
  let paintedFromCache = false;
  if (!forceFresh) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        volunteers = withComputed(cachedData.volunteers || []);
        if (cachedData.me && cachedData.me.name) el.signedInAs.textContent = cachedData.me.name;
        if (cachedData.me) canEdit = !!cachedData.me.canEdit;
        refreshFilterPanels();
        render();
        el.stateMessage.classList.add("hidden");
        el.volTable.classList.remove("hidden");
        paintedFromCache = true;
      }
    } catch (e) {
      /* ignore corrupt cache */
    }
  }

  if (!paintedFromCache) {
    el.stateMessage.classList.remove("hidden");
    el.stateMessage.textContent = "Loading volunteers…";
    el.volTable.classList.add("hidden");
  }

  // 2. Always fetch the live data in the background and re-render when it
  //    arrives (this is what keeps the dashboard correct, not just fast).
  //    The Firebase ID token goes along as a URL param — Code.gs verifies
  //    it server-side and filters the response to this coordinator's
  //    assigned center(s) before it ever leaves Google's servers.
  el.refreshBtn.classList.add("spinning");
  try {
    const idToken = await user.getIdToken();
    const params = new URLSearchParams({ idToken });
    if (forceFresh) params.set("nocache", "1");
    const url = APPS_SCRIPT_URL + (APPS_SCRIPT_URL.includes("?") ? "&" : "?") + params.toString();

    const data = await fetchJson(url);
    if (data && data.error) throw new Error(friendlyAuthError(data.error));

    volunteers = withComputed(data.volunteers || []);
    // Prefer the display name from the Coordinators sheet; fall back to
    // the sign-in email (already showing) if that column's blank.
    if (data.me && data.me.name) el.signedInAs.textContent = data.me.name;
    if (data.me) canEdit = !!data.me.canEdit;
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) {
      /* storage full/unavailable — not fatal */
    }

    refreshFilterPanels();
    if (currentPage === 1 || !paintedFromCache) currentPage = 1;
    render();
    el.stateMessage.classList.add("hidden");
    el.volTable.classList.remove("hidden");
    // Server reports how many data rows the sheet has; if the roster we got
    // is smaller (full-access users only), say so instead of staying silent.
    if (data.meta && data.meta.sheetRows > volunteers.length) {
      el.stateMessage.classList.remove("hidden");
      el.stateMessage.textContent =
        "Showing " + volunteers.length + " of " + data.meta.sheetRows +
        " rows in the sheet. " + data.meta.skipped + " row(s) have no name and were skipped.";
    }
  } catch (err) {
    el.stateMessage.classList.remove("hidden");
    el.stateMessage.textContent = paintedFromCache
      ? "Showing saved data — couldn't refresh: " + err.message + " Press Refresh to retry."
      : "Couldn't load volunteers: " + err.message;
  } finally {
    el.refreshBtn.classList.remove("spinning");
  }
}

// ===== Multi-select filter dropdowns =====

function setupMultiSelect({ btnId, panelId, badgeId, getOptions, selectedSet, onChange }) {
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  const badge = document.getElementById(badgeId);

  function refreshIfOpen() {
    if (!panel.classList.contains("hidden")) renderPanel();
  }

  function renderPanel() {
    const options = getOptions();
    if (options.length === 0) {
      panel.innerHTML = '<div class="ms-empty">No options yet</div>';
      return;
    }
    const actions = `<div class="ms-panel-actions">
      <button type="button" data-act="all">Select all</button>
      <button type="button" data-act="none">Clear</button>
    </div>`;
    const items = options
      .map(
        (opt) => `<label class="ms-option">
          <input type="checkbox" value="${escapeAttr(opt)}" ${selectedSet.has(opt) ? "checked" : ""} />
          ${escapeHtml(opt)}
        </label>`
      )
      .join("");
    panel.innerHTML = actions + items;
  }

  function updateBadge() {
    if (selectedSet.size > 0) {
      badge.textContent = String(selectedSet.size);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  panel.addEventListener("click", (e) => {
    // Without this, a click on a checkbox (or Select all/Clear) bubbles up
    // to the document-level "click outside closes every panel" listener
    // below — which was only meant to catch clicks OUTSIDE the dropdowns —
    // and closes this panel immediately after every single selection. The
    // button's own click handler already does the same thing for the same
    // reason (see below).
    e.stopPropagation();
    if (e.target.matches("input[type=checkbox]")) {
      if (e.target.checked) selectedSet.add(e.target.value);
      else selectedSet.delete(e.target.value);
      updateBadge();
      onChange();
    } else if (e.target.dataset.act === "all") {
      getOptions().forEach((o) => selectedSet.add(o));
      renderPanel();
      updateBadge();
      onChange();
    } else if (e.target.dataset.act === "none") {
      selectedSet.clear();
      renderPanel();
      updateBadge();
      onChange();
    }
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = panel.classList.contains("hidden");
    document.querySelectorAll(".ms-panel").forEach((p) => p.classList.add("hidden"));
    if (willOpen) {
      renderPanel();
      panel.classList.remove("hidden");
    }
  });

  updateBadge();
  return { renderPanel, updateBadge, refreshIfOpen };
}

// Options data the dropdowns read from. Populated/refreshed by
// refreshFilterPanels() every time new volunteer data arrives.
const filterOptionsData = { centers: [], positions: [], grades: [], servingPrograms: [], countries: [] };

let msControllers = {};
let filterListenersBound = false;

// Click handlers must be attached exactly once per button — attaching them
// again on every data refresh causes duplicate handlers on the same click,
// which makes the dropdown open and immediately re-close. So: bind once,
// then just refresh the underlying options data on every subsequent call.
function refreshFilterPanels() {
  filterOptionsData.centers = [...new Set(volunteers.map((v) => v.center).filter(Boolean))].sort();
  filterOptionsData.positions = [...new Set(volunteers.map((v) => v.position).filter(Boolean))].sort();
  filterOptionsData.grades = [...new Set(volunteers.flatMap(gradeTags))].sort();
  // Not a fixed two-value list like Status — pulled from whatever's
  // actually in the data, so it self-heals regardless of the exact
  // wording Tally submits for this answer (and shows nothing extra for
  // older submissions from before this question existed).
  filterOptionsData.servingPrograms = [...new Set(volunteers.map((v) => v.servingProgram).filter(Boolean))].sort();
  // Country of Birth is a dropdown on the form now, so the edit screen offers the same: every country already in the roster.
  filterOptionsData.countries = [...new Set(volunteers.map((v) => v.countryOfBirth).filter(Boolean))].sort();

  if (!filterListenersBound) {
    filterListenersBound = true;
    msControllers.status = setupMultiSelect({
      btnId: "statusMSBtn", panelId: "statusMSPanel", badgeId: "statusMSBadge",
      getOptions: () => ["Active", "Inactive"], selectedSet: filters.statuses, onChange: applyFiltersAndRender,
    });
    msControllers.servingProgram = setupMultiSelect({
      btnId: "servingProgramMSBtn", panelId: "servingProgramMSPanel", badgeId: "servingProgramMSBadge",
      getOptions: () => filterOptionsData.servingPrograms, selectedSet: filters.servingPrograms, onChange: applyFiltersAndRender,
    });
    msControllers.center = setupMultiSelect({
      btnId: "centerMSBtn", panelId: "centerMSPanel", badgeId: "centerMSBadge",
      getOptions: () => filterOptionsData.centers, selectedSet: filters.centers, onChange: applyFiltersAndRender,
    });
    msControllers.position = setupMultiSelect({
      btnId: "positionMSBtn", panelId: "positionMSPanel", badgeId: "positionMSBadge",
      getOptions: () => filterOptionsData.positions, selectedSet: filters.positions, onChange: applyFiltersAndRender,
    });
    msControllers.grade = setupMultiSelect({
      btnId: "gradeMSBtn", panelId: "gradeMSPanel", badgeId: "gradeMSBadge",
      getOptions: () => filterOptionsData.grades, selectedSet: filters.grades, onChange: applyFiltersAndRender,
    });
  } else {
    Object.values(msControllers).forEach((c) => c.refreshIfOpen());
  }
}

document.addEventListener("click", () => {
  document.querySelectorAll(".ms-panel").forEach((p) => p.classList.add("hidden"));
});

// ===== Filtering / sorting =====

function getFiltered() {
  const q = filters.search.trim().toLowerCase();
  return volunteers.filter((v) => {
    if (filters.statuses.size > 0 && !filters.statuses.has(v.status)) return false;
    if (filters.servingPrograms.size > 0 && !filters.servingPrograms.has(v.servingProgram)) return false;
    if (filters.centers.size > 0 && !filters.centers.has(v.center)) return false;
    if (filters.positions.size > 0 && !filters.positions.has(v.position)) return false;
    if (filters.grades.size > 0) {
      const tags = gradeTags(v);
      const hasMatch = tags.some((t) => filters.grades.has(t));
      if (!hasMatch) return false;
    }
    if (q) {
      const haystack = `${v.fullName} ${v.email}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function sortRows(rows) {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let av = a[sortKey];
    let bv = b[sortKey];
    if (sortKey === "age") {
      av = av ?? -1;
      bv = bv ?? -1;
      return (av - bv) * dir;
    }
    av = (av || "").toString().toLowerCase();
    bv = (bv || "").toString().toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function applyFiltersAndRender() {
  currentPage = 1;
  render();
}

// ===== Render table + pagination =====

function render() {
  const filtered = sortRows(getFiltered());
  el.countLabel.textContent = `${filtered.length} volunteer${filtered.length === 1 ? "" : "s"}`;

  document.querySelectorAll("#volTable thead th").forEach((th) => {
    const ind = th.querySelector(".sort-ind");
    if (!ind) return;
    ind.textContent = th.dataset.key === sortKey ? (sortDir === "asc" ? "▲" : "▼") : "";
  });

  if (filtered.length === 0) {
    el.tableBody.innerHTML = "";
    el.pagination.innerHTML = "";
    el.stateMessage.classList.remove("hidden");
    el.stateMessage.textContent = "No volunteers match your filters.";
    el.volTable.classList.add("hidden");
    return;
  }
  el.stateMessage.classList.add("hidden");
  el.volTable.classList.remove("hidden");

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  el.tableBody.innerHTML = pageRows
    .map((v) => {
      const photo = v.photoUrl
        ? `<img class="row-thumb" src="${escapeAttr(v.photoUrl)}" alt="" onerror="this.outerHTML='<div class=&quot;row-initials&quot;>${initials(v.fullName)}</div>'" />`
        : `<div class="row-initials">${initials(v.fullName)}</div>`;
      return `
        <tr data-id="${escapeAttr(v.id)}">
          <td data-label="Name"><div class="name-cell">${photo}<span>${escapeHtml(v.fullName)}</span></div></td>
          <td data-label="Status">${statusBadgeHtml(v.status)}</td>
          <td data-label="RE Center">${escapeHtml(v.center)}</td>
          <td data-label="Position">${v.position ? `<span class="position-pill">${escapeHtml(v.position)}</span>` : ""}</td>
          <td data-label="Grade Level">${escapeHtml(v.gradeLevel)}</td>
          <td data-label="Age">${v.age ?? "—"}</td>
          <td data-label="Gender">${escapeHtml(v.gender)}</td>
          <td data-label="Contact">${escapeHtml(v.contact)}</td>
          <td data-label="Email">${escapeHtml(v.email)}</td>
        </tr>`;
    })
    .join("");

  document.querySelectorAll("#tableBody tr").forEach((row) => {
    row.addEventListener("click", () => openDetail(row.dataset.id));
  });

  renderPagination(totalPages, filtered.length);
}

function renderPagination(totalPages, totalCount) {
  if (totalPages <= 1) {
    el.pagination.innerHTML = "";
    return;
  }
  const buttons = [];
  buttons.push(`<button data-page="prev" ${currentPage === 1 ? "disabled" : ""}>‹ Prev</button>`);

  const windowSize = 5;
  let startPage = Math.max(1, currentPage - Math.floor(windowSize / 2));
  let endPage = Math.min(totalPages, startPage + windowSize - 1);
  startPage = Math.max(1, endPage - windowSize + 1);

  if (startPage > 1) buttons.push(`<button data-page="1">1</button>`, startPage > 2 ? `<span>…</span>` : "");
  for (let p = startPage; p <= endPage; p++) {
    buttons.push(`<button data-page="${p}" class="${p === currentPage ? "active" : ""}">${p}</button>`);
  }
  if (endPage < totalPages) buttons.push(endPage < totalPages - 1 ? `<span>…</span>` : "", `<button data-page="${totalPages}">${totalPages}</button>`);

  buttons.push(`<button data-page="next" ${currentPage === totalPages ? "disabled" : ""}>Next ›</button>`);

  el.pagination.innerHTML = buttons.join("");

  el.pagination.querySelectorAll("button[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.page;
      if (p === "prev") currentPage = Math.max(1, currentPage - 1);
      else if (p === "next") currentPage = Math.min(totalPages, currentPage + 1);
      else currentPage = parseInt(p, 10);
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

// ===== Detail modal =====

// The editable fields shown in the main grid — everything except the
// header (name/position/center, edited separately above the grid) and the
// two read-only, non-editable values (Age is computed from DOB; Submitted
// is form metadata). Keys must match both the volunteer object shape and
// Code.gs's EDITABLE_FIELDS whitelist, or a save will silently be dropped
// server-side for that field.
const DETAIL_FIELDS = [
  { key: "status", label: "Status", type: "select", options: ["Active", "Inactive"] },
  // Options are pulled live (a function, not a fixed array) from whatever
  // values actually exist in the roster — see filterOptionsData in the
  // filtering section — so this never needs updating if the exact wording
  // of the Tally answer changes. allowBlank because older submissions
  // (from before this question existed) legitimately have nothing here.
  { key: "servingProgram", label: "Program", type: "select", options: () => filterOptionsData.servingPrograms, allowBlank: true, blankLabel: "Not set" },
  { key: "contact", label: "Contact" },
  { key: "email", label: "Email" },
  { key: "dob", label: "Date of Birth" },
  { key: "gender", label: "Gender" },
  { key: "gradeLevel", label: "Grade Level Served" },
  { key: "jamatkhana", label: "Jamatkhana" },
  { key: "education", label: "Education Level" },
  { key: "studiesInUSA", label: "Studies Completed in USA" },
  { key: "occupation", label: "Occupation" },
  { key: "countryOfBirth", label: "Country of Birth", type: "select", options: () => filterOptionsData.countries, allowBlank: true, blankLabel: "Not set" },
  { key: "yearMovedToUS", label: "Year Moved to the US" },
  { key: "tshirtSize", label: "T-Shirt Size" },
  { key: "sevaOutside", label: "Seva Outside RE System", multiline: true },
  { key: "sevaHistory", label: "Seva History Within RE", multiline: true },
];

// How the detail screen groups its fields. Keys are DETAIL_FIELDS keys, plus
// the read-only "age" and "submittedAt" (view mode only).
const DETAIL_SECTIONS = [
  { title: "Service", keys: ["status", "servingProgram", "gradeLevel", "jamatkhana", "submittedAt"] },
  { title: "Contact & Personal", keys: ["contact", "email", "dob", "age", "gender", "countryOfBirth", "yearMovedToUS", "tshirtSize"] },
  { title: "Education & Work", keys: ["education", "studiesInUSA", "occupation"] },
  { title: "Seva", keys: ["sevaOutside", "sevaHistory"] },
];

// Shown above the grid, inside the photo/name header — same treatment
// (an ordinary <input>), just styled larger to match the header's look.
const HEADER_EDIT_FIELDS = [
  { key: "fullName", label: "Full Name" },
  { key: "position", label: "Position" },
  { key: "center", label: "RE Center" },
];

const ALL_EDITABLE_KEYS = [...HEADER_EDIT_FIELDS, ...DETAIL_FIELDS].map((f) => f.key);

let currentDetailId = null;
let detailEditing = false;

function openDetail(id) {
  currentDetailId = id;
  detailEditing = false;
  const v = volunteers.find((x) => x.id === id);
  if (!v) return;

  el.detailPhoto.src = v.photoUrl || "";
  el.detailPhoto.style.display = v.photoUrl ? "block" : "none";

  renderDetailView(v);
  el.overlay.classList.remove("hidden");
  updateDetailNav();
  history.replaceState(null, "", `#${id}`);
}

function renderDetailView(v) {
  v = v || volunteers.find((x) => x.id === currentDetailId);
  if (!v) return;

  el.detailHeaderText.innerHTML = `
    <h2>${escapeHtml(v.fullName)}</h2>
    <p class="detail-subtitle">${escapeHtml(v.position || "")}</p>
    <p class="detail-subtitle">${escapeHtml(v.center || "")}</p>
  `;

  const byKey = {};
  DETAIL_FIELDS.forEach((f) => { byKey[f.key] = f; });
  // Read-only extras that aren't editable fields.
  const extras = { age: { label: "Age", value: v.age != null ? v.age : "" }, submittedAt: { label: "Submitted", value: v.submittedAt } };

  el.detailFields.innerHTML = DETAIL_SECTIONS.map((sec) => {
    const items = sec.keys
      .map((key) => {
        const f = byKey[key];
        const label = f ? f.label : extras[key].label;
        const val = f ? v[key] : extras[key].value;
        if (val === "" || val == null) return "";
        let dd;
        if (label === "Status") dd = statusBadgeHtml(val);
        else if (label === "Program") dd = `<span class="program-category-pill">${escapeHtml(val)}</span>`;
        else dd = escapeHtml(val);
        const wide = f && f.multiline ? " detail-item-wide" : "";
        return `<div class="detail-item${wide}"><dt>${escapeHtml(label)}</dt><dd>${dd}</dd></div>`;
      })
      .join("");
    if (!items) return "";
    return `<section class="detail-section"><h3>${escapeHtml(sec.title)}</h3><dl class="detail-section-grid">${items}</dl></section>`;
  }).join("");

  // Only coordinators with Edit Access = YES in the Coordinators sheet
  // ever see the pencil — this is a convenience for them, not the actual
  // security boundary, which is enforced server-side in doPost.
  el.editDetailBtn.classList.toggle("hidden", !canEdit);
  el.detailEditActions.classList.add("hidden");
  updateDetailNav();
  el.detailSaveError.classList.add("hidden");
}

function renderDetailEdit() {
  const v = volunteers.find((x) => x.id === currentDetailId);
  if (!v) return;

  el.detailHeaderText.innerHTML = HEADER_EDIT_FIELDS.map(
    (f) => `<label class="edit-field"><span>${escapeHtml(f.label)}</span><input id="edit_${f.key}" type="text" value="${escapeAttr(v[f.key] || "")}" /></label>`
  ).join("");

  const editField = (f) => {
    let input;
    if (f.type === "select") {
      // options can be a fixed array (Status) or a function returning the
      // live set of values seen in the current roster (Program) — either
      // way we end up with a plain array here.
      const opts = typeof f.options === "function" ? f.options() : f.options;
      const current = v[f.key] || "";
      // Never hide the volunteer's own current value even if it's since
      // fallen out of the live options list for some reason.
      const optionList = current && opts.indexOf(current) === -1 ? [current, ...opts] : opts;
      const blankOption = f.allowBlank
        ? `<option value=""${current ? "" : " selected"}>${escapeHtml(f.blankLabel || "Not set")}</option>`
        : "";
      // Fields without allowBlank keep the original behavior: default the
      // selection to the first option rather than leaving nothing chosen.
      const selectedValue = !f.allowBlank && !current ? optionList[0] : current;
      input = `<select id="edit_${f.key}">${blankOption}${optionList
        .map((o) => `<option value="${escapeAttr(o)}"${o === selectedValue ? " selected" : ""}>${escapeHtml(o)}</option>`)
        .join("")}</select>`;
    } else if (f.multiline) {
      input = `<textarea id="edit_${f.key}" rows="3">${escapeHtml(v[f.key] || "")}</textarea>`;
    } else {
      input = `<input id="edit_${f.key}" type="text" value="${escapeAttr(v[f.key] || "")}" />`;
    }
    return `<label class="edit-field${f.multiline ? " detail-item-wide" : ""}">${escapeHtml(f.label)}${input}</label>`;
  };
  const editByKey = {};
  DETAIL_FIELDS.forEach((f) => { editByKey[f.key] = f; });
  el.detailFields.innerHTML = DETAIL_SECTIONS.map((sec) => {
    const fields = sec.keys.filter((k) => editByKey[k]).map((k) => editField(editByKey[k])).join("");
    if (!fields) return "";
    return `<section class="detail-section"><h3>${escapeHtml(sec.title)}</h3><div class="detail-section-grid">${fields}</div></section>`;
  }).join("");

  el.editDetailBtn.classList.add("hidden");
  el.detailEditActions.classList.remove("hidden");
  updateDetailNav();
  el.detailSaveError.classList.add("hidden");
}

async function saveDetailEdit() {
  const id = currentDetailId;
  const updates = {};
  ALL_EDITABLE_KEYS.forEach((key) => {
    const input = document.getElementById("edit_" + key);
    if (input) updates[key] = input.value.trim();
  });

  el.saveEditBtn.disabled = true;
  el.saveEditBtn.textContent = "Saving…";
  el.detailSaveError.classList.add("hidden");

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("You're signed out — sign in again.");
    const idToken = await user.getIdToken();

    const data = await fetchJson(APPS_SCRIPT_URL, {
      method: "POST",
      // Deliberately no Content-Type header: setting one (e.g.
      // application/json) makes the browser send a CORS preflight
      // (OPTIONS) request first, which Apps Script web apps can't
      // handle. Omitting it defaults to text/plain — a "simple
      // request" that skips preflight — while Code.gs still
      // JSON.parse()s the raw body regardless of the declared type.
      body: JSON.stringify({ idToken, id, updates }),
    });
    if (data && data.error) throw new Error(friendlyAuthError(data.error));
    if (!data || !data.ok) throw new Error("Server error — try again.");

    // Patch local state immediately so the table/filters/stats reflect
    // the edit without waiting on a full reload, then drop the stale
    // local cache so a future page load pulls the corrected roster
    // instead of repainting the old cached values first.
    const idx = volunteers.findIndex((x) => x.id === id);
    if (idx > -1) volunteers[idx] = withComputed([data.volunteer])[0];
    try {
      localStorage.removeItem(cacheKeyFor(user));
    } catch (e) {
      /* ignore */
    }

    refreshFilterPanels();
    render();
    detailEditing = false;
    renderDetailView();
  } catch (err) {
    el.detailSaveError.textContent = "Couldn't save: " + err.message;
    el.detailSaveError.classList.remove("hidden");
  } finally {
    el.saveEditBtn.disabled = false;
    el.saveEditBtn.textContent = "Save Changes";
  }
}

// Previous / next volunteer, in exactly the order the table shows them
// (current filters + sort, across all pages). With no filters that's the
// whole roster. Disabled while editing so unsaved changes can't be lost.
function detailNavList() {
  return sortRows(getFiltered());
}

function updateDetailNav() {
  const list = detailNavList();
  const idx = list.findIndex((x) => x.id === currentDetailId);
  const known = idx > -1;
  el.detailNavCount.textContent = known ? `${idx + 1} of ${list.length}` : `${list.length} in list`;
  el.detailPrevBtn.disabled = detailEditing || !known || idx <= 0;
  el.detailNextBtn.disabled = detailEditing || !known || idx >= list.length - 1;
}

function stepDetail(delta) {
  if (detailEditing) return;
  const list = detailNavList();
  const idx = list.findIndex((x) => x.id === currentDetailId);
  const target = list[idx + delta];
  if (idx === -1 || !target) return;
  openDetail(target.id);
  const body = document.getElementById("detailFields");
  if (body) body.scrollTop = 0;
}

function closeDetail() {
  el.overlay.classList.add("hidden");
  detailEditing = false;
  history.replaceState(null, "", window.location.pathname);
}

// ===== Export to Excel =====

function exportToExcel() {
  const rows = sortRows(getFiltered()).map((v) => ({
    "Full Name": v.fullName,
    "Status": v.status,
    "Program": v.servingProgram,
    "Age": v.age ?? "",
    "Date of Birth": v.dob,
    "Gender": v.gender,
    "RE Center": v.center,
    "Position": v.position,
    "Grade Level": v.gradeLevel,
    "Contact": v.contact,
    "Email": v.email,
    "Jamatkhana": v.jamatkhana,
    "Education Level": v.education,
    "Studies Completed in USA": v.studiesInUSA,
    "Occupation": v.occupation,
    "Country of Birth": v.countryOfBirth,
    "Year Moved to the US": v.yearMovedToUS,
    "T-Shirt Size": v.tshirtSize,
    "Seva Outside RE System": v.sevaOutside,
    "Seva History Within RE": v.sevaHistory,
    "Headshot URL": v.photoUrl,
    "Submitted At": v.submittedAt,
  }));

  if (rows.length === 0) {
    alert("No volunteers to export with the current filters.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Volunteers");

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `southwest-re-volunteers_${dateStr}.xlsx`);
}

// ===== ITREB Programs module =====
// Board-facing view of the "Program" sheet tab — entirely separate data
// and permission model from the volunteer roster above. Any signed-in
// user can edit Program Lead / Status here (see Code.gs's doPost); there's
// no Edit Access gate and no per-center filtering, since this isn't
// center-scoped data.

// Turns a status string into a CSS-safe suffix ("Feedback Provided" ->
// "feedback-provided") so each status can have its own select color
// without a lookup table that has to be kept in sync with PROGRAM_STATUSES.
function statusSlug(status) {
  if (!status) return "unset";
  return status.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Approved and Rejected are their own sections; everything else (Pending
// Review, Feedback Provided, or not yet triaged at all) is "in the works"
// — matches the three-section layout on the page. "Completed" is folded
// into the Approved bucket too: the board never actually flips a proposal
// from Approved to Completed by hand (that was the whole reason this
// section got renamed from "Completed" to "Approved"), so treating the two
// the same way keeps any old rows already marked Completed from stranding
// in "In the Works" looking like they still need action.
function programBucket(status) {
  if (status === "Approved" || status === "Completed") return "approved";
  if (status === "Rejected") return "rejected";
  return "inWork";
}

// Soonest event first within a section (In the Works / Approved); pass
// desc:true for most-recent-first (Rejected — a proposal rejected for an
// event long past is less relevant than one that just got turned down).
// Programs with no parseable date always sort to the end rather than the
// (misleading) top, in either direction.
function sortByEventDate(list, { desc = false } = {}) {
  return [...list].sort((a, b) => {
    const da = parseDob(a.eventDate);
    const db = parseDob(b.eventDate);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return desc ? db - da : da - db;
  });
}

// Search box filters by program name or the primary contact's name (there's
// no RE Center field on this sheet, so those two are what the board can
// reliably search by). Case-insensitive substring match, applied before
// bucketing so counts/sections reflect only what's visible.
function programMatchesSearch(p, query) {
  if (!query) return true;
  const haystack = ((p.eventName || "") + " " + (p.contactName || "")).toLowerCase();
  return haystack.includes(query);
}

function programRowHtml(p) {
  const statusVal = p.status || "";
  const leadVal = p.programLead || "";

  const leadOptions =
    '<option value="">Unassigned</option>' +
    programLeads
      .map((l) => `<option value="${escapeAttr(l)}"${l === leadVal ? " selected" : ""}>${escapeHtml(l)}</option>`)
      .join("");

  const statusOptions =
    '<option value="">Not set</option>' +
    programStatuses
      .map((s) => `<option value="${escapeAttr(s)}"${s === statusVal ? " selected" : ""}>${escapeHtml(s)}</option>`)
      .join("");

  const contact = p.contactName
    ? escapeHtml(p.contactName) + (p.contactRole ? ` <span class="program-contact-role">· ${escapeHtml(p.contactRole)}</span>` : "")
    : "";

  return `
    <tr data-id="${escapeAttr(p.id)}">
      <td data-label="Event Name" class="program-cell-title">${escapeHtml(p.eventName)}</td>
      <td data-label="Proposal For">${p.proposalFor ? `<span class="program-category-pill">${escapeHtml(p.proposalFor)}</span>` : ""}</td>
      <td data-label="Contact">${contact}</td>
      <td data-label="Event Date">${escapeHtml(p.eventDate)}</td>
      <td data-label="Academic Year">${escapeHtml(p.academicYear)}</td>
      <td data-label="Program Lead">
        <select data-field="programLead" data-id="${escapeAttr(p.id)}">${leadOptions}</select>
      </td>
      <td data-label="Status">
        <select data-field="status" data-id="${escapeAttr(p.id)}" class="program-status-select program-status-${statusSlug(statusVal)}">${statusOptions}</select>
        <p class="program-row-error hidden"></p>
      </td>
    </tr>`;
}

// Set by the search input's listener below; kept outside renderPrograms so
// a re-render triggered by anything else (a status save, a background
// refresh landing) doesn't clear whatever the board typed.
let programSearchQuery = "";

function renderPrograms() {
  const query = programSearchQuery.trim().toLowerCase();
  const visible = programs.filter((p) => programMatchesSearch(p, query));

  const buckets = { inWork: [], approved: [], rejected: [] };
  visible.forEach((p) => buckets[programBucket(p.status)].push(p));

  [
    ["inWork", el.programsInWorkGrid, el.programsInWorkCount, el.programsInWorkEmpty, el.programsInWorkTableWrap, false, "Nothing in progress right now."],
    ["approved", el.programsApprovedGrid, el.programsApprovedCount, el.programsApprovedEmpty, el.programsApprovedTableWrap, false, "No approved programs yet."],
    ["rejected", el.programsRejectedGrid, el.programsRejectedCount, el.programsRejectedEmpty, el.programsRejectedTableWrap, true, "No rejected proposals."],
  ].forEach(([key, tbody, countEl, emptyEl, wrapEl, desc, defaultEmptyText]) => {
    const list = sortByEventDate(buckets[key], { desc });
    countEl.textContent = String(list.length);
    if (list.length === 0) {
      tbody.innerHTML = "";
      wrapEl.classList.add("hidden");
      emptyEl.textContent = query ? "No matches." : defaultEmptyText;
      emptyEl.classList.remove("hidden");
    } else {
      emptyEl.classList.add("hidden");
      wrapEl.classList.remove("hidden");
      tbody.innerHTML = list.map(programRowHtml).join("");
    }
  });
}

// Same per-user localStorage key convention as cacheKeyFor() (Volunteers)
// — scoped to the signed-in uid so a shared browser never paints one
// person's cached view for another, even for data that isn't itself
// per-user like Programs is.
function programsCacheKeyFor(user) {
  return "sw-re-programs-cache-v1-" + user.uid;
}

// Stale-while-revalidate, same pattern as loadVolunteers: paint instantly
// from whatever's in localStorage (if anything) so this module never sits
// on a blank "Loading…" screen for a repeat visit, then always fetch live
// in the background and re-render when that arrives.
async function loadPrograms({ forceFresh = false } = {}) {
  const user = auth.currentUser;
  if (!user) return;

  const cacheKey = programsCacheKeyFor(user);
  let paintedFromCache = false;
  if (!forceFresh) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        programs = Array.isArray(cachedData.programs) ? cachedData.programs : [];
        programLeads = Array.isArray(cachedData.programLeads) ? cachedData.programLeads : [];
        programStatuses = Array.isArray(cachedData.programStatuses) ? cachedData.programStatuses : [];
        if (cachedData.me && (cachedData.me.name || cachedData.me.email)) {
          el.programsSignedInAs.textContent = cachedData.me.name || cachedData.me.email;
        }
        renderPrograms();
        el.programsStateMessage.classList.add("hidden");
        el.programsContent.classList.remove("hidden");
        paintedFromCache = true;
      }
    } catch (e) {
      /* ignore corrupt cache */
    }
  }

  if (!paintedFromCache) {
    el.programsStateMessage.classList.remove("hidden");
    el.programsStateMessage.textContent = "Loading programs…";
    el.programsContent.classList.add("hidden");
  }

  el.programsRefreshBtn.classList.add("spinning");
  try {
    const idToken = await user.getIdToken();
    const params = new URLSearchParams({ idToken, resource: "programs" });
    if (forceFresh) params.set("nocache", "1");
    const url = APPS_SCRIPT_URL + (APPS_SCRIPT_URL.includes("?") ? "&" : "?") + params.toString();

    const data = await fetchJson(url);
    if (data && data.error) throw new Error(friendlyAuthError(data.error));

    programs = Array.isArray(data.programs) ? data.programs : [];
    programLeads = Array.isArray(data.programLeads) ? data.programLeads : [];
    programStatuses = Array.isArray(data.programStatuses) ? data.programStatuses : [];
    if (data.me && (data.me.name || data.me.email)) {
      el.programsSignedInAs.textContent = data.me.name || data.me.email;
    }
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) {
      /* storage full/unavailable — not fatal */
    }

    renderPrograms();
    el.programsStateMessage.classList.add("hidden");
    el.programsContent.classList.remove("hidden");
  } catch (err) {
    if (!paintedFromCache) {
      el.programsStateMessage.classList.remove("hidden");
      el.programsStateMessage.textContent = "Couldn't load programs: " + err.message;
    }
  } finally {
    el.programsRefreshBtn.classList.remove("spinning");
  }
}

// Auto-saves the instant a dropdown changes — no separate Save button,
// since these are the only two editable fields and the whole point is
// quick in-place updates for the board. On success the card's own section
// may change (e.g. Status -> Completed moves it out of "in the works"),
// which a full re-render handles naturally. On failure the dropdown reverts
// to its last known-good value rather than showing a value that was never
// actually saved.
async function saveProgramField(id, field, value, selectEl) {
  const row = selectEl.closest("tr");
  const errorEl = row ? row.querySelector(".program-row-error") : null;
  const selects = row ? row.querySelectorAll("select") : [selectEl];
  selects.forEach((s) => (s.disabled = true));
  if (errorEl) errorEl.classList.add("hidden");

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("You're signed out — sign in again.");
    const idToken = await user.getIdToken();

    const data = await fetchJson(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ idToken, resource: "program", id, updates: { [field]: value } }),
    });
    if (data && data.error) throw new Error(friendlyAuthError(data.error));
    if (!data || !data.ok) throw new Error("Server error — try again.");

    const idx = programs.findIndex((p) => p.id === id);
    if (idx > -1) programs[idx] = data.program;
    renderPrograms();
    // Local cache now holds a stale program list — drop it so the next
    // load (even from a fresh page load before the background fetch
    // resolves) doesn't briefly repaint the old value first.
    try {
      localStorage.removeItem(programsCacheKeyFor(user));
    } catch (e) {
      /* ignore */
    }
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = "Couldn't save: " + err.message;
      errorEl.classList.remove("hidden");
    }
    selects.forEach((s) => (s.disabled = false));
    const p = programs.find((x) => x.id === id);
    if (p) selectEl.value = p[field] || "";
  }
}

el.programsContent.addEventListener("change", (e) => {
  const sel = e.target;
  if (!sel.matches("select[data-field]")) return;
  saveProgramField(sel.dataset.id, sel.dataset.field, sel.value, sel);
});

if (el.programsSearchInput) {
  el.programsSearchInput.addEventListener("input", (e) => {
    programSearchQuery = e.target.value;
    renderPrograms();
  });
}

// ===== Attendance Metrics module =====
// Read-only board view of the "Attendance" sheet tab — cumulative
// (Present + Tardy) / Total, aggregated server-side in Code.gs into one
// row per Category + RE Center. Any signed-in user can view it; nothing
// here writes back to the sheet.

// Green/amber/red thresholds for the percentage — not specified by the
// board, chosen as reasonable defaults. Easy to adjust in one place if a
// different cutoff is wanted later.
function attendanceLevel(pct) {
  if (pct == null) return "unknown";
  if (pct >= 90) return "good";
  if (pct >= 75) return "watch";
  return "low";
}

// Shows the percentage AND the enrolled headcount directly on the card —
// no flip needed. `students` comes from Code.gs: each grade+section's own
// most recently reported roster size, summed across every section in this
// category+center — a stable enrollment figure (see buildAttendanceSummary's
// comment), not the cumulative year-to-date `total` the percentage math
// uses. Tapping/clicking the card now opens the trend popup (see
// openAttendanceTrend below) instead of flipping; `data-key` is how the
// delegated click listener finds this row again in the `attendance` array.
function attendanceCardHtml(row) {
  const level = attendanceLevel(row.percent);
  const pctText = row.percent != null ? row.percent.toFixed(1) + "%" : "—";
  const studentsText = row.students > 0
    ? row.students + (row.students === 1 ? " student" : " students") + " enrolled"
    : "No enrollment on file";
  const key = row.category + "|" + row.center;
  return `
    <div class="attendance-card attendance-card-${level}" tabindex="0" role="button" data-key="${escapeAttr(key)}" aria-label="${escapeAttr(row.center)}, ${pctText} attendance, ${studentsText}. Press to see the attendance trend.">
      <p class="attendance-card-center">${escapeHtml(row.center)}</p>
      <p class="attendance-card-pct">${pctText}</p>
      <p class="attendance-card-students">${studentsText}</p>
      <p class="attendance-card-hint">Tap for trend</p>
    </div>`;
}

function renderAttendance() {
  // Grand total across every band + center. Each `students` figure is
  // already a per-grade+section latest roster count (see the comment on
  // buildAttendanceSummary in Code.gs), and every grade+section belongs to
  // exactly one category and one center — so summing it across the whole
  // `attendance` array double-counts nobody; this is the closest figure
  // the data supports to a unique enrolled headcount sitewide.
  const totalStudents = attendance.reduce((sum, r) => sum + (r.students || 0), 0);
  el.attendanceTotalValue.textContent = totalStudents.toLocaleString();

  ATTENDANCE_CATEGORIES.forEach(({ key, grid, empty, overall }) => {
    const rows = attendance.filter((r) => r.category === key);
    // Lowest attendance first — surfaces the centers that most need
    // attention right at the top, rather than an alphabetical list the
    // board would have to scan for problem spots.
    rows.sort((a, b) => (a.percent ?? -1) - (b.percent ?? -1));

    const gridEl = el[grid];
    const emptyEl = el[empty];
    const overallEl = el[overall];

    const totals = rows.reduce((acc, r) => ({ total: acc.total + r.total, attended: acc.attended + r.attended }), { total: 0, attended: 0 });
    const overallPct = totals.total > 0 ? Math.round((totals.attended / totals.total) * 1000) / 10 : null;
    const overallLevel = attendanceLevel(overallPct);
    overallEl.querySelector(".attendance-overall-value").textContent = overallPct != null ? overallPct.toFixed(1) + "%" : "—";
    overallEl.className = `attendance-overall attendance-overall-${overallLevel}`;
    overallEl.querySelector(".attendance-overall-label").textContent = "Overall";

    if (rows.length === 0) {
      gridEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
    } else {
      emptyEl.classList.add("hidden");
      gridEl.innerHTML = rows.map(attendanceCardHtml).join("");
    }
  });

  el.attendanceAsOf.textContent = attendanceAsOf ? `Data through ${attendanceAsOf}` : "";
}

// Holds the currently-rendered Chart.js instance (if any) so it can be torn
// down before drawing a new one — Chart.js throws if you reuse a canvas
// that already has a live chart attached to it without destroying the old
// one first, and the same canvas is reused for every card's popup.
let attendanceTrendChartInstance = null;

// Percent labels drawn directly above every point, always on — the board
// shouldn't have to hover/tap a dot to find out what it says. A local
// plugin (passed via the chart's own `plugins` array below, not
// Chart.register'd globally) so it only ever applies to this one chart.
const attendanceTrendDataLabelsPlugin = {
  id: "attendanceTrendDataLabels",
  afterDatasetsDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data) return;
    const values = chart.data.datasets[0].data;
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = "600 12px sans-serif";
    ctx.fillStyle = "#182b47";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    meta.data.forEach((point, i) => {
      const value = values[i];
      if (value == null) return;
      ctx.fillText(value.toFixed(1) + "%", point.x, point.y - 8);
    });
    ctx.restore();
  },
};

// The y-axis floor adapts per chart instead of always starting at 0: most
// centers sit in the 70-100% range, so a fixed 0-100 axis crams every real
// data point into the top sliver and wastes the rest on percentages no
// center is ever near. Floors to the nearest 10 below the chart's own
// lowest point (with a little headroom so that point isn't glued to the
// bottom edge) — a center having a genuinely bad week still shows it in
// full, it just doesn't force every OTHER center's chart to also start at 0.
function computeTrendYAxisMin(trend) {
  const values = trend.map((t) => t.percent).filter((v) => v != null);
  if (values.length === 0) return 0;
  const lowest = Math.min(...values);
  const floor = Math.floor((lowest - 10) / 10) * 10;
  return Math.max(0, floor);
}

// Opens the trend popup for one attendance card and (re)draws its line
// chart. `key` is "<category>|<center>" — the same composite key
// buildAttendanceSummary groups by server-side, rendered onto each card as
// data-key so the delegated click listener below can look the row back up.
function openAttendanceTrend(key) {
  const row = attendance.find((r) => r.category + "|" + r.center === key);
  if (!row) return;

  el.attendanceTrendTitle.textContent = row.center;
  el.attendanceTrendSubtitle.textContent = row.category;

  if (attendanceTrendChartInstance) {
    attendanceTrendChartInstance.destroy();
    attendanceTrendChartInstance = null;
  }

  const trend = Array.isArray(row.trend) ? row.trend : [];
  if (trend.length === 0) {
    el.attendanceTrendChart.classList.add("hidden");
    el.attendanceTrendEmpty.textContent = "Not enough dated attendance data yet for a trend.";
    el.attendanceTrendEmpty.classList.remove("hidden");
  } else {
    try {
      el.attendanceTrendEmpty.classList.add("hidden");
      el.attendanceTrendChart.classList.remove("hidden");
      attendanceTrendChartInstance = new Chart(el.attendanceTrendChart, {
        type: "line",
        data: {
          labels: trend.map((t) => t.label),
          datasets: [{
            label: "Attendance %",
            data: trend.map((t) => t.percent),
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.12)",
            borderWidth: 3,
            tension: 0.25,
            fill: true,
            pointRadius: 5,
            pointBackgroundColor: "#2563eb",
            spanGaps: true,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          // Extra headroom above the plot area so a data label sitting
          // above a point near 100% never gets clipped by the canvas edge.
          layout: { padding: { top: 24 } },
          scales: {
            x: { grid: { display: false } },
            y: {
              min: computeTrendYAxisMin(trend),
              max: 100,
              ticks: { stepSize: 10, callback: (v) => v + "%" },
              grid: { color: "rgba(24, 43, 71, 0.08)" },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => (ctx.parsed.y == null ? "No data" : ctx.parsed.y.toFixed(1) + "%"),
              },
            },
          },
        },
        plugins: [attendanceTrendDataLabelsPlugin],
      });
    } catch (e) {
      // Most likely Chart.js failed to load from the CDN — fail gracefully
      // rather than leaving a blank canvas with no explanation.
      el.attendanceTrendChart.classList.add("hidden");
      el.attendanceTrendEmpty.textContent = "Couldn't load the trend chart. Please try again.";
      el.attendanceTrendEmpty.classList.remove("hidden");
    }
  }

  el.attendanceTrendOverlay.classList.remove("hidden");
}

// ===== Year-over-year attendance chart =====
// One line per grade band, one point per academic year. Data comes from a
// separate endpoint (Historical tab + current Attendance tab) fetched only
// when the button is pressed, then kept in memory for the session.

let yoyChartInstance = null;
let yoyData = null;
const YOY_BANDS = [
  { key: "Pre-Primary", color: "#e0833a" },
  { key: "Primary", color: "#2b6cb0" },
  { key: "Secondary", color: "#2f9e6e" },
];

const yoyLabelsPlugin = {
  id: "yoyLabels",
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = "600 12px sans-serif";
    ctx.textAlign = "center";
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      ctx.fillStyle = ds.borderColor;
      // Pre-Primary labels sit below, others above, so lines that run close together stay readable.
      ctx.textBaseline = di === 0 ? "top" : "bottom";
      meta.data.forEach((pt, i) => {
        const v = ds.data[i];
        if (v == null) return;
        ctx.fillText(v.toFixed(1) + "%", pt.x, di === 0 ? pt.y + 9 : pt.y - 9);
      });
    });
    ctx.restore();
  },
};

function drawYoyChart(points) {
  if (yoyChartInstance) {
    yoyChartInstance.destroy();
    yoyChartInstance = null;
  }
  const labels = points.map((p) => p.year + (p.partial ? " (to date)" : ""));
  const all = [];
  const datasets = YOY_BANDS.map((b) => {
    const data = points.map((p) => (p.bands[b.key] == null ? null : p.bands[b.key]));
    data.forEach((v) => v != null && all.push(v));
    return {
      label: b.key,
      data,
      borderColor: b.color,
      backgroundColor: b.color,
      borderWidth: 3,
      pointRadius: 5,
      pointHoverRadius: 7,
      tension: 0.25,
      spanGaps: true,
    };
  });
  const lowest = all.length ? Math.min(...all) : 0;
  const highest = all.length ? Math.max(...all) : 100;
  const yMin = Math.max(0, Math.floor((lowest - 6) / 5) * 5);
  const yMax = Math.min(100, Math.ceil((highest + 4) / 5) * 5);
  yoyChartInstance = new Chart(el.yoyChart, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 16, right: 24 } },
      scales: {
        y: { min: yMin, max: yMax, ticks: { callback: (v) => v + "%", font: { size: 13 } }, grid: { color: "#e6ebf2" } },
        x: { ticks: { font: { size: 13, weight: "600" } }, grid: { display: false } },
      },
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true, font: { size: 14, weight: "600" }, padding: 18 } },
        tooltip: { callbacks: { label: (c) => c.dataset.label + ": " + (c.parsed.y == null ? "n/a" : c.parsed.y.toFixed(1) + "%") } },
      },
    },
    plugins: [yoyLabelsPlugin],
  });
}

async function openYoy() {
  el.yoyOverlay.classList.remove("hidden");
  el.yoyEmpty.classList.add("hidden");
  el.yoyChart.classList.remove("hidden");
  el.yoyNote.textContent = "";
  if (!yoyData) {
    el.yoyChart.classList.add("hidden");
    el.yoyEmpty.textContent = "Loading year-over-year data…";
    el.yoyEmpty.classList.remove("hidden");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please sign in again.");
      const idToken = await user.getIdToken();
      const params = new URLSearchParams({ idToken, resource: "attendance_yoy" });
      const url = APPS_SCRIPT_URL + (APPS_SCRIPT_URL.includes("?") ? "&" : "?") + params.toString();
      const data = await fetchJson(url, {}, 45000);
      if (data && data.error) throw new Error(friendlyAuthError(data.error));
      yoyData = Array.isArray(data.yoy) ? data.yoy : [];
    } catch (err) {
      el.yoyEmpty.textContent = "Couldn't load the year-over-year trend: " + err.message;
      return;
    }
  }
  if (yoyData.length === 0) {
    el.yoyChart.classList.add("hidden");
    el.yoyEmpty.textContent = "No historical attendance data found yet.";
    el.yoyEmpty.classList.remove("hidden");
    return;
  }
  el.yoyEmpty.classList.add("hidden");
  el.yoyChart.classList.remove("hidden");
  try {
    drawYoyChart(yoyData);
    if (yoyData.some((p) => p.partial)) {
      el.yoyNote.textContent = "The current academic year is still in progress, so its figure covers classes held to date.";
    }
  } catch (e) {
    el.yoyChart.classList.add("hidden");
    el.yoyEmpty.textContent = "Couldn't draw the chart. Please try again.";
    el.yoyEmpty.classList.remove("hidden");
  }
}

function closeYoy() {
  el.yoyOverlay.classList.add("hidden");
}

function closeAttendanceTrend() {
  el.attendanceTrendOverlay.classList.add("hidden");
}

function attendanceCacheKeyFor(user) {
  return "sw-re-attendance-cache-v1-" + user.uid;
}

// Same stale-while-revalidate pattern as loadVolunteers/loadPrograms.
async function loadAttendance({ forceFresh = false } = {}) {
  const user = auth.currentUser;
  if (!user) return;
  yoyData = null; // re-fetched on next open so it always matches the signed-in user

  const cacheKey = attendanceCacheKeyFor(user);
  let paintedFromCache = false;
  if (!forceFresh) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        attendance = Array.isArray(cachedData.attendance) ? cachedData.attendance : [];
        attendanceAsOf = cachedData.attendanceAsOf || "";
        if (cachedData.me && (cachedData.me.name || cachedData.me.email)) {
          el.attendanceSignedInAs.textContent = cachedData.me.name || cachedData.me.email;
        }
        renderAttendance();
        el.attendanceStateMessage.classList.add("hidden");
        el.attendanceContent.classList.remove("hidden");
        paintedFromCache = true;
      }
    } catch (e) {
      /* ignore corrupt cache */
    }
  }

  if (!paintedFromCache) {
    el.attendanceStateMessage.classList.remove("hidden");
    el.attendanceStateMessage.textContent = "Loading attendance…";
    el.attendanceContent.classList.add("hidden");
  }

  el.attendanceRefreshBtn.classList.add("spinning");
  try {
    const idToken = await user.getIdToken();
    const params = new URLSearchParams({ idToken, resource: "attendance" });
    if (forceFresh) params.set("nocache", "1");
    const url = APPS_SCRIPT_URL + (APPS_SCRIPT_URL.includes("?") ? "&" : "?") + params.toString();

    const data = await fetchJson(url);
    if (data && data.error) throw new Error(friendlyAuthError(data.error));

    attendance = Array.isArray(data.attendance) ? data.attendance : [];
    attendanceAsOf = data.attendanceAsOf || "";
    if (data.me && (data.me.name || data.me.email)) {
      el.attendanceSignedInAs.textContent = data.me.name || data.me.email;
    }
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) {
      /* storage full/unavailable — not fatal */
    }

    renderAttendance();
    el.attendanceStateMessage.classList.add("hidden");
    el.attendanceContent.classList.remove("hidden");
  } catch (err) {
    if (!paintedFromCache) {
      el.attendanceStateMessage.classList.remove("hidden");
      el.attendanceStateMessage.textContent = "Couldn't load attendance: " + err.message;
    }
  } finally {
    el.attendanceRefreshBtn.classList.remove("spinning");
  }
}

// ===== Admin module =====
// Manages the Coordinators sheet from the UI. Everyone has one of three
// roles (Admin, Board Member, Principal); a Principal is also limited to the
// centers and grade levels tagged on their row. Every write is admin-gated
// server-side in Code.gs (see doPost's 'coordinator' resource); hiding this
// tile and section for non-admins here is a convenience, not the real
// boundary.
//
// One reusable form (personFormHtml / readPersonForm) is used both for
// "Add people" and for editing an existing person inline.

const ADMIN_ROLES = [
  { value: "Principal", title: "Principal", desc: "Limited to the centers and grade levels you pick below." },
  { value: "Board Member", title: "Board Member", desc: "Everything except this Admin screen." },
  { value: "Admin", title: "Admin", desc: "Everything, including this Admin screen." },
];
const ADMIN_ROLE_ORDER = { Admin: 0, "Board Member": 1, Principal: 2 };

let adminCenterOptions = [];
let adminGradeBands = ["Pre-Primary", "Primary", "Secondary"];
let adminFormSeq = 0;
let adminAddFormCenterCount = -1;

function adminRoleClass(role) {
  return role === "Admin" ? "role-admin" : role === "Board Member" ? "role-board" : "role-principal";
}

function adminPrincipalIncomplete(c) {
  return c.role === "Principal" && ((!c.allCenters && c.centers.length === 0) || (!c.allGrades && c.grades.length === 0));
}

function adminScopeHtml(c) {
  if (c.role !== "Principal") return "All centers &middot; All grade levels";
  const centers = c.allCenters ? "All centers" : c.centers.length ? c.centers.map(escapeHtml).join(", ") : "No centers set";
  const grades = c.allGrades ? "All grade levels" : c.grades.length ? c.grades.map(escapeHtml).join(", ") : "No grade levels set";
  return `${centers} &middot; ${grades}`;
}

function personFormHtml(c, { withEmail = false } = {}) {
  const uid = "pf" + ++adminFormSeq;
  const centers = Array.isArray(c.centers) ? c.centers : [];
  const grades = Array.isArray(c.grades) ? c.grades : [];

  // Offer every known center, plus any this person already has that isn't
  // in the list (so a hand-typed name never silently disappears).
  const centerList = adminCenterOptions.slice();
  centers.forEach((n) => {
    if (centerList.indexOf(n) === -1) centerList.push(n);
  });

  const roleChoices = ADMIN_ROLES.map(
    (r) => `
      <label class="admin-role-choice">
        <input type="radio" name="role-${uid}" data-field="role" value="${escapeAttr(r.value)}" ${c.role === r.value ? "checked" : ""} />
        <span class="admin-role-choice-body"><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(r.desc)}</small></span>
      </label>`
  ).join("");

  const centerBoxes = centerList
    .map(
      (n) => `
      <label class="admin-chip"><input type="checkbox" data-field="center" value="${escapeAttr(n)}" ${centers.indexOf(n) > -1 ? "checked" : ""} /><span>${escapeHtml(n)}</span></label>`
    )
    .join("");

  const gradeBoxes = adminGradeBands
    .map(
      (g) => `
      <label class="admin-chip"><input type="checkbox" data-field="grade" value="${escapeAttr(g)}" ${grades.indexOf(g) > -1 ? "checked" : ""} /><span>${escapeHtml(g)}</span></label>`
    )
    .join("");

  const emailField = withEmail
    ? `<label class="admin-field">
        <span>Email(s)</span>
        <textarea data-field="emails" rows="2" placeholder="name@example.com&#10;Paste several (one per line, or separated by commas) to add them all with the settings below"></textarea>
      </label>`
    : "";

  return `
    <div class="admin-form" data-form>
      ${emailField}
      <label class="admin-field">
        <span>Name <em>(optional${withEmail ? ", used when adding one person" : ""})</em></span>
        <input type="text" data-field="name" value="${escapeAttr(c.name || "")}" />
      </label>
      <fieldset class="admin-fieldset">
        <legend>Role</legend>
        <div class="admin-role-choices">${roleChoices}</div>
      </fieldset>
      <div class="admin-scope" data-scope>
        <fieldset class="admin-fieldset">
          <legend>Centers</legend>
          <label class="admin-checkbox"><input type="checkbox" data-field="allCenters" ${c.allCenters ? "checked" : ""} /> All centers</label>
          <div class="admin-chip-grid" data-chips="center">${centerBoxes || '<span class="admin-empty">No centers found yet.</span>'}</div>
        </fieldset>
        <fieldset class="admin-fieldset">
          <legend>Grade levels</legend>
          <label class="admin-checkbox"><input type="checkbox" data-field="allGrades" ${c.allGrades ? "checked" : ""} /> All grade levels</label>
          <div class="admin-chip-grid" data-chips="grade">${gradeBoxes}</div>
        </fieldset>
      </div>
      <label class="admin-checkbox">
        <input type="checkbox" data-field="canEdit" ${c.canEdit ? "checked" : ""} />
        Can edit volunteer records <small>(only the volunteers they can see)</small>
      </label>
      <label class="admin-field">
        <span>Notes <em>(optional)</em></span>
        <input type="text" data-field="notes" value="${escapeAttr(c.notes || "")}" />
      </label>
    </div>`;
}

// Applies the form's current choices to what's shown: the Centers / Grade
// levels section only appears for a Principal, "All" greys out the
// individual boxes, and the chosen role card is highlighted.
function syncPersonForm(form) {
  const checkedRole = form.querySelector('input[data-field="role"]:checked');
  const role = checkedRole ? checkedRole.value : "Principal";
  form.querySelector("[data-scope]").classList.toggle("hidden", role !== "Principal");
  form.querySelectorAll(".admin-role-choice").forEach((label) => {
    label.classList.toggle("selected", label.querySelector("input").checked);
  });
  [["allCenters", "center"], ["allGrades", "grade"]].forEach(([allField, itemField]) => {
    const all = form.querySelector(`input[data-field="${allField}"]`).checked;
    const grid = form.querySelector(`[data-chips="${itemField}"]`);
    grid.classList.toggle("disabled", all);
    grid.querySelectorAll("input").forEach((cb) => {
      cb.disabled = all;
    });
  });
}

function readPersonForm(form) {
  const checked = (field) => Array.from(form.querySelectorAll(`input[data-field="${field}"]:checked`)).map((cb) => cb.value);
  const role = (form.querySelector('input[data-field="role"]:checked') || {}).value || "Principal";
  const emailsEl = form.querySelector('[data-field="emails"]');
  return {
    emails: emailsEl ? emailsEl.value : "",
    role,
    name: form.querySelector('input[data-field="name"]').value.trim(),
    allCenters: form.querySelector('input[data-field="allCenters"]').checked,
    centers: checked("center"),
    allGrades: form.querySelector('input[data-field="allGrades"]').checked,
    grades: checked("grade"),
    canEdit: form.querySelector('input[data-field="canEdit"]').checked,
    notes: form.querySelector('input[data-field="notes"]').value.trim(),
  };
}

function personCardHtml(c) {
  const isSelf = !!(auth.currentUser && auth.currentUser.email && c.email.toLowerCase() === auth.currentUser.email.toLowerCase());
  return `
    <div class="admin-person ${adminPrincipalIncomplete(c) ? "admin-person-warn" : ""}" data-email="${escapeAttr(c.email)}">
      <div class="admin-person-main">
        <div class="admin-person-who">
          <span class="admin-person-name">${escapeHtml(c.name || c.email)}${isSelf ? '<span class="admin-you-tag">you</span>' : ""}</span>
          ${c.name ? `<span class="admin-person-email">${escapeHtml(c.email)}</span>` : ""}
        </div>
        <span class="role-pill ${adminRoleClass(c.role)}">${escapeHtml(c.role)}</span>
        <div class="admin-person-scope">
          ${adminScopeHtml(c)}
          ${c.canEdit ? "<small>Can edit volunteer records</small>" : ""}
        </div>
        <button type="button" class="ghost-btn" data-action="toggle-edit">Edit</button>
      </div>
      <div class="admin-person-editor hidden" data-editor></div>
    </div>`;
}

function renderCoordinators() {
  const query = el.adminSearchInput.value.trim().toLowerCase();
  const roleFilter = el.adminRoleFilter.value;

  const sorted = coordinators.slice().sort((a, b) => {
    const byRole = (ADMIN_ROLE_ORDER[a.role] ?? 9) - (ADMIN_ROLE_ORDER[b.role] ?? 9);
    if (byRole !== 0) return byRole;
    return (a.name || a.email).toLowerCase().localeCompare((b.name || b.email).toLowerCase());
  });

  const shown = sorted.filter((c) => {
    if (roleFilter && c.role !== roleFilter) return false;
    if (!query) return true;
    const haystack = [c.name, c.email, ...(c.centers || []), ...(c.grades || [])].join(" ").toLowerCase();
    return haystack.indexOf(query) > -1;
  });

  const count = (role) => coordinators.filter((c) => c.role === role).length;
  el.adminPeopleCount.textContent =
    shown.length === coordinators.length
      ? `${coordinators.length} total · ${count("Admin")} Admin · ${count("Board Member")} Board · ${count("Principal")} Principal`
      : `${shown.length} of ${coordinators.length}`;

  el.adminPeopleList.innerHTML = shown.length
    ? shown.map(personCardHtml).join("")
    : '<p class="admin-empty">No one matches that search.</p>';
}

// The "Add people" form is rendered once (and again only if the list of
// centers has changed AND nothing has been typed yet), so refreshing the
// list never wipes out an email someone is halfway through typing.
function renderAddForm({ force = false } = {}) {
  const existing = el.adminAddForm.querySelector('[data-field="emails"]');
  const typed = existing && existing.value.trim();
  if (!force && adminAddFormCenterCount === adminCenterOptions.length && el.adminAddForm.firstChild) return;
  if (!force && typed) return;
  el.adminAddForm.innerHTML = personFormHtml(
    { role: "Principal", allCenters: false, centers: [], allGrades: true, grades: [], canEdit: false },
    { withEmail: true }
  );
  adminAddFormCenterCount = adminCenterOptions.length;
  syncPersonForm(el.adminAddForm.querySelector("[data-form]"));
}

function adminCacheKeyFor(user) {
  return "sw-re-admin-cache-v2-" + user.uid;
}

function applyAdminData(data) {
  coordinators = Array.isArray(data.coordinators) ? data.coordinators : [];
  adminCenterOptions = Array.isArray(data.centerOptions) ? data.centerOptions : [];
  if (Array.isArray(data.gradeBands) && data.gradeBands.length) adminGradeBands = data.gradeBands;
  if (data.me && (data.me.name || data.me.email)) {
    el.adminSignedInAs.textContent = data.me.name || data.me.email;
  }
  renderAddForm();
  renderCoordinators();
  el.adminStateMessage.classList.add("hidden");
  el.adminContent.classList.remove("hidden");
}

// Same stale-while-revalidate pattern as the other modules: paint
// instantly from a local cache (if any) so this screen doesn't sit on a
// blank "Loading…" for a repeat visit, then always fetch live in the
// background and re-render when it arrives.
async function loadCoordinators({ forceFresh = false } = {}) {
  const user = auth.currentUser;
  if (!user) return;

  const cacheKey = adminCacheKeyFor(user);
  let paintedFromCache = false;
  if (!forceFresh) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        applyAdminData(JSON.parse(cached));
        paintedFromCache = true;
      }
    } catch (e) {
      /* ignore corrupt cache */
    }
  }

  if (!paintedFromCache) {
    el.adminStateMessage.classList.remove("hidden");
    el.adminStateMessage.textContent = "Loading…";
    el.adminContent.classList.add("hidden");
  }

  el.adminRefreshBtn.classList.add("spinning");
  try {
    const idToken = await user.getIdToken();
    const params = new URLSearchParams({ idToken, resource: "admin" });
    if (forceFresh) params.set("nocache", "1");
    const url = APPS_SCRIPT_URL + (APPS_SCRIPT_URL.includes("?") ? "&" : "?") + params.toString();

    const data = await fetchJson(url);
    if (data && data.error) throw new Error(friendlyAuthError(data.error));

    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) {
      /* storage full/unavailable — not fatal */
    }
    applyAdminData(data);
  } catch (err) {
    if (!paintedFromCache) {
      el.adminStateMessage.classList.remove("hidden");
      el.adminStateMessage.textContent = "Couldn't load: " + err.message;
    }
  } finally {
    el.adminRefreshBtn.classList.remove("spinning");
  }
}

function adminClearCache() {
  const user = auth.currentUser;
  if (!user) return;
  try {
    localStorage.removeItem(adminCacheKeyFor(user));
  } catch (e) {
    /* ignore */
  }
}

// One save call per person. The server re-validates and whitelists
// everything (see upsertCoordinator in Code.gs) — this just gathers what's
// on screen and sends it.
async function postCoordinator(coordinator) {
  const user = auth.currentUser;
  if (!user) throw new Error("You're signed out — sign in again.");
  const idToken = await user.getIdToken();
  const data = await fetchJson(APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ idToken, resource: "coordinator", coordinator }),
  });
  if (data && data.error) throw new Error(friendlyAuthError(data.error));
  if (!data || !data.ok) throw new Error("Server error — try again.");
  return data.coordinator;
}

function upsertLocalCoordinator(saved) {
  const idx = coordinators.findIndex((c) => c.email.toLowerCase() === saved.email.toLowerCase());
  if (idx > -1) coordinators[idx] = saved;
  else coordinators.push(saved);
}

// --- Add people (one or many) ---
async function addCoordinators() {
  el.adminAddError.classList.add("hidden");
  el.adminAddMsg.classList.add("hidden");

  const form = el.adminAddForm.querySelector("[data-form]");
  const values = readPersonForm(form);
  const emails = Array.from(new Set(values.emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean)));
  const invalid = emails.filter((e) => e.indexOf("@") === -1);
  if (emails.length === 0 || invalid.length > 0) {
    el.adminAddError.textContent = invalid.length
      ? "These don't look like email addresses: " + invalid.join(", ")
      : "Enter at least one email address.";
    el.adminAddError.classList.remove("hidden");
    return;
  }
  if (values.role === "Principal") {
    if (!values.allCenters && values.centers.length === 0) {
      el.adminAddError.textContent = "Pick at least one center (or All centers) for a Principal.";
      el.adminAddError.classList.remove("hidden");
      return;
    }
    if (!values.allGrades && values.grades.length === 0) {
      el.adminAddError.textContent = "Pick at least one grade level (or All grade levels) for a Principal.";
      el.adminAddError.classList.remove("hidden");
      return;
    }
  }

  el.adminAddBtn.disabled = true;
  const added = [];
  const failed = [];
  for (let i = 0; i < emails.length; i++) {
    el.adminAddBtn.textContent = emails.length > 1 ? `Adding ${i + 1} of ${emails.length}…` : "Adding…";
    try {
      const saved = await postCoordinator({
        email: emails[i],
        name: emails.length === 1 ? values.name : "",
        role: values.role,
        allCenters: values.allCenters,
        centers: values.centers,
        allGrades: values.allGrades,
        grades: values.grades,
        canEdit: values.canEdit,
        notes: values.notes,
      });
      upsertLocalCoordinator(saved);
      added.push(emails[i]);
    } catch (err) {
      failed.push(`${emails[i]} (${err.message})`);
    }
  }

  adminClearCache();
  renderCoordinators();
  el.adminAddBtn.disabled = false;
  el.adminAddBtn.textContent = "Add";

  if (added.length) {
    el.adminAddMsg.textContent = added.length === 1 ? `Added ${added[0]}.` : `Added ${added.length} people.`;
    el.adminAddMsg.classList.remove("hidden");
    // Clear who was just added, but keep the role/center/grade choices so
    // the next person at the same center is one paste away.
    form.querySelector('[data-field="emails"]').value = failed.length ? failed.map((f) => f.split(" (")[0]).join("\n") : "";
    form.querySelector('input[data-field="name"]').value = "";
    form.querySelector('input[data-field="notes"]').value = "";
  }
  if (failed.length) {
    el.adminAddError.textContent = "Couldn't add: " + failed.join("; ");
    el.adminAddError.classList.remove("hidden");
  }
}

// --- Edit / remove an existing person ---
function openEditor(card) {
  const email = card.dataset.email;
  const person = coordinators.find((c) => c.email.toLowerCase() === email.toLowerCase());
  if (!person) return;
  const editor = card.querySelector("[data-editor]");
  editor.innerHTML = `
    ${personFormHtml(person)}
    <div class="admin-form-actions" style="margin-top: 16px;">
      <button type="button" class="export-btn" data-action="save">Save changes</button>
      <button type="button" class="ghost-btn" data-action="cancel">Cancel</button>
      <button type="button" class="ghost-btn admin-remove-btn" data-action="remove">Remove access</button>
    </div>
    <p class="detail-save-error hidden" data-editor-error></p>`;
  editor.classList.remove("hidden");
  syncPersonForm(editor.querySelector("[data-form]"));
  card.querySelector('[data-action="toggle-edit"]').textContent = "Close";
}

function closeEditor(card) {
  const editor = card.querySelector("[data-editor]");
  editor.classList.add("hidden");
  editor.innerHTML = "";
  card.querySelector('[data-action="toggle-edit"]').textContent = "Edit";
}

async function saveCoordinatorCard(card) {
  const editor = card.querySelector("[data-editor]");
  const errorEl = editor.querySelector("[data-editor-error]");
  const buttons = editor.querySelectorAll("button");
  errorEl.classList.add("hidden");
  const values = readPersonForm(editor.querySelector("[data-form]"));
  buttons.forEach((b) => (b.disabled = true));
  try {
    const saved = await postCoordinator({
      email: card.dataset.email,
      name: values.name,
      role: values.role,
      allCenters: values.allCenters,
      centers: values.centers,
      allGrades: values.allGrades,
      grades: values.grades,
      canEdit: values.canEdit,
      notes: values.notes,
    });
    upsertLocalCoordinator(saved);
    adminClearCache();
    renderCoordinators();

    // If the admin just edited their OWN row, their access may have
    // changed — refresh the hub's permission summary too so the tiles
    // reflect it without a full sign-out/in.
    const me = auth.currentUser;
    if (me && me.email && saved.email.toLowerCase() === me.email.toLowerCase()) loadMe();
  } catch (err) {
    errorEl.textContent = "Couldn't save: " + err.message;
    errorEl.classList.remove("hidden");
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function removeCoordinatorCard(card) {
  const email = card.dataset.email;
  if (!confirm(`Remove access for ${email}? They'll no longer be able to see anything.`)) return;

  const editor = card.querySelector("[data-editor]");
  const errorEl = editor.querySelector("[data-editor-error]");
  const buttons = editor.querySelectorAll("button");
  errorEl.classList.add("hidden");
  buttons.forEach((b) => (b.disabled = true));
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("You're signed out — sign in again.");
    const idToken = await user.getIdToken();
    const data = await fetchJson(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ idToken, resource: "coordinator", action: "remove", targetEmail: email }),
    });
    if (data && data.error) throw new Error(friendlyAuthError(data.error));
    if (!data || !data.ok) throw new Error("Server error — try again.");

    coordinators = coordinators.filter((c) => c.email.toLowerCase() !== email.toLowerCase());
    adminClearCache();
    renderCoordinators();
  } catch (err) {
    errorEl.textContent = "Couldn't remove: " + err.message;
    errorEl.classList.remove("hidden");
    buttons.forEach((b) => (b.disabled = false));
  }
}

el.adminPeopleList.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const card = btn.closest(".admin-person");
  if (!card) return;
  const action = btn.dataset.action;
  if (action === "toggle-edit") {
    if (card.querySelector("[data-editor]").classList.contains("hidden")) openEditor(card);
    else closeEditor(card);
  } else if (action === "cancel") closeEditor(card);
  else if (action === "save") saveCoordinatorCard(card);
  else if (action === "remove") removeCoordinatorCard(card);
});

// Any change inside a form (role, All centers, All grade levels) re-applies
// what's shown — one listener covers the add form and every open editor.
el.adminRoot.addEventListener("change", (e) => {
  const form = e.target.closest("[data-form]");
  if (form) syncPersonForm(form);
});

el.adminSearchInput.addEventListener("input", renderCoordinators);
el.adminRoleFilter.addEventListener("change", renderCoordinators);
el.adminAddBtn.addEventListener("click", addCoordinators);

// ===== Event wiring =====

el.searchInput.addEventListener("input", () => {
  filters.search = el.searchInput.value;
  applyFiltersAndRender();
});

el.clearFiltersBtn.addEventListener("click", () => {
  filters.search = "";
  filters.statuses.clear();
  filters.servingPrograms.clear();
  filters.centers.clear();
  filters.positions.clear();
  filters.grades.clear();
  el.searchInput.value = "";
  Object.values(msControllers).forEach((c) => c.updateBadge());
  applyFiltersAndRender();
});

el.pageSizeSelect.addEventListener("change", () => {
  pageSize = parseInt(el.pageSizeSelect.value, 10);
  currentPage = 1;
  render();
});

document.querySelectorAll("#volTable thead th").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.key;
    if (!key) return;
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = "asc";
    }
    render();
  });
});

el.closeDetail.addEventListener("click", closeDetail);
el.overlay.addEventListener("click", (e) => {
  if (e.target === el.overlay) closeDetail();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetail();
  // Arrow keys step through volunteers, unless the person is typing in a field.
  if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !el.overlay.classList.contains("hidden")) {
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    e.preventDefault();
    stepDetail(e.key === "ArrowRight" ? 1 : -1);
  }
});
el.detailPrevBtn.addEventListener("click", () => stepDetail(-1));
el.detailNextBtn.addEventListener("click", () => stepDetail(1));

el.editDetailBtn.addEventListener("click", () => {
  if (!canEdit) return; // defense in depth — button should already be hidden
  detailEditing = true;
  renderDetailEdit();
});
el.cancelEditBtn.addEventListener("click", () => {
  detailEditing = false;
  renderDetailView();
});
el.saveEditBtn.addEventListener("click", saveDetailEdit);
el.refreshBtn.addEventListener("click", () => loadVolunteers({ forceFresh: true }));
el.exportBtn.addEventListener("click", exportToExcel);

// initialize page size selector to match default
el.pageSizeSelect.value = String(pageSize);

// ===== Firebase auth wiring =====
// Real sign-in, not a UI-only gate: nothing under #dashboardRoot fetches
// data until Firebase confirms a signed-in user, and the data itself is
// filtered server-side in Code.gs based on who that user is — so even
// someone opening the browser console and calling loadVolunteers()
// directly only ever gets back what their account is allowed to see.

function showGateError(message) {
  el.gateInfo.classList.add("hidden");
  el.gateError.textContent = message;
  el.gateError.classList.remove("hidden");
  el.gatePassword.value = "";
  el.gatePassword.focus();
  el.gateForm.classList.remove("shake");
  void el.gateForm.offsetWidth; // restart the shake animation on repeat attempts
  el.gateForm.classList.add("shake");
}

el.gateForm.addEventListener("submit", (e) => {
  e.preventDefault();
  el.gateError.classList.add("hidden");
  el.gateInfo.classList.add("hidden");
  const email = el.gateEmail.value.trim();
  const password = el.gatePassword.value;

  auth.signInWithEmailAndPassword(email, password).catch((err) => {
    showGateError("Couldn't sign in — check your email and password.");
  });
  // On success, onAuthStateChanged below handles showing the dashboard.
});

// Google sign-in. Enabling the provider in Firebase is only half of it —
// this button is what starts the flow. Signing in with Google proves who
// someone is; what they can see is still decided by their row in the
// Coordinators sheet (an unlisted Google account gets "not provisioned").
const googleSignInBtn = document.getElementById("googleSignInBtn");
if (googleSignInBtn) {
  googleSignInBtn.addEventListener("click", () => {
    el.gateError.classList.add("hidden");
    el.gateInfo.classList.add("hidden");
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.signInWithPopup(provider).catch((err) => {
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return;
      if (err.code === "auth/popup-blocked") {
        auth.signInWithRedirect(provider);
        return;
      }
      el.gateError.textContent = err.code === "auth/unauthorized-domain"
        ? "This site's address isn't authorized for Google sign-in yet. Ask the admin to add it in Firebase."
        : "Couldn't sign in with Google — please try again.";
      el.gateError.classList.remove("hidden");
    });
  });
}

// Self-service password reset — lets a coordinator recover access on
// their own after the one-time account setup in the Firebase console
// (see README.md), instead of ever having to ask for a new password.
// Firebase sends and hosts the entire reset flow itself; nothing here
// talks to Code.gs.
el.forgotPasswordBtn.addEventListener("click", () => {
  el.gateError.classList.add("hidden");
  el.gateInfo.classList.add("hidden");
  const email = el.gateEmail.value.trim();

  if (!email) {
    el.gateError.textContent = 'Enter your email above, then click "Forgot password?"';
    el.gateError.classList.remove("hidden");
    el.gateEmail.focus();
    return;
  }

  const showSent = () => {
    el.gateInfo.textContent = `If an account exists for ${email}, a password reset link has been sent.`;
    el.gateInfo.classList.remove("hidden");
  };

  auth.sendPasswordResetEmail(email).then(showSent).catch((err) => {
    // Deliberately show the same "if an account exists…" message for a
    // not-found email as for a real send — confirming or denying which
    // emails have accounts is exactly what this screen shouldn't leak
    // to anyone probing it.
    if (err.code === "auth/user-not-found") {
      showSent();
    } else {
      el.gateError.textContent = "Couldn't send a reset email right now — try again in a moment.";
      el.gateError.classList.remove("hidden");
    }
  });
});

if (el.lockBtn) {
  el.lockBtn.addEventListener("click", () => auth.signOut());
}
if (el.hubLockBtn) {
  el.hubLockBtn.addEventListener("click", () => auth.signOut());
}

// ===== Hub <-> module navigation =====
// Both screens live under the same signed-in session — switching between
// them is just a visibility toggle, no re-auth or page reload involved.

function showHub() {
  el.dashboardRoot.classList.add("hidden");
  el.programsRoot.classList.add("hidden");
  el.attendanceRoot.classList.add("hidden");
  el.adminRoot.classList.add("hidden");
  el.pmpRoot.classList.add("hidden");
  closeAttendanceTrend();
  closeYoy();
  el.hubRoot.classList.remove("hidden");
}

function enterDashboard() {
  el.hubRoot.classList.add("hidden");
  el.dashboardRoot.classList.remove("hidden");
  loadVolunteers().then(() => {
    const hashId = window.location.hash.replace("#", "");
    if (hashId) openDetail(hashId);
  });
}

function enterPrograms() {
  el.hubRoot.classList.add("hidden");
  el.programsRoot.classList.remove("hidden");
  // Reset any leftover search text from a previous visit so the board
  // isn't confused by a filtered view they didn't just type themselves.
  programSearchQuery = "";
  if (el.programsSearchInput) el.programsSearchInput.value = "";
  loadPrograms();
}

function enterAttendance() {
  el.hubRoot.classList.add("hidden");
  el.attendanceRoot.classList.remove("hidden");
  // Reverted from always forcing a live, cache-free fetch on every open
  // (nocache=1) back to the normal stale-while-revalidate pattern used
  // everywhere else. That "always force fresh" change traded away the
  // server cache's real benefit: every single open paid the full cost of
  // a live Apps Script run with no fast/safe fallback if it happened to
  // be slow, rate-limited, or transiently erroring — which is exactly
  // what showed up as "loads forever" / "JSON error" / stuck on "Loading
  // attendance…". The server-side cache TTL was shortened to 2 minutes
  // (see ATTENDANCE_CACHE_SECONDS in Code.gs) so this doesn't meaningfully
  // reintroduce staleness — attendance data only changes when someone
  // hand-pastes a new report, at most weekly. The Refresh button still
  // forces a true live fetch for anyone who wants to check immediately.
  loadAttendance();
}

// PMP Service Maintenance is gated like Volunteer/Programs/Attendance
// (applyModuleVisibility shows/hides the hub tile based on meModules), but
// it's a static info page — nothing to fetch from the sheet, so there's no
// loadX() call here the way every other enter*() function has one.
function enterPmp() {
  el.hubRoot.classList.add("hidden");
  el.pmpRoot.classList.remove("hidden");
}

function enterAdmin() {
  el.hubRoot.classList.add("hidden");
  el.adminRoot.classList.remove("hidden");
  loadCoordinators();
}

if (el.moduleVolunteerDashboard) {
  el.moduleVolunteerDashboard.addEventListener("click", enterDashboard);
}
if (el.backToHubBtn) {
  el.backToHubBtn.addEventListener("click", showHub);
}
if (el.moduleProgramsBtn) {
  el.moduleProgramsBtn.addEventListener("click", enterPrograms);
}
if (el.backToHubBtnPrograms) {
  el.backToHubBtnPrograms.addEventListener("click", showHub);
}
if (el.programsRefreshBtn) {
  el.programsRefreshBtn.addEventListener("click", () => loadPrograms({ forceFresh: true }));
}
if (el.programsLockBtn) {
  el.programsLockBtn.addEventListener("click", () => auth.signOut());
}
if (el.moduleAttendanceBtn) {
  el.moduleAttendanceBtn.addEventListener("click", enterAttendance);
}
if (el.backToHubBtnAttendance) {
  el.backToHubBtnAttendance.addEventListener("click", showHub);
}
if (el.attendanceRefreshBtn) {
  el.attendanceRefreshBtn.addEventListener("click", () => loadAttendance({ forceFresh: true }));
}
if (el.attendanceLockBtn) {
  el.attendanceLockBtn.addEventListener("click", () => auth.signOut());
}
// Tap-to-see-trend on the attendance cards. Delegated onto each category
// grid (not onto individual cards) since renderAttendance() replaces the
// grid's innerHTML wholesale on every load/refresh — a listener on the
// cards themselves would be destroyed and need re-attaching every time;
// one delegated listener on the stable grid container survives any number
// of re-renders.
ATTENDANCE_CATEGORIES.forEach(({ grid }) => {
  const gridEl = document.getElementById(grid);
  if (!gridEl) return;
  gridEl.addEventListener("click", (e) => {
    const card = e.target.closest(".attendance-card");
    if (card) openAttendanceTrend(card.dataset.key);
  });
  gridEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".attendance-card");
    if (!card) return;
    e.preventDefault();
    openAttendanceTrend(card.dataset.key);
  });
});
if (el.yoyBtn) el.yoyBtn.addEventListener("click", openYoy);
if (el.closeYoy) el.closeYoy.addEventListener("click", closeYoy);
if (el.yoyOverlay) {
  el.yoyOverlay.addEventListener("click", (e) => {
    if (e.target === el.yoyOverlay) closeYoy();
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && el.yoyOverlay && !el.yoyOverlay.classList.contains("hidden")) closeYoy();
});
if (el.closeAttendanceTrend) {
  el.closeAttendanceTrend.addEventListener("click", closeAttendanceTrend);
}
if (el.attendanceTrendOverlay) {
  el.attendanceTrendOverlay.addEventListener("click", (e) => {
    if (e.target === el.attendanceTrendOverlay) closeAttendanceTrend();
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && el.attendanceTrendOverlay && !el.attendanceTrendOverlay.classList.contains("hidden")) {
    closeAttendanceTrend();
  closeYoy();
  }
});
if (el.moduleAdminBtn) {
  el.moduleAdminBtn.addEventListener("click", enterAdmin);
}
if (el.modulePmpBtn) {
  el.modulePmpBtn.addEventListener("click", enterPmp);
}
if (el.backToHubBtnPmp) {
  el.backToHubBtnPmp.addEventListener("click", showHub);
}
if (el.backToHubBtnAdmin) {
  el.backToHubBtnAdmin.addEventListener("click", showHub);
}
if (el.adminRefreshBtn) {
  el.adminRefreshBtn.addEventListener("click", () => loadCoordinators({ forceFresh: true }));
}
if (el.adminLockBtn) {
  el.adminLockBtn.addEventListener("click", () => auth.signOut());
}

// Firebase persists the session itself (localStorage under the hood), so
// this fires immediately on page load with the already-signed-in user if
// there is one — no separate "was this unlocked before" check needed.
auth.onAuthStateChanged((user) => {
  if (user) {
    el.passwordGate.classList.add("hidden");
    el.signedInAs.textContent = user.email || "";
    el.hubSignedInAs.textContent = user.email || "";
    el.programsSignedInAs.textContent = user.email || "";
    el.attendanceSignedInAs.textContent = user.email || "";
    el.adminSignedInAs.textContent = user.email || "";
    el.gatePassword.value = "";
    showHub();
    loadMe();
  } else {
    volunteers = [];
    programs = [];
    attendance = [];
    coordinators = [];
    meModules = [];
    meIsAdmin = false;
    // Clear any leftover #volunteerID fragment from a previous session so
    // it can't linger into the next sign-in and skip the hub.
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
    el.dashboardRoot.classList.add("hidden");
    el.programsRoot.classList.add("hidden");
    el.attendanceRoot.classList.add("hidden");
    el.adminRoot.classList.add("hidden");
    el.pmpRoot.classList.add("hidden");
    closeAttendanceTrend();
  closeYoy();
    el.hubRoot.classList.add("hidden");
    el.passwordGate.classList.remove("hidden");
    el.gateError.classList.add("hidden");
    el.gateEmail.focus();
  }
});
