const API_BASE = "https://v1rprogram.pythonanywhere.com";
const tokenKey = "smp_token";

const meOut = document.getElementById("meOut");
const adminOut = document.getElementById("adminOut");
const adminPanel = document.getElementById("adminPanel");
const serverStatus = document.getElementById("serverStatus");
const sessionPill = document.getElementById("sessionPill");
const loginMessage = document.getElementById("loginMessage");
const registerMessage = document.getElementById("registerMessage");

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

function showAdminStatus(status) {
  serverStatus.textContent = status;
  serverStatus.className = `status ${status}`;
}

function updateProfileButtons() {
  const disabled = !currentUser;
  toggleLinkBtn.disabled = disabled;
  deleteAccountBtn.disabled = disabled;

  if (!currentUser) {
    toggleLinkBtn.textContent = "Koppel account";
    return;
  }

  if (currentUser.linked) {
    toggleLinkBtn.textContent = "Ontkoppel account";
  } else if (currentUser.link_code) {
    toggleLinkBtn.textContent = "Vernieuw link-code";
  } else {
    toggleLinkBtn.textContent = "Koppel account";
  }
}

function setLoggedOutState(message = "Nog niet ingelogd.") {
  currentUser = null;
  meOut.textContent = message;
  adminOut.textContent = "Nog geen admin data geladen.";
  sessionPill.textContent = "Niet ingelogd";
  adminPanel.classList.add("hidden");
  showAdminStatus("offline");
  updateProfileButtons();
}

function renderProfile(user) {
  currentUser = user;

  const linkedText = user.linked
    ? `${user.minecraft_username || "Onbekend"}${user.minecraft_uuid ? ` (${user.minecraft_uuid})` : ""}`
    : "Nog niet gekoppeld";

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
    ${linkCodeSection}
  `;
  sessionPill.textContent = `${user.username} · ${user.role}`;
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

    const role = data.user.role;
    if (role === "ADMIN" || role === "OWNER") {
      adminPanel.classList.remove("hidden");
      await loadAdmin();
    } else {
      adminPanel.classList.add("hidden");
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
    adminPanel.classList.add("hidden");
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
document.getElementById("loadAdminBtn").addEventListener("click", loadAdmin);

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

document.getElementById("startBtn").addEventListener("click", async () => {
  try {
    await api("/api/admin/server/action", {
      method: "POST",
      body: JSON.stringify({ action: "start" }),
    });
    await loadAdmin();
  } catch (error) {
    adminOut.textContent = error.message;
  }
});

document.getElementById("restartBtn").addEventListener("click", async () => {
  try {
    await api("/api/admin/server/action", {
      method: "POST",
      body: JSON.stringify({ action: "restart" }),
    });
    await loadAdmin();
  } catch (error) {
    adminOut.textContent = error.message;
  }
});

document.getElementById("stopBtn").addEventListener("click", async () => {
  try {
    await api("/api/admin/server/action", {
      method: "POST",
      body: JSON.stringify({ action: "stop" }),
    });
    await loadAdmin();
  } catch (error) {
    adminOut.textContent = error.message;
  }
});

updateProfileButtons();

if (getToken()) {
  loadMe();
} else {
  setLoggedOutState();
}
