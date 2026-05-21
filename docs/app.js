const API_BASE = "http://127.0.0.1:5000";
const tokenKey = "smp_token";

const healthOut = document.getElementById("healthOut");
const meOut = document.getElementById("meOut");
const adminOut = document.getElementById("adminOut");
const adminPanel = document.getElementById("adminPanel");
const serverStatus = document.getElementById("serverStatus");

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

function showAdminStatus(status) {
  serverStatus.textContent = status;
  serverStatus.className = `status ${status}`;
}

async function loadMe() {
  try {
    const data = await api("/api/me");
    meOut.textContent = JSON.stringify(data, null, 2);

    const role = data.user.role;
    if (role === "ADMIN" || role === "OWNER") {
      adminPanel.classList.remove("hidden");
      await loadAdmin();
    } else {
      adminPanel.classList.add("hidden");
    }
  } catch (error) {
    meOut.textContent = error.message;
    adminPanel.classList.add("hidden");
  }
}

async function loadAdmin() {
  try {
    const data = await api("/api/admin/server");
    adminOut.textContent = JSON.stringify(data, null, 2);
    showAdminStatus(data.server.status);
  } catch (error) {
    adminOut.textContent = error.message;
    adminPanel.classList.add("hidden");
  }
}

document.getElementById("healthBtn").addEventListener("click", async () => {
  try {
    const data = await api("/api/health", { method: "GET" });
    healthOut.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    healthOut.textContent = error.message;
  }
});

document.getElementById("registerBtn").addEventListener("click", async () => {
  const username = document.getElementById("registerUsername").value;
  const password = document.getElementById("registerPassword").value;

  try {
    const data = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    alert(data.message);
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  const username = document.getElementById("loginUsername").value;
  const password = document.getElementById("loginPassword").value;

  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
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
  meOut.textContent = "Nog niet ingelogd.";
  adminOut.textContent = "Nog geen admin data geladen.";
  adminPanel.classList.add("hidden");
  showAdminStatus("offline");
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
}
