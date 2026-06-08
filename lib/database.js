const mysql = require("mysql2/promise");
const fs = require("fs");

function buildSslConfig() {
  if (process.env.DB_SSL !== "true") {
    return undefined;
  }

  if (process.env.DB_SSL_CA_PATH) {
    return {
      ca: fs.readFileSync(process.env.DB_SSL_CA_PATH, "utf8"),
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false"
    };
  }

  return {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false"
  };
}

const DB_CONFIG = {
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "album_user",
  password: process.env.DB_PASSWORD || "album_pass",
  database: process.env.DB_NAME || "album_copa",
  connectionLimit: 10,
  ssl: buildSslConfig()
};

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
  }

  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function withTransaction(callback) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      apartment VARCHAR(40) NOT NULL,
      block_name VARCHAR(40) NOT NULL,
      phone VARCHAR(40) NULL,
      password_hash VARCHAR(255) NOT NULL,
      password_salt VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL
    )
  `);

  await ensureColumnExists("users", "collection_updated_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");

  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(64) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      created_at DATETIME NOT NULL,
      CONSTRAINT fk_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS user_stickers (
      user_id CHAR(36) NOT NULL,
      sticker_code VARCHAR(24) NOT NULL,
      sticker_type ENUM('missing', 'duplicate') NOT NULL,
      PRIMARY KEY (user_id, sticker_code, sticker_type),
      INDEX idx_sticker_lookup (sticker_code, sticker_type),
      CONSTRAINT fk_stickers_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admins (
      id CHAR(36) PRIMARY KEY,
      username VARCHAR(80) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      password_salt VARCHAR(255) NOT NULL,
      must_change_password TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token VARCHAR(64) PRIMARY KEY,
      admin_id CHAR(36) NOT NULL,
      created_at DATETIME NOT NULL,
      CONSTRAINT fk_admin_sessions_admin
        FOREIGN KEY (admin_id) REFERENCES admins(id)
        ON DELETE CASCADE
    )
  `);
}

async function ensureColumnExists(tableName, columnName, definition) {
  const rows = await query(
    `
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [DB_CONFIG.database, tableName, columnName]
  );

  if (rows.length === 0) {
    await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function waitForDatabase(maxAttempts = 20, delayMs = 3000) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await initDatabase();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

function mapUserRow(row, stickers = []) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    apartment: row.apartment,
    block: row.block_name,
    phone: row.phone,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at,
    collectionUpdatedAt: row.collection_updated_at,
    missingStickers: stickers.filter((item) => item.sticker_type === "missing").map((item) => item.sticker_code),
    duplicateStickers: stickers
      .filter((item) => item.sticker_type === "duplicate")
      .map((item) => item.sticker_code)
  };
}

async function getUserStickers(userId, connection = null) {
  const executor = connection || getPool();
  const [rows] = await executor.execute(
    `
      SELECT sticker_code, sticker_type
      FROM user_stickers
      WHERE user_id = ?
      ORDER BY sticker_type, sticker_code
    `,
    [userId]
  );

  return rows;
}

async function getUserByEmail(email) {
  const rows = await query(
    `
      SELECT id, name, email, apartment, block_name, phone, password_hash, password_salt, created_at, collection_updated_at
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapUserRow(rows[0], await getUserStickers(rows[0].id));
}

async function getUserByUnit(block, apartment) {
  const rows = await query(
    `
      SELECT id, name, email, apartment, block_name, phone, password_hash, password_salt, created_at, collection_updated_at
      FROM users
      WHERE block_name = ? AND apartment = ?
      LIMIT 1
    `,
    [block, apartment]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapUserRow(rows[0], await getUserStickers(rows[0].id));
}

async function getUserById(userId) {
  const rows = await query(
    `
      SELECT id, name, email, apartment, block_name, phone, password_hash, password_salt, created_at, collection_updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapUserRow(rows[0], await getUserStickers(rows[0].id));
}

async function createUser(user) {
  await query(
    `
      INSERT INTO users (
        id, name, email, apartment, block_name, phone, password_hash, password_salt, created_at, collection_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      user.id,
      user.name,
      user.email,
      user.apartment,
      user.block,
      user.phone || null,
      user.passwordHash,
      user.passwordSalt,
      user.createdAt,
      user.collectionUpdatedAt || user.createdAt
    ]
  );

  await replaceUserCollection(
    user.id,
    user.missingStickers,
    user.duplicateStickers,
    user.collectionUpdatedAt || user.createdAt
  );
  return getUserById(user.id);
}

async function replaceUserCollection(
  userId,
  missingStickers,
  duplicateStickers,
  updatedAt = new Date().toISOString().slice(0, 19).replace("T", " ")
) {
  await withTransaction(async (connection) => {
    await connection.execute(`DELETE FROM user_stickers WHERE user_id = ?`, [userId]);

    const values = [
      ...missingStickers.map((code) => [userId, code, "missing"]),
      ...duplicateStickers.map((code) => [userId, code, "duplicate"])
    ];

    if (values.length > 0) {
      await connection.query(
        `
          INSERT INTO user_stickers (user_id, sticker_code, sticker_type)
          VALUES ?
        `,
        [values]
      );
    }

    await connection.execute(`UPDATE users SET collection_updated_at = ? WHERE id = ?`, [updatedAt, userId]);
  });
}

async function createSession(userId, token, createdAt) {
  await withTransaction(async (connection) => {
    await connection.execute(`DELETE FROM sessions WHERE user_id = ?`, [userId]);
    await connection.execute(
      `
        INSERT INTO sessions (token, user_id, created_at)
        VALUES (?, ?, ?)
      `,
      [token, userId, createdAt]
    );
  });
}

async function deleteSession(token) {
  await query(`DELETE FROM sessions WHERE token = ?`, [token]);
}

async function getSessionUser(token) {
  const rows = await query(
    `
      SELECT
        u.id,
        u.name,
        u.email,
        u.apartment,
        u.block_name,
        u.phone,
        u.password_hash,
        u.password_salt,
        u.created_at,
        u.collection_updated_at
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
      LIMIT 1
    `,
    [token]
  );

  if (rows.length === 0) {
    return null;
  }

  return getUserById(rows[0].id);
}

async function listUsersWithCollections() {
  const userRows = await query(
    `
      SELECT id, name, email, apartment, block_name, phone, password_hash, password_salt, created_at, collection_updated_at
      FROM users
      ORDER BY name
    `
  );

  if (userRows.length === 0) {
    return [];
  }

  const stickers = await query(
    `
      SELECT user_id, sticker_code, sticker_type
      FROM user_stickers
      ORDER BY user_id, sticker_type, sticker_code
    `
  );

  const stickersByUser = stickers.reduce((map, row) => {
    if (!map.has(row.user_id)) {
      map.set(row.user_id, []);
    }
    map.get(row.user_id).push(row);
    return map;
  }, new Map());

  return userRows.map((row) => mapUserRow(row, stickersByUser.get(row.id) || []));
}

async function updateUser(user) {
  await query(
    `
      UPDATE users
      SET name = ?, email = ?, apartment = ?, block_name = ?, phone = ?
      WHERE id = ?
    `,
    [user.name, user.email, user.apartment, user.block, user.phone || null, user.id]
  );

  const currentUser = await getUserById(user.id);
  const missingChanged =
    JSON.stringify(currentUser?.missingStickers || []) !== JSON.stringify(user.missingStickers || []);
  const duplicatesChanged =
    JSON.stringify(currentUser?.duplicateStickers || []) !== JSON.stringify(user.duplicateStickers || []);

  if (missingChanged || duplicatesChanged) {
    await replaceUserCollection(user.id, user.missingStickers, user.duplicateStickers);
  }

  return getUserById(user.id);
}

async function deleteUser(userId) {
  await query(`DELETE FROM users WHERE id = ?`, [userId]);
}

async function getAdminByUsername(username) {
  const rows = await query(
    `
      SELECT id, username, password_hash, password_salt, must_change_password, created_at, updated_at
      FROM admins
      WHERE username = ?
      LIMIT 1
    `,
    [username]
  );

  return rows[0] || null;
}

async function getAdminById(adminId) {
  const rows = await query(
    `
      SELECT id, username, password_hash, password_salt, must_change_password, created_at, updated_at
      FROM admins
      WHERE id = ?
      LIMIT 1
    `,
    [adminId]
  );

  return rows[0] || null;
}

async function createAdmin(admin) {
  await query(
    `
      INSERT INTO admins (
        id, username, password_hash, password_salt, must_change_password, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      admin.id,
      admin.username,
      admin.passwordHash,
      admin.passwordSalt,
      admin.mustChangePassword ? 1 : 0,
      admin.createdAt,
      admin.updatedAt
    ]
  );
}

async function ensureDefaultAdmin(admin) {
  const existing = await getAdminByUsername(admin.username);
  if (!existing) {
    await createAdmin(admin);
  }
}

async function createAdminSession(adminId, token, createdAt) {
  await withTransaction(async (connection) => {
    await connection.execute(`DELETE FROM admin_sessions WHERE admin_id = ?`, [adminId]);
    await connection.execute(
      `
        INSERT INTO admin_sessions (token, admin_id, created_at)
        VALUES (?, ?, ?)
      `,
      [token, adminId, createdAt]
    );
  });
}

async function deleteAdminSession(token) {
  await query(`DELETE FROM admin_sessions WHERE token = ?`, [token]);
}

async function getSessionAdmin(token) {
  const rows = await query(
    `
      SELECT a.id
      FROM admin_sessions s
      INNER JOIN admins a ON a.id = s.admin_id
      WHERE s.token = ?
      LIMIT 1
    `,
    [token]
  );

  if (rows.length === 0) {
    return null;
  }

  return getAdminById(rows[0].id);
}

async function updateAdminPassword(adminId, passwordHash, passwordSalt) {
  await query(
    `
      UPDATE admins
      SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = ?
      WHERE id = ?
    `,
    [passwordHash, passwordSalt, new Date().toISOString().slice(0, 19).replace("T", " "), adminId]
  );
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  DB_CONFIG,
  getPool,
  query,
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
  getAdminById,
  ensureDefaultAdmin,
  createAdminSession,
  deleteAdminSession,
  getSessionAdmin,
  updateAdminPassword,
  closePool
};
