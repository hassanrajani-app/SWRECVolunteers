// ===== CONFIG =====
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyLSM-W-afz-Ncf8m7pTQQG4UMFJ2J9hn17oIgzP2S63TlLRIidDFlehlJi1nrvngba-g/exec";
const LOCAL_CACHE_KEY = "sw-re-volunteers-cache-v2";

let volunteers = [];

// filter state
const filters = {
  search: "",
  centers: new Set(),
  positions: new Set(),
  grades: new Set(),
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
  closeDetail: document.getElementById("closeDetail"),
  detailPhoto: document.getElementById("detailPhoto"),
  detailName: document.getElementById("detailName"),
  detailPosition: document.getElementById("detailPosition"),
  detailCenter: document.getElementById("detailCenter"),
  detailFields: document.getElementById("detailFields"),
  statTotal: document.getElementById("statTotal"),
  statAvgAge: document.getElementById("statAvgAge"),
  statCountryBreakdown: document.getElementById("statCountryBreakdown"),
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

// ===== Stats tiles =====
// Always computed off the full roster (not the current filters) — these
// are meant as an at-a-glance overview of everyone, not the filtered view.

function computeStats() {
  const total = volunteers.length;
  el.statTotal.textContent = total.toLocaleString();

  const ages = volunteers.map((v) => v.age).filter((a) => a != null);
  const avgAge = ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : null;
  el.statAvgAge.textContent = avgAge != null ? avgAge.toFixed(1) : "—";

  const counts = {};
  volunteers.forEach((v) => {
    const c = v.countryOfBirth && v.countryOfBirth.trim() ? v.countryOfBirth.trim() : "Not specified";
    counts[c] = (counts[c] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6);
  const maxCount = top.length ? top[0][1] : 0;

  if (top.length === 0) {
    el.statCountryBreakdown.innerHTML = '<p class="breakdown-empty">No data yet</p>';
    return;
  }

  el.statCountryBreakdown.innerHTML =
    top
      .map(([name, count]) => {
        const pct = maxCount ? Math.round((count / maxCount) * 100) : 0;
        return `<div class="breakdown-row">
          <span class="breakdown-label">${escapeHtml(name)}</span>
          <div class="breakdown-bar-track"><div class="breakdown-bar-fill" style="width:${pct}%"></div></div>
          <span class="breakdown-count">${count}</span>
        </div>`;
      })
      .join("") +
    (rest.length ? `<p class="breakdown-more">+${rest.length} more countr${rest.length === 1 ? "y" : "ies"}</p>` : "");
}

// ===== Load data (stale-while-revalidate) =====

async function loadVolunteers({ forceFresh = false } = {}) {
  if (APPS_SCRIPT_URL.includes("PASTE_YOUR")) {
    el.stateMessage.classList.remove("hidden");
    el.stateMessage.textContent =
      "Set APPS_SCRIPT_URL in app.js to your deployed Apps Script web app URL. See README.md.";
    return;
  }

  // 1. Paint instantly from local cache (if any) so the table never sits
  //    on a blank "Loading…" screen for repeat visits.
  let paintedFromCache = false;
  if (!forceFresh) {
    try {
      const cached = localStorage.getItem(LOCAL_CACHE_KEY);
      if (cached) {
        volunteers = withComputed(JSON.parse(cached));
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
  el.refreshBtn.classList.add("spinning");
  try {
    const url = forceFresh
      ? APPS_SCRIPT_URL + (APPS_SCRIPT_URL.includes("?") ? "&" : "?") + "nocache=1"
      : APPS_SCRIPT_URL;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);

    volunteers = withComputed(data);
    try {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(data));
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
          <td><div class="name-cell">${photo}<span>${escapeHtml(v.fullName)}</span></div></td>
          <td>${escapeHtml(v.center)}</td>
          <td>${v.position ? `<span class="position-pill">${escapeHtml(v.position)}</span>` : ""}</td>
          <td>${escapeHtml(v.gradeLevel)}</td>
          <td>${v.age ?? "—"}</td>
          <td>${escapeHtml(v.gender)}</td>
          <td>${escapeHtml(v.contact)}</td>
          <td>${escapeHtml(v.email)}</td>
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

function openDetail(id) {
  const v = volunteers.find((x) => x.id === id);
  if (!v) return;

  el.detailPhoto.src = v.photoUrl || "";
  el.detailPhoto.style.display = v.photoUrl ? "block" : "none";
  el.detailName.textContent = v.fullName;
  el.detailPosition.textContent = v.position || "";
  el.detailCenter.textContent = v.center || "";

  const fields = [
    ["Age", v.age != null ? v.age : ""],
    ["Contact", v.contact],
    ["Email", v.email],
    ["Date of Birth", v.dob],
    ["Gender", v.gender],
    ["Grade Level Served", v.gradeLevel],
    ["Jamatkhana", v.jamatkhana],
    ["Education Level", v.education],
    ["Studies Completed in USA", v.studiesInUSA],
    ["Occupation", v.occupation],
    ["Country of Birth", v.countryOfBirth],
    ["T-Shirt Size", v.tshirtSize],
    ["Seva Outside RE System", v.sevaOutside],
    ["Seva History Within RE", v.sevaHistory],
    ["Submitted", v.submittedAt],
  ];

  el.detailFields.innerHTML = fields
    .filter(([, val]) => val !== "" && val != null)
    .map(([label, val]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(val)}</dd>`)
    .join("");

  el.overlay.classList.remove("hidden");
  history.replaceState(null, "", `#${id}`);
}

function closeDetail() {
  el.overlay.classList.add("hidden");
  history.replaceState(null, "", window.location.pathname);
}

// ===== Export to Excel =====

function exportToExcel() {
  const rows = sortRows(getFiltered()).map((v) => ({
    "Full Name": v.fullName,
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

el.searchInput.addEventListener("input", () => {
  filters.search = el.searchInput.value;
  applyFiltersAndRender();
});

el.clearFiltersBtn.addEventListener("click", () => {
  filters.search = "";
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
el.refreshBtn.addEventListener("click", () => loadVolunteers({ forceFresh: true }));
el.exportBtn.addEventListener("click", exportToExcel);

// initialize page size selector to match default
el.pageSizeSelect.value = String(pageSize);

loadVolunteers().then(() => {
  const hashId = window.location.hash.replace("#", "");
  if (hashId) openDetail(hashId);
});
