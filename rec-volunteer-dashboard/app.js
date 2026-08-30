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

// filter state
const filters = {
  search: "",
  centers: new Set(),
  positions: new Set(),
  grades: new Set(),
  statuses: new Set(),
};

// sort + pagination state
let sortKey = "fullName";
let sortDir = "asc";
let pageSize = 250;
let currentPage = 1;

const el = {
  stateMessage: document.getElementById("stateMessage"),
  statsToggleBtn: document.getElementById("statsToggleBtn"),
  statsGrid: document.getElementById("statsGrid"),
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
  closeDetail: document.getElementById("closeDetail"),
  editDetailBtn: document.getElementById("editDetailBtn"),
  detailPhoto: document.getElementById("detailPhoto"),
  detailHeaderText: document.getElementById("detailHeaderText"),
  detailFields: document.getElementById("detailFields"),
  detailSaveError: document.getElementById("detailSaveError"),
  detailEditActions: document.getElementById("detailEditActions"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  saveEditBtn: document.getElementById("saveEditBtn"),
  statTotal: document.getElementById("statTotal"),
  statAgeBreakdown: document.getElementById("statAgeBreakdown"),
  statCountryBreakdown: document.getElementById("statCountryBreakdown"),
  statGenderBreakdown: document.getElementById("statGenderBreakdown"),
  statEducationBreakdown: document.getElementById("statEducationBreakdown"),
  statOccupationBreakdown: document.getElementById("statOccupationBreakdown"),
  statStudiesUSABreakdown: document.getElementById("statStudiesUSABreakdown"),
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

// ===== Stats tiles =====
// Always computed off the full roster (not the current filters) — these
// are meant as an at-a-glance overview of everyone, not the filtered view.

// Renders a "top N with bars" breakdown into any of the stat-breakdown
// containers. Shared by Country of Birth and Gender Split so both stay
// visually and behaviorally consistent.
// `order`: for breakdowns with a natural sequence (age brackets) rather
// than "most common first" (country, occupation, etc.) — pass the exact
// category order to use instead of sorting by count. Every category in
// `order` is shown even at a count of 0, so a bracket with nobody in it
// still reads as "zero" rather than silently vanishing.
function renderBreakdown(container, counts, { maxItems = 6, unitLabel = "", order = null } = {}) {
  let top, rest;
  if (order) {
    top = order.map((key) => [key, counts[key] || 0]);
    rest = [];
  } else {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    top = sorted.slice(0, maxItems);
    rest = sorted.slice(maxItems);
  }
  const maxCount = top.reduce((m, [, c]) => Math.max(m, c), 0);

  if (top.length === 0 || maxCount === 0) {
    container.innerHTML = '<p class="breakdown-empty">No data yet</p>';
    return;
  }

  container.innerHTML =
    top
      .map(([name, count]) => {
        const pct = maxCount ? Math.round((count / maxCount) * 100) : 0;
        return `<div class="breakdown-row">
          <div class="breakdown-row-top">
            <span class="breakdown-label">${escapeHtml(name)}</span>
            <span class="breakdown-count">${count}</span>
          </div>
          <div class="breakdown-bar-track"><div class="breakdown-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
      })
      .join("") +
    (rest.length ? `<p class="breakdown-more">+${rest.length} more${unitLabel ? " " + unitLabel + (rest.length === 1 ? "" : "s") : ""}</p>` : "");
}

function countBy(list, getValue) {
  const counts = {};
  list.forEach((v) => {
    const raw = getValue(v);
    const key = raw && String(raw).trim() ? String(raw).trim() : "Not specified";
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

// The "Were your studies completed in the USA?" question's full answer
// text (e.g. "Partially (some studies in USA, some abroad)") is too long
// for a tile — collapse it down to just Yes / No / Partially.
function normalizeStudiesInUSA(value) {
  const v = (value || "").trim().toLowerCase();
  if (!v) return "";
  if (v.startsWith("yes")) return "Yes";
  if (v.startsWith("no")) return "No";
  if (v.startsWith("partially")) return "Partially";
  return value; // unexpected wording — show as-is rather than hide it
}

// Buckets a computed age into a fixed range for the Age Breakdown tile.
// 40 itself lands in "36 - 40" (not "40+") so the ranges don't overlap.
const AGE_BUCKET_ORDER = ["16 - 19", "20 - 25", "26 - 30", "31 - 35", "36 - 40", "40+"];
function ageBucket(age) {
  if (age == null) return "Not specified";
  if (age < 16) return "Under 16";
  if (age <= 19) return "16 - 19";
  if (age <= 25) return "20 - 25";
  if (age <= 30) return "26 - 30";
  if (age <= 35) return "31 - 35";
  if (age <= 40) return "36 - 40";
  return "40+";
}

function computeStats() {
  const total = volunteers.length;
  el.statTotal.textContent = total.toLocaleString();

  // The core 6 brackets always show (even at 0); the two edge-case
  // buckets only appear if someone actually falls in them, so they don't
  // clutter the tile in the common case where every volunteer is an
  // adult with a valid DOB on file.
  const ageCounts = countBy(volunteers, (v) => ageBucket(v.age));
  const ageOrder = [];
  if (ageCounts["Under 16"]) ageOrder.push("Under 16");
  ageOrder.push(...AGE_BUCKET_ORDER);
  if (ageCounts["Not specified"]) ageOrder.push("Not specified");
  renderBreakdown(el.statAgeBreakdown, ageCounts, { order: ageOrder });

  renderBreakdown(el.statCountryBreakdown, countBy(volunteers, (v) => v.countryOfBirth), {
    maxItems: 5,
    unitLabel: "country",
  });

  renderBreakdown(el.statGenderBreakdown, countBy(volunteers, (v) => v.gender), {
    maxItems: 5,
    unitLabel: "",
  });

  renderBreakdown(el.statEducationBreakdown, countBy(volunteers, (v) => v.education), {
    maxItems: 5,
    unitLabel: "level",
  });

  renderBreakdown(el.statOccupationBreakdown, countBy(volunteers, (v) => v.occupation), {
    maxItems: 5,
    unitLabel: "type",
  });

  renderBreakdown(el.statStudiesUSABreakdown, countBy(volunteers, (v) => normalizeStudiesInUSA(v.studiesInUSA)), {
    maxItems: 5,
    unitLabel: "",
  });
}

// ===== Load data (stale-while-revalidate) =====

// Friendly text for the error codes Code.gs can return once server-side
// auth is wired up (see README.md's Firebase section for the full list).
function friendlyAuthError(code) {
  const messages = {
    not_provisioned:
      "Your account isn't set up with dashboard access yet. Ask your Southwest RE Centers admin to add you to the Coordinators sheet.",
    invalid_token: "Your sign-in session expired — sign out and back in.",
    missing_token: "Your sign-in session expired — sign out and back in.",
    verification_failed: "Couldn't verify your sign-in — try refreshing the page.",
    missing_id: "Something went wrong preparing that edit — try again.",
    missing_updates: "Something went wrong preparing that edit — try again.",
    not_found: "Couldn't find that volunteer — try refreshing the page.",
    forbidden: "You don't have permission to edit this volunteer.",
    save_failed: "Couldn't save your changes — try again.",
  };
  return messages[code] || code;
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
        computeStats();
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

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
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
    computeStats();
    if (currentPage === 1 || !paintedFromCache) currentPage = 1;
    render();
    el.stateMessage.classList.add("hidden");
    el.volTable.classList.remove("hidden");
  } catch (err) {
    if (!paintedFromCache) {
      el.stateMessage.classList.remove("hidden");
      el.stateMessage.textContent = "Couldn't load volunteers: " + err.message;
    }
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
const filterOptionsData = { centers: [], positions: [], grades: [] };

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

  if (!filterListenersBound) {
    filterListenersBound = true;
    msControllers.status = setupMultiSelect({
      btnId: "statusMSBtn", panelId: "statusMSPanel", badgeId: "statusMSBadge",
      getOptions: () => ["Active", "Inactive"], selectedSet: filters.statuses, onChange: applyFiltersAndRender,
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
  { key: "contact", label: "Contact" },
  { key: "email", label: "Email" },
  { key: "dob", label: "Date of Birth" },
  { key: "gender", label: "Gender" },
  { key: "gradeLevel", label: "Grade Level Served" },
  { key: "jamatkhana", label: "Jamatkhana" },
  { key: "education", label: "Education Level" },
  { key: "studiesInUSA", label: "Studies Completed in USA" },
  { key: "occupation", label: "Occupation" },
  { key: "countryOfBirth", label: "Country of Birth" },
  { key: "tshirtSize", label: "T-Shirt Size" },
  { key: "sevaOutside", label: "Seva Outside RE System", multiline: true },
  { key: "sevaHistory", label: "Seva History Within RE", multiline: true },
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

  const fields = [
    ["Age", v.age != null ? v.age : ""],
    ...DETAIL_FIELDS.map((f) => [f.label, v[f.key]]),
    ["Submitted", v.submittedAt],
  ];

  el.detailFields.innerHTML = fields
    .filter(([, val]) => val !== "" && val != null)
    .map(([label, val]) => `<dt>${escapeHtml(label)}</dt><dd>${label === "Status" ? statusBadgeHtml(val) : escapeHtml(val)}</dd>`)
    .join("");

  // Only coordinators with Edit Access = YES in the Coordinators sheet
  // ever see the pencil — this is a convenience for them, not the actual
  // security boundary, which is enforced server-side in doPost.
  el.editDetailBtn.classList.toggle("hidden", !canEdit);
  el.detailEditActions.classList.add("hidden");
  el.detailSaveError.classList.add("hidden");
}

function renderDetailEdit() {
  const v = volunteers.find((x) => x.id === currentDetailId);
  if (!v) return;

  el.detailHeaderText.innerHTML = HEADER_EDIT_FIELDS.map(
    (f) => `<label class="edit-field"><span>${escapeHtml(f.label)}</span><input id="edit_${f.key}" type="text" value="${escapeAttr(v[f.key] || "")}" /></label>`
  ).join("");

  el.detailFields.innerHTML = DETAIL_FIELDS.map((f) => {
    let input;
    if (f.type === "select") {
      const current = v[f.key] || f.options[0];
      input = `<select id="edit_${f.key}">${f.options
        .map((o) => `<option value="${escapeAttr(o)}"${o === current ? " selected" : ""}>${escapeHtml(o)}</option>`)
        .join("")}</select>`;
    } else if (f.multiline) {
      input = `<textarea id="edit_${f.key}" rows="3">${escapeHtml(v[f.key] || "")}</textarea>`;
    } else {
      input = `<input id="edit_${f.key}" type="text" value="${escapeAttr(v[f.key] || "")}" />`;
    }
    return `<label class="edit-field">${escapeHtml(f.label)}${input}</label>`;
  }).join("");

  el.editDetailBtn.classList.add("hidden");
  el.detailEditActions.classList.remove("hidden");
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

    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      // Deliberately no Content-Type header: setting one (e.g.
      // application/json) makes the browser send a CORS preflight
      // (OPTIONS) request first, which Apps Script web apps can't
      // handle. Omitting it defaults to text/plain — a "simple
      // request" that skips preflight — while Code.gs still
      // JSON.parse()s the raw body regardless of the declared type.
      body: JSON.stringify({ idToken, id, updates }),
    });
    const data = await res.json();
    if (data && data.error) throw new Error(friendlyAuthError(data.error));
    if (!res.ok || !data || !data.ok) throw new Error("Server error — try again.");

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
    computeStats();
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

// ===== Event wiring =====

// Collapsible analysis section — collapsing it lets the table sit higher
// on the page. Remembered per-browser so it stays how you left it.
const STATS_COLLAPSED_KEY = "sw-re-stats-collapsed";
function setStatsCollapsed(collapsed) {
  el.statsGrid.classList.toggle("hidden", collapsed);
  el.statsToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  try {
    localStorage.setItem(STATS_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch (e) {
    /* ignore */
  }
}
el.statsToggleBtn.addEventListener("click", () => {
  setStatsCollapsed(!el.statsGrid.classList.contains("hidden"));
});
try {
  setStatsCollapsed(localStorage.getItem(STATS_COLLAPSED_KEY) === "1");
} catch (e) {
  /* ignore */
}

el.searchInput.addEventListener("input", () => {
  filters.search = el.searchInput.value;
  applyFiltersAndRender();
});

el.clearFiltersBtn.addEventListener("click", () => {
  filters.search = "";
  filters.statuses.clear();
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
});

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

if (el.moduleVolunteerDashboard) {
  el.moduleVolunteerDashboard.addEventListener("click", enterDashboard);
}
if (el.backToHubBtn) {
  el.backToHubBtn.addEventListener("click", showHub);
}

// Firebase persists the session itself (localStorage under the hood), so
// this fires immediately on page load with the already-signed-in user if
// there is one — no separate "was this unlocked before" check needed.
auth.onAuthStateChanged((user) => {
  if (user) {
    el.passwordGate.classList.add("hidden");
    el.signedInAs.textContent = user.email || "";
    el.hubSignedInAs.textContent = user.email || "";
    el.gatePassword.value = "";
    showHub();
  } else {
    volunteers = [];
    // Clear any leftover #volunteerID fragment from a previous session so
    // it can't linger into the next sign-in and skip the hub.
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
    el.dashboardRoot.classList.add("hidden");
    el.hubRoot.classList.add("hidden");
    el.passwordGate.classList.remove("hidden");
    el.gateError.classList.add("hidden");
    el.gateEmail.focus();
  }
});
