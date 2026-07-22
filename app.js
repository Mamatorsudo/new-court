// 1. Supabase Credentials
const SUPABASE_URL = "https://vswkfxfaxoqhuuywkemd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_tRv6XX3ylRgAcsFT2reMNQ_44evSTg1";

// 2. Initialize Supabase
const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let userRole = "public";
let allCases = [];
let currentlyFilteredCases = [];
let currentTab = "all";

// Initialize App
document.addEventListener("DOMContentLoaded", async () => {
  await checkUserSession();
  await fetchCases();
});

// Check Logged-in User Session
async function checkUserSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    await fetchUserRole(currentUser.id);
  } else {
    updateUIState();
  }
}

// Fetch Role from Supabase 'profiles' table
async function fetchUserRole(userId) {
  const { data } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  userRole = (data && data.role) ? data.role : "staff";
  updateUIState();
}

// Control UI elements based on Role
function updateUIState() {
  const userDisplay = document.getElementById("user-display");
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const adminPanel = document.getElementById("admin-panel");
  const actionHeaders = document.querySelectorAll(".actions-header");

  if (currentUser) {
    userDisplay.innerText = `${currentUser.email} (${userRole.toUpperCase()})`;
    if (loginBtn) loginBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "inline-block";

    // BOTH Staff and Judge can create cases
    if (userRole === "judge" || userRole === "staff") {
      if (adminPanel) adminPanel.style.display = "block";
    } else {
      if (adminPanel) adminPanel.style.display = "none";
    }

    // ONLY JUDGE gets to see the Actions Column (Edit/Delete)
    actionHeaders.forEach(el => {
      el.style.display = (userRole === "judge") ? "table-cell" : "none";
    });
  } else {
    userDisplay.innerText = "Public View";
    if (loginBtn) loginBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (adminPanel) adminPanel.style.display = "none";
    actionHeaders.forEach(el => el.style.display = "none");
  }
}

// Calculate Days on Desk
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
    tbody.innerHTML = `<tr><td colspan="8">Error loading cases: ${escapeHTML(error.message)}</td></tr>`;
    return;
  }

  allCases = cases || [];
  updateDashboardStats();
  filterCases();
}

// Update Header Statistics
function updateDashboardStats() {
  const activeCases = allCases.filter(c => c.status !== "Closed" && c.status !== "Dismissed");
  const civilCount = activeCases.filter(c => c.category === "Civil").length;
  const criminalCount = activeCases.filter(c => c.category === "Criminal").length;
  const urgentCount = activeCases.filter(c => calculateDeskTimeDays(c.created_at) > 30).length;

  document.getElementById("stat-total").innerText = activeCases.length;
  document.getElementById("stat-civil").innerText = civilCount;
  document.getElementById("stat-criminal").innerText = criminalCount;
  document.getElementById("stat-urgent").innerText = urgentCount;
}

// Tab Switcher
function switchTab(tabName, element) {
  currentTab = tabName;
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  if (element) element.classList.add("active");
  filterCases();
}

// Filter and Search Cases
function filterCases() {
  const searchTerm = document.getElementById("search-input").value.toLowerCase();
  const statusFilter = document.getElementById("filter-status").value;

  currentlyFilteredCases = allCases.filter(c => {
    const daysOnDesk = calculateDeskTimeDays(c.created_at);
    const categoryMatch = c.category || "Civil";

    let matchesTab = true;
    if (currentTab === "Civil") matchesTab = categoryMatch === "Civil";
    else if (currentTab === "Criminal") matchesTab = categoryMatch === "Criminal";
    else if (currentTab === "urgent") matchesTab = daysOnDesk > 30 && c.status !== "Closed" && c.status !== "Dismissed";
    else if (currentTab === "archived") matchesTab = c.status === "Closed" || c.status === "Dismissed";
    else if (currentTab === "all") matchesTab = c.status !== "Closed" && c.status !== "Dismissed";

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

    // ONLY JUDGE SEES EDIT & DELETE BUTTONS
    const isJudge = userRole === "judge";

    tr.innerHTML = `
      <td><strong>${escapeHTML(item.case_number || '')}</strong></td>
      <td><span class="badge-category ${categoryBadgeClass}">${category === 'Criminal' ? '🚨 Criminal' : '⚖️ Civil'}</span></td>
      <td>${escapeHTML(item.title || '')}</td>
      <td><strong>${escapeHTML(item.status || '')}</strong></td>
      <td><span class="badge-desk-time">⏱️ ${days} day${days === 1 ? '' : 's'}</span></td>
      <td>${item.next_hearing || 'N/A'}</td>
      <td>${escapeHTML(item.details || 'N/A')}</td>
      ${isJudge ? `
        <td>
          <div class="action-btns">
            <button class="btn-edit" onclick="openEditModal('${item.id}')">✏️ Edit</button>
            <button class="btn-danger" onclick="deleteCase('${item.id}')">🗑️ Delete</button>
          </div>
        </td>
      ` : ''}
    `;
    tbody.appendChild(tr);
  });
}

// Create New Case (Staff & Judge)
async function handleCreateCase(event) {
  event.preventDefault();
  
  if (userRole !== "judge" && userRole !== "staff") {
    alert("Permission denied.");
    return;
  }

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

// Open Edit Modal
function openEditModal(id) {
  if (userRole !== "judge") {
    alert("Permission denied. Only Judge Bernice can edit cases.");
    return;
  }

  const item = allCases.find(c => c.id === id);
  if (!item) return;

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

// Update Case (Strictly Judge Only)
async function handleUpdateCase(event) {
  event.preventDefault();

  if (userRole !== "judge") {
    alert("Permission denied. Only Judge Bernice can edit cases.");
    return;
  }

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
    alert("Permission denied. Only Judge Bernice can delete cases.");
    return;
  }

  if (!confirm("Are you sure you want to permanently delete this case?")) return;

  const { error } = await supabaseClient.from("cases").delete().eq("id", id);
  if (error) alert("Error deleting case: " + error.message);
  else fetchCases();
}

// Export to Excel / CSV
function exportToCSV() {
  if (currentlyFilteredCases.length === 0) {
    alert("No cases to export!");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Case Number,Category,Title,Status,Next Hearing,Days on Desk,Details\n";

  currentlyFilteredCases.forEach(c => {
    const days = calculateDeskTimeDays(c.created_at);
    const row = [
      `"${c.case_number || ''}"`,
      `"${c.category || 'Civil'}"`,
      `"${c.title || ''}"`,
      `"${c.status || ''}"`,
      `"${c.next_hearing || ''}"`,
      `"${days}"`,
      `"${(c.details || '').replace(/"/g, '""')}"`
    ].join(",");
    csvContent += row + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Court_Cases_Report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Authentication Handlers
async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    alert("Login failed: " + error.message);
  } else {
    currentUser = data.user;
    closeLoginModal();
    await fetchUserRole(currentUser.id);
    fetchCases();
  }
}

async function logout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  userRole = "public";
  updateUIState();
  fetchCases();
}

function openLoginModal() { document.getElementById("login-modal").style.display = "flex"; }
function closeLoginModal() { document.getElementById("login-modal").style.display = "none"; }
function escapeHTML(str) { return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)); }

window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.handleUpdateCase = handleUpdateCase;
window.logout = logout;
window.handleLogin = handleLogin;
window.handleCreateCase = handleCreateCase;
window.fetchCases = fetchCases;
window.filterCases = filterCases;
window.switchTab = switchTab;
window.deleteCase = deleteCase;
window.exportToCSV = exportToCSV;