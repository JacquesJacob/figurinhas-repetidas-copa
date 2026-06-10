const crypto = require("crypto");
const { buildAlbumDataset } = require("../album-data");

const album = buildAlbumDataset();
const stickerCodeSet = new Set(album.stickers.map((sticker) => sticker.code));

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    salt,
    hash: hashPassword(password, salt)
  };
}

function sanitizeStickerCodes(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return [...new Set(list.map((item) => String(item).trim()).filter((item) => stickerCodeSet.has(item)))];
}

function sanitizeDuplicateStickerQuantities(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.entries(input).reduce((result, [code, rawQuantity]) => {
    const normalizedCode = String(code || "").trim();
    const quantity = Math.max(1, Math.min(9, Number.parseInt(rawQuantity, 10) || 0));

    if (stickerCodeSet.has(normalizedCode) && quantity >= 1) {
      result[normalizedCode] = quantity;
    }

    return result;
  }, {});
}

function deriveDuplicateStickerList(duplicateStickerQuantities) {
  return Object.keys(duplicateStickerQuantities || {}).sort();
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    apartment: user.apartment,
    block: user.block,
    phone: user.phone || "",
    missingStickers: user.missingStickers || [],
    duplicateStickers: user.duplicateStickers || [],
    duplicateStickerQuantities: user.duplicateStickerQuantities || {}
  };
}

function buildMatchList(currentUser, users) {
  const missingSet = new Set(currentUser.missingStickers || []);
  const duplicateSet = new Set(currentUser.duplicateStickers || []);

  return users
    .filter((user) => user.id !== currentUser.id)
    .map((user) => {
      const otherDuplicates = new Set(user.duplicateStickers || []);
      const otherMissing = new Set(user.missingStickers || []);
      const theyCanHelp = [...missingSet].filter((code) => otherDuplicates.has(code));
      const mutualTrade = [...duplicateSet].filter((code) => otherMissing.has(code));

      return {
        user: {
          id: user.id,
          name: user.name,
          apartment: user.apartment,
          block: user.block,
          phone: user.phone || "",
          email: user.email
        },
        theyCanHelp,
        mutualTrade
      };
    })
    .filter((entry) => entry.theyCanHelp.length > 0 || entry.mutualTrade.length > 0)
    .sort((left, right) => {
      const rightTotal = right.mutualTrade.length + right.theyCanHelp.length;
      const leftTotal = left.mutualTrade.length + left.theyCanHelp.length;
      if (rightTotal !== leftTotal) {
        return rightTotal - leftTotal;
      }

      if (right.mutualTrade.length !== left.mutualTrade.length) {
        return right.mutualTrade.length - left.mutualTrade.length;
      }

      return right.theyCanHelp.length - left.theyCanHelp.length;
    });
}

function buildPublicStats(users) {
  const duplicateOwnersBySticker = new Map();
  const missingNeedersBySticker = new Map();

  users.forEach((user) => {
    (user.duplicateStickers || []).forEach((code) => {
      if (!duplicateOwnersBySticker.has(code)) {
        duplicateOwnersBySticker.set(code, new Set());
      }
      duplicateOwnersBySticker.get(code).add(user.id);
    });

    (user.missingStickers || []).forEach((code) => {
      if (!missingNeedersBySticker.has(code)) {
        missingNeedersBySticker.set(code, new Set());
      }
      missingNeedersBySticker.get(code).add(user.id);
    });
  });

  const availableStickerCodes = [...duplicateOwnersBySticker.keys()];
  const demandedStickerCodes = [...missingNeedersBySticker.keys()];
  const matchableStickerCodes = availableStickerCodes.filter((code) => missingNeedersBySticker.has(code));

  const possibleTradeConnections = matchableStickerCodes.reduce((total, code) => {
    const owners = duplicateOwnersBySticker.get(code)?.size || 0;
    const needers = missingNeedersBySticker.get(code)?.size || 0;
    return total + owners * needers;
  }, 0);

  const topAvailable = [...duplicateOwnersBySticker.entries()]
    .map(([code, owners]) => ({
      code,
      owners: owners.size,
      needers: missingNeedersBySticker.get(code)?.size || 0
    }))
    .sort((left, right) => {
      if (right.owners !== left.owners) {
        return right.owners - left.owners;
      }
      return right.needers - left.needers;
    })
    .slice(0, 5);

  const topDemanded = [...missingNeedersBySticker.entries()]
    .map(([code, needers]) => ({
      code,
      needers: needers.size,
      owners: duplicateOwnersBySticker.get(code)?.size || 0
    }))
    .sort((left, right) => {
      if (right.needers !== left.needers) {
        return right.needers - left.needers;
      }
      return right.owners - left.owners;
    })
    .slice(0, 5);

  const latestCollectionUpdate = users
    .filter((user) => user.collectionUpdatedAt)
    .sort((left, right) => new Date(right.collectionUpdatedAt) - new Date(left.collectionUpdatedAt))[0];

  return {
    registeredUsers: users.length,
    totalDuplicateEntries: users.reduce(
      (sum, user) =>
        sum +
        Object.values(user.duplicateStickerQuantities || {}).reduce(
          (quantitySum, quantity) => quantitySum + quantity,
          0
        ),
      0
    ),
    totalMissingEntries: users.reduce((sum, user) => sum + (user.missingStickers || []).length, 0),
    uniqueAvailableStickers: availableStickerCodes.length,
    uniqueNeededStickers: demandedStickerCodes.length,
    matchableStickerCodes: matchableStickerCodes.length,
    possibleTradeConnections,
    topAvailable,
    topDemanded,
    latestCollectionUpdate: latestCollectionUpdate
      ? {
          name: latestCollectionUpdate.name,
          block: latestCollectionUpdate.block,
          apartment: latestCollectionUpdate.apartment,
          updatedAt: latestCollectionUpdate.collectionUpdatedAt
        }
      : null
  };
}

module.exports = {
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
};
