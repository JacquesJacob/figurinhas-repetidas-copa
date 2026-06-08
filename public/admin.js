const state = {
  admin: null,
  users: [],
  selectedUserId: null
};

const loginPanel = document.querySelector("#admin-login-panel");
const dashboardPanel = document.querySelector("#admin-dashboard-panel");
const mainGrid = document.querySelector("#admin-main-grid");
const loginForm = document.querySelector("#admin-login-form");
const feedback = document.querySelector("#admin-feedback");
const sessionSummary = document.querySelector("#admin-session-summary");
const stats = document.querySelector("#admin-stats");
const userSearch = document.querySelector("#admin-user-search");
const userList = document.querySelector("#admin-user-list");
const selectedLabel = document.querySelector("#admin-selected-label");
const editForm = document.querySelector("#admin-edit-form");
const editEmpty = document.querySelector("#admin-edit-empty");
const logoutButton = document.querySelector("#admin-logout");
const refreshButton = document.querySelector("#admin-refresh");
const exportJsonButton = document.querySelector("#admin-export-json");
const exportCsvButton = document.querySelector("#admin-export-csv");
const deleteUserButton = document.querySelector("#admin-delete-user");
const passwordModal = document.querySelector("#admin-password-modal");
const passwordForm = document.querySelector("#admin-password-form");
const passwordFeedback = document.querySelector("#admin-password-feedback");

loginForm.addEventListener("submit", onLogin);
logoutButton.addEventListener("click", onLogout);
refreshButton.addEventListener("click", loadUsers);
exportJsonButton.addEventListener("click", () => {
  window.location.href = "/api/admin/export?format=json";
});
exportCsvButton.addEventListener("click", () => {
  window.location.href = "/api/admin/export?format=csv";
});
userSearch.addEventListener("input", renderUsers);
editForm.addEventListener("submit", onSaveUser);
deleteUserButton.addEventListener("click", onDeleteUser);
passwordForm.addEventListener("submit", onChangePassword);

init().catch((error) => showFeedback(error.message || "Falha ao carregar o painel.", true));

async function init() {
  const result = await request("/api/admin/session");
  if (result.ok && result.admin) {
    state.admin = result.admin;
    await afterLogin();
    return;
  }

  renderAdmin();
}

async function onLogin(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());
  const result = await request("/api/admin/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (!result.ok) {
    showFeedback(result.error, true);
    return;
  }

  state.admin = result.admin;
  loginForm.reset();
  await afterLogin();
}

async function afterLogin() {
  showFeedback("");
  renderAdmin();
  await loadUsers();
  togglePasswordModal(Boolean(state.admin.mustChangePassword));
}

async function onLogout() {
  await request("/api/admin/logout", { method: "POST" });
  state.admin = null;
  state.users = [];
  state.selectedUserId = null;
  renderAdmin();
}

async function loadUsers() {
  const result = await request("/api/admin/users");
  if (!result.ok) {
    showFeedback(result.error, true);
    return;
  }

  state.users = result.users;

  if (!state.selectedUserId || !state.users.some((user) => user.id === state.selectedUserId)) {
    state.selectedUserId = state.users[0]?.id || null;
  }

  renderStats();
  renderUsers();
  renderSelectedUser();
}

function renderAdmin() {
  const loggedIn = Boolean(state.admin);
  loginPanel.classList.toggle("hidden", loggedIn);
  dashboardPanel.classList.toggle("hidden", !loggedIn);
  mainGrid.classList.toggle("admin-grid-auth", !loggedIn);
  mainGrid.classList.toggle("admin-grid-dashboard", loggedIn);

  if (!loggedIn) {
    togglePasswordModal(false);
    stats.innerHTML = "";
    userList.innerHTML = "";
    editForm.classList.add("hidden");
    editEmpty.classList.remove("hidden");
    return;
  }

  sessionSummary.textContent = `Admin: ${state.admin.username}`;
}

function renderStats() {
  const totalUsers = state.users.length;
  const totalMissing = state.users.reduce((sum, user) => sum + user.missingStickers.length, 0);
  const totalDuplicates = state.users.reduce((sum, user) => sum + user.duplicateStickers.length, 0);

  stats.innerHTML = `
    <article class="stat">
      <strong>${totalUsers}</strong>
      <span>usuários cadastrados</span>
    </article>
    <article class="stat">
      <strong>${totalMissing}</strong>
      <span>figurinhas faltantes informadas</span>
    </article>
    <article class="stat">
      <strong>${totalDuplicates}</strong>
      <span>figurinhas repetidas para troca</span>
    </article>
  `;
}

function renderUsers() {
  const query = userSearch.value.trim().toLowerCase();
  const filtered = state.users.filter((user) => {
    const haystack = `${user.name} ${user.email} ${user.block} ${user.apartment}`.toLowerCase();
    return !query || haystack.includes(query);
  });

  if (filtered.length === 0) {
    userList.innerHTML = `<div class="empty-state">Nenhum usuário encontrado.</div>`;
    return;
  }

  userList.innerHTML = filtered
    .map(
      (user) => `
        <button class="admin-user-card ${user.id === state.selectedUserId ? "active" : ""}" data-user-id="${user.id}">
          <strong>${user.name}</strong>
          <span>${user.email}</span>
          <span>Bloco ${user.block} · Apto ${user.apartment}</span>
          <span>${user.missingStickers.length} faltantes · ${user.duplicateStickers.length} repetidas</span>
        </button>
      `
    )
    .join("");

  userList.querySelectorAll("[data-user-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedUserId = button.dataset.userId;
      renderUsers();
      renderSelectedUser();
    });
  });
}

function renderSelectedUser() {
  const user = state.users.find((item) => item.id === state.selectedUserId);
  if (!user) {
    editForm.classList.add("hidden");
    editEmpty.classList.remove("hidden");
    selectedLabel.textContent = "Selecione um usuário";
    return;
  }

  selectedLabel.textContent = `Editando ${user.name}`;
  editEmpty.classList.add("hidden");
  editForm.classList.remove("hidden");
  editForm.elements.name.value = user.name;
  editForm.elements.email.value = user.email;
  editForm.elements.block.value = user.block;
  editForm.elements.apartment.value = user.apartment;
  editForm.elements.phone.value = user.phone || "";
  editForm.elements.missingStickers.value = user.missingStickers.join("\n");
  editForm.elements.duplicateStickers.value = user.duplicateStickers.join("\n");
}

async function onSaveUser(event) {
  event.preventDefault();
  const user = state.users.find((item) => item.id === state.selectedUserId);
  if (!user) {
    return;
  }

  const payload = {
    name: editForm.elements.name.value,
    email: editForm.elements.email.value,
    block: editForm.elements.block.value,
    apartment: editForm.elements.apartment.value,
    phone: editForm.elements.phone.value,
    missingStickers: splitStickerInput(editForm.elements.missingStickers.value),
    duplicateStickers: splitStickerInput(editForm.elements.duplicateStickers.value)
  };

  const result = await request(`/api/admin/users/${user.id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  if (!result.ok) {
    showFeedback(result.error, true);
    return;
  }

  showFeedback("Cadastro atualizado com sucesso.");
  await loadUsers();
}

async function onDeleteUser() {
  const user = state.users.find((item) => item.id === state.selectedUserId);
  if (!user) {
    return;
  }

  const confirmed = window.confirm(`Deseja remover o usuário ${user.name}?`);
  if (!confirmed) {
    return;
  }

  const result = await request(`/api/admin/users/${user.id}`, {
    method: "DELETE"
  });

  if (!result.ok) {
    showFeedback(result.error, true);
    return;
  }

  showFeedback("Usuário removido.");
  state.selectedUserId = null;
  await loadUsers();
}

async function onChangePassword(event) {
  event.preventDefault();
  const payload = {
    currentPassword: passwordForm.elements.currentPassword.value,
    newPassword: passwordForm.elements.newPassword.value
  };
  const result = await request("/api/admin/change-password", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (!result.ok) {
    passwordFeedback.textContent = result.error;
    passwordFeedback.style.color = "var(--warning)";
    return;
  }

  passwordForm.reset();
  passwordFeedback.textContent = "Senha atualizada.";
  passwordFeedback.style.color = "var(--accent-strong)";
  state.admin.mustChangePassword = false;
  togglePasswordModal(false);
}

function splitStickerInput(value) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function togglePasswordModal(show) {
  passwordModal.classList.toggle("hidden", !show);
}

function showFeedback(message, isError = false) {
  feedback.textContent = message || "";
  feedback.style.color = isError ? "var(--warning)" : "var(--accent-strong)";
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : {};
  return {
    ok: response.ok,
    ...data
  };
}
