// 1. Supabase Initialization
const SUPABASE_URL = "https://vswkfxfaxoqhuuywkemd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_tRv6XX3ylRgAcsFT2reMNQ_44evSTg1";

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let userRole = "public";
let allCases = [];
let currentlyFilteredCases = [];
let currentTab = "all";

const ARCHIVED_STATUSES = [
  "Closed", "Dismissed", "Struck Out", 
  "Convicted", "Judgment Delivered", "Consent Judgment"
];

document.addEventListener("DOMContentLoaded", async () => {
  await checkUserSession();
  await fetchCases();
});

// Check Session & User Role
async function checkUserSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    await fetchUserRole(currentUser.id);
  } else {
    userRole = "public";
    updateUIState();
  }
}

async function fetchUserRole(userId) {
  const { data } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  userRole = (data && data.role) ? data.role.toLowerCase().trim() : "staff";
  updateUIState();
}

// UI & Permissions Display
function updateUIState() {
  const userDisplay = document.getElementById("user-display");
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const adminPanel = document.getElementById("admin-panel");
  const actionHeaders = document.querySelectorAll(".actions-header");

  const isStaff = currentUser !== null; // Staff, Clerks, Judges

  if (currentUser) {
    if (userDisplay) userDisplay.innerText = `${currentUser.email} (${userRole.toUpperCase()})`;
    if (loginBtn) loginBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    if (adminPanel) adminPanel.style.display = isStaff ? "block" : "none";
    actionHeaders.forEach(el => el.style.display = isStaff ? "table-cell" : "none");
  } else {
    if (userDisplay) userDisplay.innerText = "Public View";
    if (loginBtn) loginBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (adminPanel) adminPanel.style.display = "none";
    actionHeaders.forEach(el => el.style.display = "none");
  }
}

function calculateDeskTimeDays(createdAt) {
  if (!createdAt) return 0;
  const created = new Date(createdAt);
  const today = new Date();
  return Math.floor(Math.abs(today - created) / (1000 * 60 * 60 * 24));
}

// Fetch Cases from Supabase
async function fetchCases() {
  const tbody = document.getElementById("cases-body");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Loading cases...</td></tr>`;

  const { data: cases, error } = await supabaseClient
    .from("cases")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:red;">Error loading cases: ${escapeHTML(error.message)}</td></tr>`;
    return;
  }

  allCases = cases || [];
  updateDashboardStats();
  filterCases();
}

function updateDashboardStats() {
  const activeCases = allCases.filter(c => !ARCHIVED_STATUSES.includes(c.status));
  const civilCount = activeCases.filter(c => c.category === "Civil").length;
  const criminalCount = activeCases.filter(c => c.category === "Criminal").length;
  const urgentCount = activeCases.filter(c => calculateDeskTimeDays(c.created_at) > 30).length;

  if (document.getElementById("stat-total")) document.getElementById("stat-total").innerText = activeCases.length;
  if (document.getElementById("stat-civil")) document.getElementById("stat-civil").innerText = civilCount;
  if (document.getElementById("stat-criminal")) document.getElementById("stat-criminal").innerText = criminalCount;
  if (document.getElementById("stat-urgent")) document.getElementById("stat-urgent").innerText = urgentCount;
}

function switchTab(tabName, element) {
  currentTab = tabName;
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  if (element) element.classList.add("active");
  filterCases();
}

function filterCases() {
  const searchInput = document.getElementById("search-input");
  const filterStatusEl = document.getElementById("filter-status");

  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
  const statusFilter = filterStatusEl ? filterStatusEl.value : "ALL";

  currentlyFilteredCases = allCases.filter(c => {
    const daysOnDesk = calculateDeskTimeDays(c.created_at);
    const categoryMatch = c.category || "Civil";
    const isArchived = ARCHIVED_STATUSES.includes(c.status);

    let matchesTab = true;
    if (currentTab === "Civil") matchesTab = categoryMatch === "Civil" && !isArchived;
    else if (currentTab === "Criminal") matchesTab = categoryMatch === "Criminal" && !isArchived;
    else if (currentTab === "urgent") matchesTab = daysOnDesk > 30 && !isArchived;
    else if (currentTab === "archived") matchesTab = isArchived;
    else if (currentTab === "all") matchesTab = !isArchived;

    const matchesSearch = 
      (c.case_number && c.case_number.toLowerCase().includes(searchTerm)) ||
      (c.title && c.title.toLowerCase().includes(searchTerm)) ||
      (c.details && c.details.toLowerCase().includes(searchTerm));

    const matchesStatus = (statusFilter === "ALL") || (c.status === statusFilter);

    return matchesTab && matchesSearch && matchesStatus;
  });

  renderCasesTable(currentlyFilteredCases);
}

// Render Cases Table
function renderCasesTable(casesToRender) {
  const tbody = document.getElementById("cases-body");
  if (!tbody) return;

  if (casesToRender.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">No matching cases found.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  casesToRender.forEach(item => {
    const tr = document.createElement("tr");
    const days = calculateDeskTimeDays(item.created_at);
    const category = item.category || "Civil";
    const categoryBadgeClass = category === "Criminal" ? "badge-criminal" : "badge-civil";
    
    // Permission Rules: Staff/Clerks/Judges can edit; ONLY Judges can delete
    const canEdit = currentUser !== null;
    const canDelete = userRole === "judge";

    tr.innerHTML = `
      <td><strong>${escapeHTML(item.case_number || '')}</strong></td>
      <td><span class="badge-category ${categoryBadgeClass}">${category === 'Criminal' ? '🚨 Criminal' : '⚖️ Civil'}</span></td>
      <td>${escapeHTML(item.title || '')}</td>
      <td><strong>${escapeHTML(item.status || '')}</strong></td>
      <td><span class="badge-desk-time">⏱️ ${days} day${days === 1 ? '' : 's'}</span></td>
      <td>${item.next_hearing || 'N/A'}</td>
      <td>${escapeHTML(item.details || 'N/A')}</td>
      ${canEdit ? `
        <td class="action-cell">
          <div class="action-btns">
            <button class="btn-edit" onclick="openEditModal('${item.id}')">✏️ Edit</button>
            ${canDelete ? `<button class="btn-danger" onclick="deleteCase('${item.id}')">🗑️ Delete</button>` : ''}
          </div>
        </td>
      ` : ''}
    `;
    tbody.appendChild(tr);
  });
}

// Add Case
async function handleCreateCase(event) {
  event.preventDefault();
  if (!currentUser) return alert("Public users cannot add cases.");

  const case_number = document.getElementById("case-num").value;
  const title = document.getElementById("title").value;
  const category = document.getElementById("category").value;
  const status = document.getElementById("status").value;
  const next_hearing = document.getElementById("hearing-date").value;
  const details = document.getElementById("details").value;

  const { error } = await supabaseClient
    .from("cases")
    .insert([{ case_number, title, category, status, next_hearing, details }]);

  if (error) {
    alert("Error creating case: " + error.message);
  } else {
    document.getElementById("add-case-form").reset();
    fetchCases();
  }
}

// Edit Modal Handling
function openEditModal(id) {
  if (!currentUser) return alert("Public users cannot edit cases.");

  const item = allCases.find(c => String(c.id) === String(id));
  if (!item) return alert("Could not locate case record.");

  document.getElementById("edit-case-id").value = item.id;
  document.getElementById("edit-case-num").value = item.case_number || "";
  document.getElementById("edit-title").value = item.title || "";
  document.getElementById("edit-category").value = item.category || "Civil";
  document.getElementById("edit-status").value = item.status || "Pending";
  document.getElementById("edit-hearing-date").value = item.next_hearing || "";
  document.getElementById("edit-details").value = item.details || "";

  document.getElementById("edit-modal").style.display = "flex";
}

function closeEditModal() {
  document.getElementById("edit-modal").style.display = "none";
}

async function handleUpdateCase(event) {
  event.preventDefault();
  if (!currentUser) return alert("Public users cannot update cases.");

  const id = document.getElementById("edit-case-id").value;
  const case_number = document.getElementById("edit-case-num").value;
  const title = document.getElementById("edit-title").value;
  const category = document.getElementById("edit-category").value;
  const status = document.getElementById("edit-status").value;
  const next_hearing = document.getElementById("edit-hearing-date").value;
  const details = document.getElementById("edit-details").value;

  const { error } = await supabaseClient
    .from("cases")
    .update({ case_number, title, category, status, next_hearing, details })
    .eq("id", id);

  if (error) {
    alert("Error updating case: " + error.message);
  } else {
    closeEditModal();
    fetchCases();
  }
}

// Delete Case (Strictly Judge Only)
async function deleteCase(id) {
  if (userRole !== "judge") {
    alert("Permission denied. Only Judges can delete cases.");
    return;
  }

  if (!confirm("Are you sure you want to delete this case?")) return;

  const { error } = await supabaseClient.from("cases").delete().eq("id", id);
  if (error) alert("Error deleting case: " + error.message);
  else fetchCases();
}

function escapeHTML(str) { return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)); }

window.openLoginModal = () => document.getElementById("login-modal").style.display = "flex";
window.closeLoginModal = () => document.getElementById("login-modal").style.display = "none";
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.handleUpdateCase = handleUpdateCase;
window.handleCreateCase = handleCreateCase;
window.fetchCases = fetchCases;
window.filterCases = filterCases;
window.switchTab = switchTab;
window.deleteCase = deleteCase;
window.logout = async () => {
  await supabaseClient.auth.signOut();
  currentUser = null;
  userRole = "public";
  updateUIState();
  fetchCases();
};
window.handleLogin = async (event) => {
  event.preventDefault();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    alert("Login failed: " + error.message);
  } else {
    currentUser = data.user;
    window.closeLoginModal();
    await fetchUserRole(currentUser.id);
    fetchCases();
  }
};