const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const {
  album,
  normalizeEmail,
  hashPassword,
  createPasswordRecord,
  sanitizeStickerCodes,
  sanitizeDuplicateStickerQuantities,
  deriveDuplicateStickerList,
  publicUser,
  buildMatchList,
  buildPublicStats
} = require("./lib/core");
const {
  waitForDatabase,
  getUserByEmail,
  getUserByUnit,
  getUserById,
  createUser,
  replaceUserCollection,
  updateUser,
  deleteUser,
  createSession,
  deleteSession,
  getSessionUser,
  listUsersWithCollections,
  getAdminByUsername,
  ensureDefaultAdmin,
  createAdminSession,
  deleteAdminSession,
  getSessionAdmin,
  updateAdminPassword
} = require("./lib/database");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, body, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    ...extraHeaders
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const extension = path.extname(filePath);
  const contentType = MIME_TYPES[extension] || "application/octet-stream";

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      sendJson(res, 404, { error: "Arquivo não encontrado." });
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(buffer);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((cookies, chunk) => {
    const trimmed = chunk.trim();
    if (!trimmed) {
      return cookies;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return cookies;
    }

    const key = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload muito grande."));
      }
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("JSON inválido."));
      }
    });

    req.on("error", reject);
  });
}

async function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.session_token;
  if (!token) {
    return null;
  }

  const user = await getSessionUser(token);
  if (!user) {
    return null;
  }

  return { user, token };
}

async function getCurrentAdmin(req) {
  const cookies = parseCookies(req);
  const token = cookies.admin_session_token;
  if (!token) {
    return null;
  }

  const admin = await getSessionAdmin(token);
  if (!admin) {
    return null;
  }

  return { admin, token };
}

async function requireAuth(req, res) {
  const session = await getCurrentUser(req);
  if (!session) {
    sendJson(res, 401, { error: "Você precisa entrar para continuar." });
    return null;
  }
  return session;
}

async function requireAdmin(req, res) {
  const session = await getCurrentAdmin(req);
  if (!session) {
    sendJson(res, 401, { error: "Você precisa entrar como administrador." });
    return null;
  }

  return session;
}

function formatSqlDate(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function isValidApartment(apartment) {
  if (!/^\d+$/.test(apartment)) {
    return false;
  }

  const apartmentNumber = Number.parseInt(apartment, 10);
  return apartmentNumber >= 1 && apartmentNumber <= 228;
}

function extractUserPayload(body) {
  const name = String(body.name || "").trim();
  const email = normalizeEmail(body.email);
  const apartment = String(body.apartment || "").trim();
  const block = String(body.block || "").trim();
  const phone = String(body.phone || "").trim();
  const duplicateStickerQuantities = sanitizeDuplicateStickerQuantities(body.duplicateStickerQuantities);
  const legacyDuplicateStickers = sanitizeStickerCodes(body.duplicateStickers);
  const normalizedDuplicateStickerQuantities =
    Object.keys(duplicateStickerQuantities).length > 0
      ? duplicateStickerQuantities
      : legacyDuplicateStickers.reduce((result, code) => {
          result[code] = 1;
          return result;
        }, {});
  const duplicateStickers = deriveDuplicateStickerList(normalizedDuplicateStickerQuantities);
  const missingStickers = sanitizeStickerCodes(body.missingStickers).filter(
    (code) => !duplicateStickers.includes(code)
  );

  return {
    name,
    email,
    apartment,
    block,
    phone,
    duplicateStickerQuantities: normalizedDuplicateStickerQuantities,
    missingStickers
  };
}

function parseUserIdFromAdminPath(pathname) {
  const match = pathname.match(/^\/api\/admin\/users\/([0-9a-f-]+)$/i);
  return match ? match[1] : null;
}

function escapeCsv(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function buildCollectionCsv(user) {
  const missing = [...(user.missingStickers || [])];
  const duplicates = [...(user.duplicateStickers || [])].map((code) => {
    const quantity = user.duplicateStickerQuantities?.[code] || 1;
    return quantity > 1 ? `${code} (x${quantity})` : code;
  });
  const totalRows = Math.max(missing.length, duplicates.length, 1);

  const rows = Array.from({ length: totalRows }, (_, index) => {
    const missingValue = missing[index] || "";
    const duplicateValue = duplicates[index] || "";
    return [missingValue, duplicateValue];
  });

  return [
    ["Figurinhas faltantes", "Figurinhas repetidas"],
    ...rows
  ]
    .map((columns) => columns.map((value) => escapeCsv(value)).join(","))
    .join("\n");
}

function formatDuplicateStickerExport(user) {
  return (user.duplicateStickers || [])
    .map((code) => {
      const quantity = user.duplicateStickerQuantities?.[code] || 1;
      return `${code} (x${quantity})`;
    })
    .join(" | ");
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/stickers") {
    sendJson(res, 200, album);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/public-stats") {
    const users = await listUsersWithCollections();
    sendJson(res, 200, {
      stats: buildPublicStats(users)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/register") {
    const body = await parseRequestBody(req);
    const { name, email, apartment, block, phone, duplicateStickerQuantities, missingStickers } =
      extractUserPayload(body);
    const password = String(body.password || "");

    if (!name || !email || !password || !apartment || !block) {
      sendJson(res, 400, { error: "Nome, e-mail, senha, apartamento e bloco são obrigatórios." });
      return;
    }

    if (!isValidApartment(apartment)) {
      sendJson(res, 400, { error: "Apartamento deve ser um número entre 1 e 228." });
      return;
    }

    if (password.length < 6) {
      sendJson(res, 400, { error: "A senha precisa ter pelo menos 6 caracteres." });
      return;
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      sendJson(res, 409, { error: "Já existe um cadastro com este e-mail." });
      return;
    }

    const existingUnit = await getUserByUnit(block, apartment);
    if (existingUnit) {
      sendJson(res, 409, { error: "Já existe um cadastro para este bloco e apartamento." });
      return;
    }

    const passwordRecord = createPasswordRecord(password);
    const createdUser = await createUser({
      id: crypto.randomUUID(),
      name,
      email,
      apartment,
      block,
      phone,
      missingStickers,
      duplicateStickers: deriveDuplicateStickerList(duplicateStickerQuantities),
      duplicateStickerQuantities,
      passwordHash: passwordRecord.hash,
      passwordSalt: passwordRecord.salt,
      createdAt: formatSqlDate()
    });

    const token = crypto.randomBytes(24).toString("hex");
    await createSession(createdUser.id, token, formatSqlDate());

    sendJson(
      res,
      201,
      { user: publicUser(createdUser) },
      {
        "Set-Cookie": `session_token=${token}; HttpOnly; Path=/; SameSite=Lax`
      }
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await parseRequestBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const user = await getUserByEmail(email);

    if (!user) {
      sendJson(res, 401, { error: "E-mail ou senha inválidos." });
      return;
    }

    const hash = hashPassword(password, user.passwordSalt);
    if (hash !== user.passwordHash) {
      sendJson(res, 401, { error: "E-mail ou senha inválidos." });
      return;
    }

    const token = crypto.randomBytes(24).toString("hex");
    await createSession(user.id, token, formatSqlDate());
    sendJson(
      res,
      200,
      { user: publicUser(user) },
      {
        "Set-Cookie": `session_token=${token}; HttpOnly; Path=/; SameSite=Lax`
      }
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const session = await getCurrentUser(req);
    if (session) {
      await deleteSession(session.token);
    }

    sendJson(
      res,
      200,
      { ok: true },
      {
        "Set-Cookie": "session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
      }
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/session") {
    const session = await getCurrentUser(req);
    sendJson(res, 200, { user: session ? publicUser(session.user) : null });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/my-collection") {
    const session = await requireAuth(req, res);
    if (!session) {
      return;
    }

    sendJson(res, 200, {
      missingStickers: session.user.missingStickers || [],
      duplicateStickers: session.user.duplicateStickers || [],
      duplicateStickerQuantities: session.user.duplicateStickerQuantities || {}
    });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/profile") {
    const session = await requireAuth(req, res);
    if (!session) {
      return;
    }

    const body = await parseRequestBody(req);
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const apartment = String(body.apartment || "").trim();
    const block = String(body.block || "").trim();
    const phone = String(body.phone || "").trim();

    if (!name || !email || !apartment || !block) {
      sendJson(res, 400, { error: "Nome, e-mail, apartamento e bloco são obrigatórios." });
      return;
    }

    if (!isValidApartment(apartment)) {
      sendJson(res, 400, { error: "Apartamento deve ser um número entre 1 e 228." });
      return;
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser && existingUser.id !== session.user.id) {
      sendJson(res, 409, { error: "Já existe outro usuário com este e-mail." });
      return;
    }

    const existingUnit = await getUserByUnit(block, apartment);
    if (existingUnit && existingUnit.id !== session.user.id) {
      sendJson(res, 409, { error: "Já existe outro usuário para este bloco e apartamento." });
      return;
    }

    const updatedUser = await updateUser({
      id: session.user.id,
      name,
      email,
      apartment,
      block,
      phone,
      missingStickers: session.user.missingStickers,
      duplicateStickers: session.user.duplicateStickers,
      duplicateStickerQuantities: session.user.duplicateStickerQuantities
    });

    sendJson(res, 200, { user: publicUser(updatedUser) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/my-collection/export") {
    const session = await requireAuth(req, res);
    if (!session) {
      return;
    }

    const fileName = `minhas-figurinhas-${session.user.block.toLowerCase()}-${session.user.apartment}.csv`;
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`
    });
    res.end(`\uFEFF${buildCollectionCsv(session.user)}`);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/my-collection") {
    const session = await requireAuth(req, res);
    if (!session) {
      return;
    }

    const body = await parseRequestBody(req);
    const duplicateStickerQuantities = (() => {
      const normalized = sanitizeDuplicateStickerQuantities(body.duplicateStickerQuantities);
      if (Object.keys(normalized).length > 0) {
        return normalized;
      }

      return sanitizeStickerCodes(body.duplicateStickers).reduce((result, code) => {
        result[code] = 1;
        return result;
      }, {});
    })();
    const duplicateStickers = deriveDuplicateStickerList(duplicateStickerQuantities);
    const missingStickers = sanitizeStickerCodes(body.missingStickers).filter(
      (code) => !duplicateStickers.includes(code)
    );

    await replaceUserCollection(session.user.id, missingStickers, duplicateStickerQuantities);
    const refreshedUser = await getUserById(session.user.id);

    sendJson(res, 200, { user: publicUser(refreshedUser) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/matches") {
    const session = await requireAuth(req, res);
    if (!session) {
      return;
    }

    const users = await listUsersWithCollections();
    sendJson(res, 200, {
      matches: buildMatchList(session.user, users)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await parseRequestBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const admin = await getAdminByUsername(username);

    if (!admin) {
      sendJson(res, 401, { error: "Usuário ou senha inválidos." });
      return;
    }

    const hash = hashPassword(password, admin.password_salt);
    if (hash !== admin.password_hash) {
      sendJson(res, 401, { error: "Usuário ou senha inválidos." });
      return;
    }

    const token = crypto.randomBytes(24).toString("hex");
    await createAdminSession(admin.id, token, formatSqlDate());

    sendJson(
      res,
      200,
      {
        admin: {
          id: admin.id,
          username: admin.username,
          mustChangePassword: Boolean(admin.must_change_password)
        }
      },
      {
        "Set-Cookie": `admin_session_token=${token}; HttpOnly; Path=/; SameSite=Lax`
      }
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/logout") {
    const session = await getCurrentAdmin(req);
    if (session) {
      await deleteAdminSession(session.token);
    }

    sendJson(
      res,
      200,
      { ok: true },
      {
        "Set-Cookie": "admin_session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
      }
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/session") {
    const session = await getCurrentAdmin(req);
    sendJson(res, 200, {
      admin: session
        ? {
            id: session.admin.id,
            username: session.admin.username,
            mustChangePassword: Boolean(session.admin.must_change_password)
          }
        : null
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/change-password") {
    const session = await requireAdmin(req, res);
    if (!session) {
      return;
    }

    const body = await parseRequestBody(req);
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");

    if (newPassword.length < 8) {
      sendJson(res, 400, { error: "A nova senha do admin precisa ter pelo menos 8 caracteres." });
      return;
    }

    const currentHash = hashPassword(currentPassword, session.admin.password_salt);
    if (currentHash !== session.admin.password_hash) {
      sendJson(res, 401, { error: "Senha atual inválida." });
      return;
    }

    const passwordRecord = createPasswordRecord(newPassword);
    await updateAdminPassword(session.admin.id, passwordRecord.hash, passwordRecord.salt);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/users") {
    const session = await requireAdmin(req, res);
    if (!session) {
      return;
    }

    const users = await listUsersWithCollections();
    sendJson(res, 200, { users: users.map(publicUser) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/export") {
    const session = await requireAdmin(req, res);
    if (!session) {
      return;
    }

    const users = await listUsersWithCollections();
    const format = (url.searchParams.get("format") || "json").toLowerCase();

    if (format === "csv") {
      const header = [
        "id",
        "nome",
        "email",
        "bloco",
        "apartamento",
        "celular",
        "faltantes",
        "repetidas"
      ];
      const rows = users.map((user) =>
        [
          user.id,
          user.name,
          user.email,
          user.block,
          user.apartment,
          user.phone || "",
          user.missingStickers.join(" | "),
          formatDuplicateStickerExport(user)
        ]
          .map(escapeCsv)
          .join(",")
      );

      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="usuarios-album-copa.csv"'
      });
      res.end([header.join(","), ...rows].join("\n"));
      return;
    }

    sendJson(
      res,
      200,
      { exportedAt: new Date().toISOString(), users: users.map(publicUser) },
      {
        "Content-Disposition": 'attachment; filename="usuarios-album-copa.json"'
      }
    );
    return;
  }

  const adminUserId = parseUserIdFromAdminPath(url.pathname);
  if (adminUserId && req.method === "PUT") {
    const session = await requireAdmin(req, res);
    if (!session) {
      return;
    }

    const currentUser = await getUserById(adminUserId);
    if (!currentUser) {
      sendJson(res, 404, { error: "Usuário não encontrado." });
      return;
    }

    const body = await parseRequestBody(req);
    const { name, email, apartment, block, phone, duplicateStickerQuantities, missingStickers } =
      extractUserPayload(body);

    if (!name || !email || !apartment || !block) {
      sendJson(res, 400, { error: "Nome, e-mail, apartamento e bloco são obrigatórios." });
      return;
    }

    if (!isValidApartment(apartment)) {
      sendJson(res, 400, { error: "Apartamento deve ser um número entre 1 e 228." });
      return;
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser && existingUser.id !== adminUserId) {
      sendJson(res, 409, { error: "Já existe outro usuário com este e-mail." });
      return;
    }

    const existingUnit = await getUserByUnit(block, apartment);
    if (existingUnit && existingUnit.id !== adminUserId) {
      sendJson(res, 409, { error: "Já existe outro usuário para este bloco e apartamento." });
      return;
    }

    const updatedUser = await updateUser({
      id: adminUserId,
      name,
      email,
      apartment,
      block,
      phone,
      missingStickers,
      duplicateStickers: deriveDuplicateStickerList(duplicateStickerQuantities),
      duplicateStickerQuantities
    });

    sendJson(res, 200, { user: publicUser(updatedUser) });
    return;
  }

  if (adminUserId && req.method === "DELETE") {
    const session = await requireAdmin(req, res);
    if (!session) {
      return;
    }

    const currentUser = await getUserById(adminUserId);
    if (!currentUser) {
      sendJson(res, 404, { error: "Usuário não encontrado." });
      return;
    }

    await deleteUser(adminUserId);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Rota não encontrada." });
}

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((error) => {
      sendJson(res, 500, {
        error: error.message || "Erro interno do servidor."
      });
    });
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname === "/admin" ? "/admin.html" : url.pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Acesso negado." });
    return;
  }

  sendFile(res, filePath);
}

function createServer() {
  return http.createServer(handleRequest);
}

async function startServer() {
  await waitForDatabase();
  const defaultPassword = "Admin@123";
  const passwordRecord = createPasswordRecord(defaultPassword);
  await ensureDefaultAdmin({
    id: crypto.randomUUID(),
    username: "admin",
    passwordHash: passwordRecord.hash,
    passwordSalt: passwordRecord.salt,
    mustChangePassword: true,
    createdAt: formatSqlDate(),
    updatedAt: formatSqlDate()
  });

  const server = createServer();
  await new Promise((resolve) => {
    server.listen(PORT, HOST, resolve);
  });

  console.log(`Servidor pronto em http://${HOST}:${PORT}`);
  return server;
}

module.exports = {
  HOST,
  PORT,
  album,
  createServer,
  startServer
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Falha ao iniciar a aplicação:", error);
    process.exit(1);
  });
}
