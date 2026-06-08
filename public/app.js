const state = {
  album: null,
  currentUser: null,
  missingStickers: new Set(),
  duplicateStickers: new Set(),
  duplicateStickerQuantities: {},
  publicStats: null,
  openGroups: {
    missing: new Set(),
    duplicate: new Set()
  }
};

const registerForm = document.querySelector("#register-form");
const loginForm = document.querySelector("#login-form");
const profileView = document.querySelector("#profile-view");
const profileForm = document.querySelector("#profile-form");
const authFeedback = document.querySelector("#auth-feedback");
const authTabs = document.querySelector(".tabs");
const dashboard = document.querySelector("#dashboard");
const publicDashboard = document.querySelector("#public-dashboard");
const dashboardTitle = document.querySelector("#dashboard-title");
const sessionSummary = document.querySelector("#session-summary");
const stats = document.querySelector("#stats");
const publicStats = document.querySelector("#public-stats");
const publicTopAvailable = document.querySelector("#public-top-available");
const publicTopDemanded = document.querySelector("#public-top-demanded");
const missingList = document.querySelector("#missing-list");
const duplicateList = document.querySelector("#duplicate-list");
const matchesList = document.querySelector("#matches-list");
const saveCollectionButton = document.querySelector("#save-collection");
const exportCollectionButton = document.querySelector("#export-collection");
const logoutButton = document.querySelector("#logout-button");
const refreshMatchesButton = document.querySelector("#refresh-matches");
const missingSearch = document.querySelector("#missing-search");
const duplicateSearch = document.querySelector("#duplicate-search");
const toast = document.querySelector("#toast");
const editProfileButton = document.querySelector("#edit-profile");
const saveProfileButton = document.querySelector("#save-profile");
const cancelProfileButton = document.querySelector("#cancel-profile");
const profileName = document.querySelector("#profile-name");
const profileEmail = document.querySelector("#profile-email");
const profileBlock = document.querySelector("#profile-block");
const profileApartment = document.querySelector("#profile-apartment");
const profilePhone = document.querySelector("#profile-phone");

let toastTimer = null;
let isEditingProfile = false;

document.querySelectorAll("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => switchAuthTab(button.dataset.authTab));
});

function buildRegisterPayload(form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  payload.name = String(payload.name || "").trim();
  payload.email = String(payload.email || "").trim();
  payload.password = String(payload.password || "").trim();
  payload.block = String(payload.block || "").trim();
  payload.apartment = String(payload.apartment || "").trim();
  payload.phone = String(payload.phone || "").trim();

  return payload;
}

function buildProfilePayload(form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  payload.name = String(payload.name || "").trim();
  payload.email = String(payload.email || "").trim();
  payload.block = String(payload.block || "").trim();
  payload.apartment = String(payload.apartment || "").trim();
  payload.phone = String(payload.phone || "").trim();

  return payload;
}

function validateRegisterPayload(payload) {
  if (!payload.name || !payload.email || !payload.password || !payload.block || !payload.apartment) {
    showFeedback("Preencha obrigatoriamente Nome, Email, Senha, Bloco e Apartamento.", true);
    return false;
  }

  const apartmentNumber = Number.parseInt(payload.apartment, 10);
  if (!/^\d+$/.test(payload.apartment) || apartmentNumber < 1 || apartmentNumber > 228) {
    showFeedback("Apartamento deve ser um número entre 1 e 228.", true);
    return false;
  }

  return true;
}

function validateProfilePayload(payload) {
  if (!payload.name || !payload.email || !payload.block || !payload.apartment) {
    showFeedback("Preencha obrigatoriamente Nome, Email, Bloco e Apartamento.", true);
    return false;
  }

  const apartmentNumber = Number.parseInt(payload.apartment, 10);
  if (!/^\d+$/.test(payload.apartment) || apartmentNumber < 1 || apartmentNumber > 228) {
    showFeedback("Apartamento deve ser um número entre 1 e 228.", true);
    return false;
  }

  return true;
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = buildRegisterPayload(registerForm);

  if (!validateRegisterPayload(payload)) {
    return;
  }

  const result = await request("/api/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (!result.ok) {
    showFeedback(result.error, true);
    return;
  }

  state.currentUser = result.user;
  hydrateCollectionFromUser(result.user);
  registerForm.reset();
  showFeedback("Conta criada com sucesso. Agora marque suas figurinhas.");
  await loadPublicStats();
  renderSession();
  await refreshMatches();
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

  const result = await request("/api/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (!result.ok) {
    showFeedback(result.error, true);
    return;
  }

  state.currentUser = result.user;
  hydrateCollectionFromUser(result.user);
  loginForm.reset();
  showFeedback("Login realizado.");
  await loadPublicStats();
  renderSession();
  await refreshMatches();
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentUser || !isEditingProfile) {
    return;
  }

  const payload = buildProfilePayload(profileForm);
  if (!validateProfilePayload(payload)) {
    return;
  }

  const result = await request("/api/profile", {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  if (!result.ok) {
    showFeedback(result.error, true);
    return;
  }

  state.currentUser = result.user;
  hydrateCollectionFromUser(result.user);
  setProfileEditing(false);
  renderSession();
  showFeedback("");
  showToast("Dados do usuário atualizados com sucesso.");
});

saveCollectionButton.addEventListener("click", async () => {
  if (!state.currentUser) {
    return;
  }

  const result = await request("/api/my-collection", {
    method: "PUT",
    body: JSON.stringify({
      missingStickers: [...state.missingStickers],
      duplicateStickerQuantities: state.duplicateStickerQuantities
    })
  });

  if (!result.ok) {
    showFeedback(result.error, true);
    return;
  }

  state.currentUser = result.user;
  hydrateCollectionFromUser(result.user);
  await loadPublicStats();
  renderSession();
  await refreshMatches();
  showToast("Checklist salvo com sucesso.");
});

exportCollectionButton.addEventListener("click", () => {
  if (!state.currentUser) {
    return;
  }

  window.location.href = "/api/my-collection/export";
});

editProfileButton.addEventListener("click", () => {
  if (!state.currentUser) {
    return;
  }

  showFeedback("");
  setProfileEditing(true);
});

cancelProfileButton.addEventListener("click", () => {
  if (!state.currentUser) {
    return;
  }

  showFeedback("");
  setProfileEditing(false);
  fillProfileForm(state.currentUser);
});

logoutButton.addEventListener("click", async () => {
  await request("/api/logout", { method: "POST" });
  state.currentUser = null;
  state.missingStickers = new Set();
  state.duplicateStickers = new Set();
  state.duplicateStickerQuantities = {};
  showFeedback("Sessão encerrada.");
  await loadPublicStats();
  renderSession();
});

refreshMatchesButton.addEventListener("click", refreshMatches);
missingSearch.addEventListener("input", () => renderChecklist("missing"));
duplicateSearch.addEventListener("input", () => renderChecklist("duplicate"));

init().catch((error) => {
  showFeedback(error.message || "Falha ao carregar a aplicação.", true);
});

async function init() {
  const [albumResult, sessionResult, publicStatsResult] = await Promise.all([
    request("/api/stickers"),
    request("/api/session"),
    request("/api/public-stats")
  ]);

  if (!albumResult.ok) {
    throw new Error(albumResult.error || "Não foi possível carregar o catálogo.");
  }

  state.album = albumResult;

  if (sessionResult.ok && sessionResult.user) {
    state.currentUser = sessionResult.user;
    hydrateCollectionFromUser(sessionResult.user);
  }

  if (publicStatsResult.ok && publicStatsResult.stats) {
    state.publicStats = publicStatsResult.stats;
  }

  renderSession();
  if (state.currentUser) {
    await refreshMatches();
  }
}

async function loadPublicStats() {
  const result = await request("/api/public-stats");
  if (result.ok) {
    state.publicStats = result.stats;
  }
}

function switchAuthTab(tab) {
  if (state.currentUser) {
    return;
  }

  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === tab);
  });

  registerForm.classList.toggle("hidden", tab !== "register");
  loginForm.classList.toggle("hidden", tab !== "login");
}

function hydrateCollectionFromUser(user) {
  state.missingStickers = new Set(user.missingStickers || []);
  state.duplicateStickers = new Set(user.duplicateStickers || []);
  state.duplicateStickerQuantities = { ...(user.duplicateStickerQuantities || {}) };
}

function renderSession() {
  const isLoggedIn = Boolean(state.currentUser);
  dashboard.classList.toggle("hidden", !isLoggedIn);
  publicDashboard.classList.toggle("hidden", isLoggedIn);
  authTabs.classList.toggle("hidden", isLoggedIn);
  profileView.classList.toggle("hidden", !isLoggedIn || isEditingProfile);
  profileForm.classList.toggle("hidden", !isLoggedIn || !isEditingProfile);

  if (!isLoggedIn) {
    isEditingProfile = false;
    registerForm.classList.toggle(
      "hidden",
      !document.querySelector("[data-auth-tab='register']").classList.contains("active")
    );
    loginForm.classList.toggle("hidden", !document.querySelector("[data-auth-tab='login']").classList.contains("active"));
    dashboardTitle.textContent = "Painel de trocas";
    sessionSummary.textContent = "Visão geral das trocas do condomínio.";
    stats.innerHTML = "";
    missingList.innerHTML = "";
    duplicateList.innerHTML = "";
    matchesList.innerHTML = "";
    renderPublicStats();
    return;
  }

  registerForm.classList.add("hidden");
  loginForm.classList.add("hidden");
  dashboardTitle.textContent = "Meu Painel";
  sessionSummary.textContent = `${state.currentUser.name} · Bloco ${state.currentUser.block} · Apto ${state.currentUser.apartment}`;
  fillProfileView(state.currentUser);
  fillProfileForm(state.currentUser);
  setProfileEditing(isEditingProfile);
  renderStats();
  renderChecklist("missing");
  renderChecklist("duplicate");
}

function fillProfileView(user) {
  profileName.textContent = user.name || "";
  profileEmail.textContent = user.email || "";
  profileBlock.textContent = user.block || "";
  profileApartment.textContent = user.apartment || "";
  profilePhone.textContent = user.phone || "Não informado";
}

function fillProfileForm(user) {
  profileForm.elements.name.value = user.name || "";
  profileForm.elements.email.value = user.email || "";
  profileForm.elements.block.value = user.block || "";
  profileForm.elements.apartment.value = user.apartment || "";
  profileForm.elements.phone.value = user.phone || "";
}

function setProfileEditing(isEditing) {
  isEditingProfile = isEditing;

  profileView.classList.toggle("hidden", isEditing);
  profileForm.classList.toggle("hidden", !isEditing);

  profileForm.elements.name.readOnly = !isEditing;
  profileForm.elements.email.readOnly = !isEditing;
  profileForm.elements.apartment.readOnly = !isEditing;
  profileForm.elements.phone.readOnly = !isEditing;
  profileForm.elements.block.disabled = !isEditing;

  saveProfileButton.classList.toggle("hidden", !isEditing);
  cancelProfileButton.classList.toggle("hidden", !isEditing);
}

function renderPublicStats() {
  const statsData = state.publicStats;
  if (!statsData) {
    sessionSummary.textContent =
      "Visão geral das trocas do condomínio.\nNenhuma atualização de figurinhas foi registrada ainda.";
    publicStats.innerHTML = `<article class="stat"><strong>0</strong><span>dados ainda indisponíveis</span></article>`;
    publicTopAvailable.innerHTML = `<div class="empty-state">Ainda sem estatísticas públicas.</div>`;
    publicTopDemanded.innerHTML = `<div class="empty-state">Ainda sem estatísticas públicas.</div>`;
    return;
  }

  sessionSummary.textContent = buildPublicSessionSummary(statsData.latestCollectionUpdate);

  publicStats.innerHTML = `
    <article class="stat">
      <strong>${statsData.registeredUsers}</strong>
      <span>moradores cadastrados</span>
    </article>
    <article class="stat">
      <strong>${statsData.totalDuplicateEntries}</strong>
      <span>figurinhas repetidas cadastradas</span>
    </article>
    <article class="stat">
      <strong>${statsData.matchableStickerCodes}</strong>
      <span>figurinhas com oferta e demanda</span>
    </article>
    <article class="stat">
      <strong>${statsData.possibleTradeConnections}</strong>
      <span>conexões de troca possíveis</span>
    </article>
  `;

  renderInsightList(publicTopAvailable, statsData.topAvailable, "owners", "moradores com repetida", "needers");
  renderInsightList(publicTopDemanded, statsData.topDemanded, "needers", "moradores precisando", "owners");
}

function buildPublicSessionSummary(update) {
  if (!update || !update.updatedAt) {
    return "Visão geral das trocas do condomínio.\n\nNenhuma atualização de figurinhas foi registrada ainda.";
  }

  const formattedDate = formatDateTime(update.updatedAt);
  return `Visão geral das trocas do condomínio.\n\nÚltima atualização: ${update.name} · Bloco ${update.block} · Apto ${update.apartment} · ${formattedDate}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function renderInsightList(container, items, primaryKey, primaryLabel, secondaryKey) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">Ainda não há dados suficientes para montar este ranking.</div>`;
    return;
  }

  const maxValue = Math.max(...items.map((item) => item[primaryKey]), 1);
  container.innerHTML = items
    .map((item) => {
      const width = Math.max((item[primaryKey] / maxValue) * 100, 8);
      return `
        <article class="insight-row">
          <div class="insight-row-top">
            <strong>${item.code}</strong>
            <span>${item[primaryKey]} ${primaryLabel}</span>
          </div>
          <div class="insight-bar-track">
            <div class="insight-bar-fill" style="width: ${width}%"></div>
          </div>
          <p class="match-meta">
            ${item[secondaryKey] || 0} do outro lado da troca
          </p>
        </article>
      `;
    })
    .join("");
}

function renderStats() {
  const total = state.album.meta.totalStickers;
  const missing = state.missingStickers.size;
  const duplicates = Object.values(state.duplicateStickerQuantities).reduce(
    (sum, quantity) => sum + quantity,
    0
  );
  const owned = total - missing;

  stats.innerHTML = `
    <article class="stat">
      <strong>${owned}</strong>
      <span>já marcadas como no álbum</span>
    </article>
    <article class="stat">
      <strong>${missing}</strong>
      <span>faltando para completar</span>
    </article>
    <article class="stat">
      <strong>${duplicates}</strong>
      <span>repetidas para trocar</span>
    </article>
  `;
}

function renderChecklist(kind) {
  const container = kind === "missing" ? missingList : duplicateList;
  const selectedSet = kind === "missing" ? state.missingStickers : state.duplicateStickers;
  const oppositeSet = kind === "missing" ? state.duplicateStickers : state.missingStickers;
  const openGroups = state.openGroups[kind];
  const query = (kind === "missing" ? missingSearch.value : duplicateSearch.value).trim().toLowerCase();

  const sectionsMarkup = state.album.sections
    .map((section) => {
      const filtered = section.stickers.filter((sticker) => {
        const haystack = `${sticker.code} ${sticker.title} ${section.name}`.toLowerCase();
        return !query || haystack.includes(query);
      });

      if (filtered.length === 0) {
        return "";
      }

      const countInSection = filtered.filter((sticker) => selectedSet.has(sticker.code)).length;

      const items = filtered
        .map(
          (sticker) => {
            if (kind === "duplicate") {
              const quantity = state.duplicateStickerQuantities[sticker.code] || 1;
              const checked = selectedSet.has(sticker.code);

              return `
                <div class="sticker-pill sticker-pill-duplicate ${checked ? "selected" : ""}">
                  <label class="sticker-pill-toggle">
                    <input
                      type="checkbox"
                      data-kind="${kind}"
                      data-code="${sticker.code}"
                      ${checked ? "checked" : ""}
                    />
                    <span>${sticker.code}</span>
                  </label>
                  <input
                    type="number"
                    class="sticker-quantity ${checked ? "" : "hidden"}"
                    data-quantity-code="${sticker.code}"
                    min="1"
                    max="9"
                    step="1"
                    inputmode="numeric"
                    value="${quantity}"
                  />
                </div>
              `;
            }

            return `
              <label class="sticker-pill">
                <input
                  type="checkbox"
                  data-kind="${kind}"
                  data-code="${sticker.code}"
                  ${selectedSet.has(sticker.code) ? "checked" : ""}
                />
                <span>${sticker.code}</span>
              </label>
            `;
          }
        )
        .join("");

      return `
        <section class="group ${query || openGroups.has(section.name) ? "open" : ""}" data-section-name="${section.name}">
          <button type="button" class="group-toggle" aria-expanded="${query || openGroups.has(section.name) ? "true" : "false"}">
            <span>${section.name}</span>
            <span>${countInSection}/${section.stickers.length}</span>
          </button>
          <div class="group-items">${items}</div>
        </section>
      `;
    })
    .join("");

  container.innerHTML = sectionsMarkup || `<p class="empty-state">Nenhuma figurinha encontrada.</p>`;

  container.querySelectorAll(".group").forEach((group) => {
    const toggleButton = group.querySelector(".group-toggle");
    const itemsPanel = group.querySelector(".group-items");

    itemsPanel?.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    itemsPanel?.addEventListener("mousedown", (event) => {
      event.stopPropagation();
    });

    toggleButton?.addEventListener("click", () => {
      const sectionName = group.dataset.sectionName;
      if (!sectionName || query) {
        return;
      }

      const shouldOpen = !group.classList.contains("open");
      group.classList.toggle("open", shouldOpen);
      toggleButton.setAttribute("aria-expanded", String(shouldOpen));

      if (shouldOpen) {
        openGroups.add(sectionName);
        return;
      }

      openGroups.delete(sectionName);
    });
  });

  container.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    checkbox.addEventListener("mousedown", (event) => {
      event.stopPropagation();
    });

    checkbox.addEventListener("change", () => {
      const code = checkbox.dataset.code;
      const currentKind = checkbox.dataset.kind;
      const activeSet = currentKind === "missing" ? state.missingStickers : state.duplicateStickers;
      const group = checkbox.closest(".group");
      const sectionName = group?.dataset.sectionName;
      const toggleButton = group?.querySelector(".group-toggle");

      if (checkbox.checked) {
        activeSet.add(code);
        oppositeSet.delete(code);
        if (currentKind === "duplicate") {
          state.duplicateStickerQuantities[code] = state.duplicateStickerQuantities[code] || 1;
        }
      } else {
        activeSet.delete(code);
        if (currentKind === "duplicate") {
          delete state.duplicateStickerQuantities[code];
        }
      }

      if (sectionName) {
        state.openGroups[currentKind].add(sectionName);
        group?.classList.add("open");
        toggleButton?.setAttribute("aria-expanded", "true");
      }

      renderStats();
      syncOppositeChecklist(code, currentKind);
      refreshChecklistCounts("missing");
      refreshChecklistCounts("duplicate");
      syncDuplicateQuantityField(checkbox);
    });
  });

  container.querySelectorAll(".sticker-quantity").forEach((input) => {
    input.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    input.addEventListener("mousedown", (event) => {
      event.stopPropagation();
    });

    input.addEventListener("input", () => {
      const code = input.dataset.quantityCode;
      const normalizedQuantity = normalizeDuplicateQuantity(input.value);
      input.value = String(normalizedQuantity);
      state.duplicateStickerQuantities[code] = normalizedQuantity;
      renderStats();
    });

    input.addEventListener("change", () => {
      const code = input.dataset.quantityCode;
      const normalizedQuantity = normalizeDuplicateQuantity(input.value);
      input.value = String(normalizedQuantity);
      state.duplicateStickerQuantities[code] = normalizedQuantity;
      renderStats();
    });
  });
}

function syncOppositeChecklist(code, currentKind) {
  const oppositeKind = currentKind === "missing" ? "duplicate" : "missing";
  const oppositeContainer = oppositeKind === "missing" ? missingList : duplicateList;
  const oppositeCheckbox = oppositeContainer.querySelector(
    `input[type="checkbox"][data-kind="${oppositeKind}"][data-code="${code}"]`
  );

  if (oppositeCheckbox) {
    oppositeCheckbox.checked = false;
    syncDuplicateQuantityField(oppositeCheckbox);
  }

  if (oppositeKind === "duplicate") {
    delete state.duplicateStickerQuantities[code];
  }
}

function refreshChecklistCounts(kind) {
  const container = kind === "missing" ? missingList : duplicateList;
  const selectedSet = kind === "missing" ? state.missingStickers : state.duplicateStickers;

  container.querySelectorAll(".group").forEach((group) => {
    const sectionName = group.dataset.sectionName;
    const section = state.album.sections.find((item) => item.name === sectionName);
    const counter = group.querySelector(".group-toggle span:last-child");

    if (!section || !counter) {
      return;
    }

    const countInSection = section.stickers.filter((sticker) => selectedSet.has(sticker.code)).length;
    counter.textContent = `${countInSection}/${section.stickers.length}`;
  });
}

function syncDuplicateQuantityField(checkbox) {
  if (checkbox.dataset.kind !== "duplicate") {
    return;
  }

  const wrapper = checkbox.closest(".sticker-pill-duplicate");
  const quantityInput = wrapper?.querySelector(".sticker-quantity");

  if (!wrapper || !quantityInput) {
    return;
  }

  wrapper.classList.toggle("selected", checkbox.checked);
  quantityInput.classList.toggle("hidden", !checkbox.checked);

  if (checkbox.checked) {
    const quantity = state.duplicateStickerQuantities[checkbox.dataset.code] || 1;
    quantityInput.value = String(quantity);
    return;
  }

  quantityInput.value = "1";
}

function normalizeDuplicateQuantity(value) {
  return Math.max(1, Math.min(9, Number.parseInt(value, 10) || 1));
}

async function refreshMatches() {
  if (!state.currentUser) {
    return;
  }

  const result = await request("/api/matches");
  if (!result.ok) {
    matchesList.innerHTML = `<p class="empty-state">${result.error}</p>`;
    return;
  }

  if (result.matches.length === 0) {
    matchesList.innerHTML = `
      <div class="empty-state">
        Ainda não apareceu combinação. Conforme mais vizinhos cadastrarem repetidas, os matches vão surgir aqui.
      </div>
    `;
    return;
  }

  matchesList.innerHTML = result.matches
    .map((match) => {
      const phone = match.user.phone ? `Celular: ${match.user.phone}` : "Celular não informado";
      const mutual = match.mutualTrade.length
        ? `
          <div class="match-chip-row">
            ${match.mutualTrade.map((code) => `<span class="chip alt">${code}</span>`).join("")}
          </div>
        `
        : `<p class="match-meta">Você ainda não marcou repetidas que interessem a esta pessoa.</p>`;

      return `
        <article class="match-card">
          <h4>${match.user.name}</h4>
          <p class="match-meta">
            Bloco ${match.user.block} · Apto ${match.user.apartment} · ${phone} · ${match.user.email}
          </p>

          <p><strong>Ela tem para você:</strong></p>
          <div class="match-chip-row">
            ${match.theyCanHelp.map((code) => `<span class="chip">${code}</span>`).join("")}
          </div>

          <p><strong>Possível troca de volta:</strong></p>
          ${mutual}
        </article>
      `;
    })
    .join("");
}

function showFeedback(message, isError = false) {
  authFeedback.textContent = message || "";
  authFeedback.style.color = isError ? "var(--warning)" : "var(--accent-strong)";
}

function showToast(message) {
  if (!toast) {
    return;
  }

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toast.textContent = message;
  toast.classList.remove("hidden");
  toast.classList.add("visible");

  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
    toast.classList.add("hidden");
    toastTimer = null;
  }, 3000);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json();
  return {
    ok: response.ok,
    ...data
  };
}
