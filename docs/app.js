const API_BASE = "https://v1rprogram.pythonanywhere.com";
const tokenKey = "smp_token";

const meOut = document.getElementById("meOut");
const adminOut = document.getElementById("adminOut");
const adminOverlay = document.getElementById("adminOverlay");
const sessionPill = document.getElementById("sessionPill");
const serverStatus = document.getElementById("serverStatus");
const loginMessage = document.getElementById("loginMessage");
const registerMessage = document.getElementById("registerMessage");
const roleActionMessage = document.getElementById("roleActionMessage");

const loginPanel = document.getElementById("loginPanel");
const registerPanel = document.getElementById("registerPanel");
const loginToggle = document.getElementById("loginToggle");
const registerToggle = document.getElementById("registerToggle");
const openLoginHero = document.getElementById("openLoginHero");
const openRegisterHero = document.getElementById("openRegisterHero");
const openLoginFooter = document.getElementById("openLoginFooter");
const openRegisterFooter = document.getElementById("openRegisterFooter");
const toggleLinkBtn = document.getElementById("toggleLinkBtn");
const deleteAccountBtn = document.getElementById("deleteAccountBtn");
const clearAdminLogsBtn = document.getElementById("clearAdminLogsBtn");
const closeAdminOverlayBtn = document.getElementById("closeAdminOverlayBtn");
const adminOverlayBackdrop = document.getElementById("adminOverlayBackdrop");
const loadAdminBtn = document.getElementById("loadAdminBtn");
const grantAdminBtn = document.getElementById("grantAdminBtn");
const removeAdminBtn = document.getElementById("removeAdminBtn");
const roleUsernameInput = document.getElementById("roleUsernameInput");

let currentUser = null;

function getToken() {
  return localStorage.getItem(tokenKey);
}

function setToken(token) {
  localStorage.setItem(tokenKey, token);
}

function clearToken() {
  localStorage.removeItem(tokenKey);
}

function setMessage(element, type, text) {
  if (!text) {
    element.textContent = "";
    element.className = "auth-message hidden";
    return;
  }

  element.textContent = text;
  element.className = `auth-message ${type}`;
}

async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Er ging iets mis.");
  }

  return data;
}

function closeAuthPanels() {
  loginPanel.classList.add("hidden");
  registerPanel.classList.add("hidden");
}

function togglePanel(panel) {
  const isHidden = panel.classList.contains("hidden");
  closeAuthPanels();
  if (isHidden) {
    panel.classList.remove("hidden");
  }
}

function openAdminOverlay() {
  if (!currentUser) return;
  if (currentUser.role !== "ADMIN" && currentUser.role !== "OWNER") return;
  adminOverlay.classList.remove("hidden");
}

function closeAdminOverlay() {
  adminOverlay.classList.add("hidden");
}

function showAdminStatus(status) {
  serverStatus.textContent = status;
  serverStatus.className = `status ${status}`;
}

function updateProfileButtons() {
  const disabled = !currentUser;
  const isOwner = currentUser?.role === "OWNER";
  const isAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "OWNER";

  toggleLinkBtn.disabled = disabled;
  deleteAccountBtn.disabled = disabled || isOwner;
  loadAdminBtn.disabled = !isAdmin;
  clearAdminLogsBtn.disabled = !isOwner;
  grantAdminBtn.disabled = !isOwner;
  removeAdminBtn.disabled = !isOwner;

  if (!currentUser) {
    toggleLinkBtn.textContent = "Koppel account";
    deleteAccountBtn.textContent = "Delete account";
    sessionPill.textContent = "Niet ingelogd";
    sessionPill.classList.remove("admin-trigger");
    clearAdminLogsBtn.textContent = "Leeg log";
    return;
  }

  if (currentUser.linked) {
    toggleLinkBtn.textContent = "Ontkoppel account";
  } else if (currentUser.link_code) {
    toggleLinkBtn.textContent = "Vernieuw link-code";
  } else {
    toggleLinkBtn.textContent = "Koppel account";
  }

  deleteAccountBtn.textContent = isOwner ? "Owner beschermd" : "Delete account";
  clearAdminLogsBtn.textContent = isOwner ? "Leeg log" : "Owner only";
  sessionPill.textContent = `${currentUser.username} · ${currentUser.role}`;

  if (isAdmin) {
    sessionPill.classList.add("admin-trigger");
  } else {
    sessionPill.classList.remove("admin-trigger");
  }
}

function setLoggedOutState(message = "Nog niet ingelogd.") {
  currentUser = null;
  meOut.textContent = message;
  adminOut.textContent = "Nog geen admin data geladen.";
  showAdminStatus("offline");
  closeAdminOverlay();
  updateProfileButtons();
}

function renderProfile(user) {
  currentUser = user;

  const linkedText = user.linked
    ? `${user.minecraft_username || "Onbekend"}${user.minecraft_uuid ? ` (${user.minecraft_uuid})` : ""}`
    : "Nog niet gekoppeld";

  const ownerNotice = user.role === "OWNER"
    ? `<div class="link-code-box" style="background:rgba(59,130,246,0.12);border-color:rgba(96,165,250,0.2)"><strong>Owner account beveiligd</strong><div style="margin-top:8px;color:#bfdbfe">Dit account kan niet via de website verwijderd worden.</div></div>`
    : "";

  const adminHint = (user.role === "ADMIN" || user.role === "OWNER")
    ? `<div class="link-code-box" style="background:rgba(234,179,8,0.12);border-color:rgba(234,179,8,0.18)"><strong>Admin menu</strong><div style="margin-top:8px;color:#fde68a">Klik rechtsboven op je gebruikersnaam en rol om het admin panel te openen.</div></div>`
    : "";

  const linkCodeSection = user.link_code
    ? `
      <div class="link-code-box">
        <strong>Huidige Minecraft link-code</strong>
        <div class="link-code-value">${user.link_code}</div>
        <div style="margin-top:8px;color:#d1fae5">Geldig tot: ${new Date(user.link_code_expires_at).toLocaleString("nl-NL")}</div>
        <div style="margin-top:8px;color:#d1fae5">Gebruik later in Minecraft: <strong>/link ${user.link_code}</strong></div>
      </div>
    `
    : "";

  meOut.innerHTML = `
    <div class="profile-grid">
      <div class="profile-item">
        <strong>Gebruikersnaam</strong>
        <span>${user.username}</span>
      </div>
      <div class="profile-item">
        <strong>Rol</strong>
        <span>${user.role}</span>
      </div>
      <div class="profile-item">
        <strong>Account aangemaakt</strong>
        <span>${new Date(user.created_at).toLocaleString("nl-NL")}</span>
      </div>
      <div class="profile-item">
        <strong>Minecraft koppeling</strong>
        <span>${linkedText}</span>
      </div>
    </div>
    ${ownerNotice}
    ${adminHint}
    ${linkCodeSection}
  `;
  updateProfileButtons();
}

function renderAdmin(data) {
  const items = data.commands || [];

  if (!items.length) {
    adminOut.innerHTML = "Nog geen admin-acties uitgevoerd.";
    return;
  }

  adminOut.innerHTML = items
    .map(
      (item) => `
        <div style="padding:10px 0;border-bottom:1px solid rgba(148,163,184,0.12)">
          <strong>${item.username}</strong> (${item.role}) deed <strong>${item.action}</strong><br>
          Nieuwe status: ${item.status_after}<br>
          <span style="color:#94a3b8">${new Date(item.created_at).toLocaleString("nl-NL")}</span>
        </div>
      `
    )
    .join("");
}

async function loadMe() {
  try {
    const data = await api("/api/me");
    renderProfile(data.user);

    if (data.user.role === "ADMIN" || data.user.role === "OWNER") {
      await loadAdmin();
    }
  } catch (error) {
    setLoggedOutState(error.message);
  }
}

async function loadAdmin() {
  try {
    const data = await api("/api/admin/server");
    renderAdmin(data);
    showAdminStatus(data.server.status);
  } catch (error) {
    adminOut.textContent = error.message;
  }
}

loginToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  togglePanel(loginPanel);
});

registerToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  togglePanel(registerPanel);
});

openLoginHero.addEventListener("click", () => togglePanel(loginPanel));
openRegisterHero.addEventListener("click", () => togglePanel(registerPanel));
openLoginFooter.addEventListener("click", () => togglePanel(loginPanel));
openRegisterFooter.addEventListener("click", () => togglePanel(registerPanel));

loginPanel.addEventListener("click", (event) => event.stopPropagation());
registerPanel.addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", closeAuthPanels);

sessionPill.addEventListener("click", () => {
  if (!currentUser) return;
  if (currentUser.role === "ADMIN" || currentUser.role === "OWNER") {
    openAdminOverlay();
  }
});

closeAdminOverlayBtn.addEventListener("click", closeAdminOverlay);
adminOverlayBackdrop.addEventListener("click", closeAdminOverlay);

document.getElementById("registerUsername").addEventListener("blur", async (event) => {
  const username = event.target.value.trim();
  if (!username) return;

  try {
    const data = await api(`/api/check-username?username=${encodeURIComponent(username)}`, { method: "GET" });
    setMessage(registerMessage, data.available ? "success" : "error", data.message);
  } catch (error) {
    setMessage(registerMessage, "error", error.message);
  }
});

document.getElementById("registerBtn").addEventListener("click", async () => {
  const username = document.getElementById("registerUsername").value.trim();
  const password = document.getElementById("registerPassword").value;
  const passwordConfirm = document.getElementById("registerPasswordConfirm").value;

  if (password !== passwordConfirm) {
    setMessage(registerMessage, "error", "De wachtwoorden zijn niet hetzelfde.");
    return;
  }

  try {
    const data = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setMessage(registerMessage, "success", data.message);
    document.getElementById("registerPassword").value = "";
    document.getElementById("registerPasswordConfirm").value = "";
    closeAuthPanels();
    togglePanel(loginPanel);
    setMessage(loginMessage, "info", "Account gemaakt. Log nu in.");
  } catch (error) {
    setMessage(registerMessage, "error", error.message);
  }
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    closeAuthPanels();
    setMessage(loginMessage, "success", data.message);
    renderProfile(data.user);
    await loadMe();
  } catch (error) {
    setMessage(loginMessage, "error", error.message);
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });
  } catch (error) {
    console.warn(error.message);
  }
  clearToken();
  closeAuthPanels();
  setMessage(loginMessage, "info", "Je bent uitgelogd.");
  setLoggedOutState();
});

document.getElementById("meBtn").addEventListener("click", loadMe);
loadAdminBtn.addEventListener("click", loadAdmin);

toggleLinkBtn.addEventListener("click", async () => {
  if (!currentUser) {
    meOut.textContent = "Log eerst in om te koppelen.";
    return;
  }

  try {
    const endpoint = currentUser.linked ? "/api/me/unlink" : "/api/me/link-code";
    const data = await api(endpoint, { method: "POST" });
    renderProfile(data.user);
  } catch (error) {
    meOut.textContent = error.message;
  }
});

deleteAccountBtn.addEventListener("click", async () => {
  if (!currentUser) {
    meOut.textContent = "Log eerst in om je account te verwijderen.";
    return;
  }

  if (currentUser.role === "OWNER") {
    meOut.textContent = "Het OWNER account is beschermd en kan niet verwijderd worden.";
    return;
  }

  const confirmed = confirm(`Weet je zeker dat je account ${currentUser.username} verwijderd moet worden?`);
  if (!confirmed) return;

  try {
    const data = await api("/api/me", { method: "DELETE" });
    clearToken();
    setLoggedOutState(data.message);
  } catch (error) {
    meOut.textContent = error.message;
  }
});

clearAdminLogsBtn.addEventListener("click", async () => {
  if (!currentUser) {
    adminOut.textContent = "Log eerst in.";
    return;
  }

  if (currentUser.role !== "OWNER") {
    adminOut.textContent = "Alleen het OWNER account mag het admin log leegmaken.";
    return;
  }

  const confirmed = confirm("Weet je zeker dat je het admin log wilt leegmaken?");
  if (!confirmed) return;

  try {
    const data = await api("/api/admin/server/logs", { method: "DELETE" });
    adminOut.textContent = data.message;
  } catch (error) {
    adminOut.textContent = error.message;
  }
});

grantAdminBtn.addEventListener("click", async () => {
  if (!currentUser || currentUser.role !== "OWNER") {
    setMessage(roleActionMessage, "error", "Alleen OWNER mag admins beheren.");
    return;
  }

  const username = roleUsernameInput.value.trim();
  if (!username) {
    setMessage(roleActionMessage, "error", "Vul eerst een gebruikersnaam in.");
    return;
  }

  try {
    const data = await api("/api/admin/promote", {
      method: "POST",
      body: JSON.stringify({ username, role: "ADMIN" }),
    });
    setMessage(roleActionMessage, "success", `${data.user.username} is nu ADMIN.`);
    roleUsernameInput.value = "";
  } catch (error) {
    setMessage(roleActionMessage, "error", error.message);
  }
});

removeAdminBtn.addEventListener("click", async () => {
  if (!currentUser || currentUser.role !== "OWNER") {
    setMessage(roleActionMessage, "error", "Alleen OWNER mag admins beheren.");
    return;
  }

  const username = roleUsernameInput.value.trim();
  if (!username) {
    setMessage(roleActionMessage, "error", "Vul eerst een gebruikersnaam in.");
    return;
  }

  try {
    const data = await api("/api/admin/promote", {
      method: "POST",
      body: JSON.stringify({ username, role: "USER" }),
    });
    setMessage(roleActionMessage, "success", `${data.user.username} is nu weer USER.`);
    roleUsernameInput.value = "";
  } catch (error) {
    setMessage(roleActionMessage, "error", error.message);
  }
});

updateProfileButtons();

if (getToken()) {
  loadMe();
} else {
  setLoggedOutState();
}
