const API_BASE = "http://127.0.0.1:5000";
const tokenKey = "smp_token";

const meOut = document.getElementById("meOut");
const adminOut = document.getElementById("adminOut");
const adminPanel = document.getElementById("adminPanel");
const serverStatus = document.getElementById("serverStatus");
const sessionPill = document.getElementById("sessionPill");

const loginPanel = document.getElementById("loginPanel");
const registerPanel = document.getElementById("registerPanel");
const loginToggle = document.getElementById("loginToggle");
const registerToggle = document.getElementById("registerToggle");
const openLoginHero = document.getElementById("openLoginHero");
const openRegisterHero = document.getElementById("openRegisterHero");
const openLoginFooter = document.getElementById("openLoginFooter");
const openRegisterFooter = document.getElementById("openRegisterFooter");

function getToken() {
  return localStorage.getItem(tokenKey);
}

function setToken(token) {
  localStorage.setItem(tokenKey, token);
}

function clearToken() {
  localStorage.removeItem(tokenKey);
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

function setLoggedOutState(message = "Nog niet ingelogd.") {
  meOut.textContent = message;
  adminOut.textContent = "Nog geen admin data geladen.";
  sessionPill.textContent = "Niet ingelogd";
  adminPanel.classList.add("hidden");
  showAdminStatus("offline");
}

function renderProfile(user) {
  meOut.innerHTML = `
    <strong>${user.username}</strong><br>
    Rol: ${user.role}<br>
    Account aangemaakt: ${new Date(user.created_at).toLocaleString("nl-NL")}
  `;
  sessionPill.textContent = `${user.username} · ${user.role}`;
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

document.getElementById("registerBtn").addEventListener("click", async () => {
  const username = document.getElementById("registerUsername").value.trim();
  const password = document.getElementById("registerPassword").value;

  try {
    const data = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    alert(data.message);
    closeAuthPanels();
    togglePanel(loginPanel);
  } catch (error) {
    alert(error.message);
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
    renderProfile(data.user);
    alert(`Ingelogd als ${data.user.username} (${data.user.role})`);
    await loadMe();
  } catch (error) {
    alert(error.message);
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
  setLoggedOutState();
});

document.getElementById("meBtn").addEventListener("click", loadMe);
document.getElementById("loadAdminBtn").addEventListener("click", loadAdmin);

document.getElementById("startBtn").addEventListener("click", async () => {
  try {
    await api("/api/admin/server/action", {
      method: "POST",
      body: JSON.stringify({ action: "start" }),
    });
    await loadAdmin();
  } catch (error) {
    alert(error.message);
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
    alert(error.message);
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
    alert(error.message);
  }
});

if (getToken()) {
  loadMe();
} else {
  setLoggedOutState();
}
