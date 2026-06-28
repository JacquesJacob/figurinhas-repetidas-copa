const crypto = require("crypto");
const { buildAlbumDataset } = require("../album-data");

const album = buildAlbumDataset();
const stickerCodeSet = new Set(album.stickers.map((sticker) => sticker.code));
const stickerOrderMap = new Map(album.stickers.map((sticker, index) => [sticker.code, index]));

function compareStickerCodesByAlbumOrder(left, right) {
  const leftIndex = stickerOrderMap.get(left);
  const rightIndex = stickerOrderMap.get(right);

  if (leftIndex === undefined && rightIndex === undefined) {
    return String(left).localeCompare(String(right), "pt-BR");
  }

  if (leftIndex === undefined) {
    return 1;
  }

  if (rightIndex === undefined) {
    return -1;
  }

  return leftIndex - rightIndex;
}

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

  return [...new Set(list.map((item) => String(item).trim()).filter((item) => stickerCodeSet.has(item)))].sort(
    compareStickerCodesByAlbumOrder
  );
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
  return Object.keys(duplicateStickerQuantities || {}).sort(compareStickerCodesByAlbumOrder);
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
          email: user.email,
          collectionUpdatedAt: user.collectionUpdatedAt || "",
          missingCount: (user.missingStickers || []).length,
          duplicateCount: Object.values(user.duplicateStickerQuantities || {}).reduce(
            (sum, quantity) => sum + quantity,
            0
          )
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
  const duplicateOwnerNamesBySticker = new Map();
  const duplicateQuantityBySticker = new Map();
  const missingNeedersBySticker = new Map();

  users.forEach((user) => {
    const quantities =
      user.duplicateStickerQuantities && Object.keys(user.duplicateStickerQuantities).length
        ? user.duplicateStickerQuantities
        : (user.duplicateStickers || []).reduce((result, code) => {
            result[code] = 1;
            return result;
          }, {});

    Object.entries(quantities).forEach(([code, quantity]) => {
      if (!duplicateOwnersBySticker.has(code)) {
        duplicateOwnersBySticker.set(code, new Set());
      }
      duplicateOwnersBySticker.get(code).add(user.id);

      if (!duplicateOwnerNamesBySticker.has(code)) {
        duplicateOwnerNamesBySticker.set(code, new Set());
      }
      duplicateOwnerNamesBySticker.get(code).add(user.name);

      duplicateQuantityBySticker.set(code, (duplicateQuantityBySticker.get(code) || 0) + quantity);
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

  const ifigEntries = album.stickers
    .map((sticker) => {
      const code = sticker.code;
      const needers = missingNeedersBySticker.get(code)?.size || 0;
      const owners = duplicateOwnersBySticker.get(code)?.size || 0;
      const copies = duplicateQuantityBySticker.get(code) || 0;
      const demandPressure = copies > 0 ? needers / copies : needers > 0 ? 1 : 0;
      const index = Math.min(
        100,
        Math.round(
          needers * 8 +
            demandPressure * 28 +
            (copies === 0 && needers > 0 ? 18 : 0)
        )
      );

      return {
        code,
        title: sticker.title,
        needers,
        owners,
        ownerNames: [...(duplicateOwnerNamesBySticker.get(code) || [])].sort((left, right) =>
          left.localeCompare(right, "pt-BR")
        ),
        copies,
        index,
        tier: classifyIFIGTier(index)
      };
    })
    .filter((item) => item.needers > 0 || item.copies > 0);

  const ifigTopRarest = ifigEntries
    .sort((left, right) => {
      if (right.index !== left.index) {
        return right.index - left.index;
      }
      if (right.needers !== left.needers) {
        return right.needers - left.needers;
      }
      if (left.copies !== right.copies) {
        return left.copies - right.copies;
      }
      return left.code.localeCompare(right.code);
    })
    .slice(0, 5);

  const ifigBySticker = ifigEntries.reduce((result, item) => {
    result[item.code] = {
      index: item.index,
      tier: item.tier
    };
    return result;
  }, {});

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
    ifigTopRarest,
    ifigBySticker,
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

function classifyIFIGTier(index) {
  if (index >= 80) {
    return "Lendária";
  }

  if (index >= 60) {
    return "Muito rara";
  }

  if (index >= 40) {
    return "Rara";
  }

  if (index >= 20) {
    return "Disputada";
  }

  return "Disponível";
}

module.exports = {
  album,
  normalizeEmail,
  hashPassword,
  createPasswordRecord,
  sanitizeStickerCodes,
  sanitizeDuplicateStickerQuantities,
  deriveDuplicateStickerList,
  compareStickerCodesByAlbumOrder,
  publicUser,
  buildMatchList,
  buildPublicStats
};
