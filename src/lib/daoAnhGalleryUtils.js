import { DAO_ANH_LIST, findDaoAnhDefinition } from './daoAnhData';
import { SUPPRESSING_ARTIFACTS, LIFE_LAMPS } from './cultivation';

/**
 * Builds an ownership lookup map for all Dao Anh definitions in DAO_ANH_LIST.
 *
 * @param {object} cultivationState - Current cultivation state object
 * @returns {Record<string, {
 *   owned: boolean,
 *   kiep: number,
 *   source: 'palace' | 'lamp',
 *   palaceName?: string,
 *   statusText: string,
 *   statusCode: 'anchored' | 'in_bag' | 'unowned',
 *   inBag?: boolean,
 *   active?: boolean,
 *   currentExp?: number,
 *   maxExp?: number,
 * }>}
 */
export function buildOwnershipMap(cultivationState) {
  const map = {};
  if (!cultivationState) {
    // Populate default unowned for all
    for (const def of DAO_ANH_LIST) {
      map[def.id] = {
        owned: false,
        kiep: 1,
        source: def.sourceType === 'lamp' ? 'lamp' : 'palace',
        statusText: 'Chưa sở hữu',
        statusCode: 'unowned',
        inBag: false,
      };
    }
    return map;
  }

  const daoAnhs = Array.isArray(cultivationState.daoAnhs) ? cultivationState.daoAnhs : [];
  const inventoryArtifacts = Array.isArray(cultivationState.inventoryArtifacts)
    ? cultivationState.inventoryArtifacts
    : [];
  const inventoryLamps = Array.isArray(cultivationState.inventoryLamps)
    ? cultivationState.inventoryLamps
    : [];
  const palaceAnchors = cultivationState.palaceAnchors || {};

  // 1. Process active Dao Anh instances in cultivationState.daoAnhs
  const matchedDefIds = new Set();
  for (const da of daoAnhs) {
    const def = findDaoAnhDefinition(da, cultivationState);
    if (def && def.id) {
      matchedDefIds.add(def.id);
      const kiep = da.currentKiep !== undefined ? Math.max(1, Math.min(5, Number(da.currentKiep))) : 1;
      const isLamp = Boolean(da.fromLamp);
      let palaceName = da.palaceName;
      if (!palaceName && !isLamp && da.palaceIndex !== undefined) {
        palaceName = `Thiên Cung #${Number(da.palaceIndex) + 1}`;
      }

      map[def.id] = {
        owned: true,
        kiep,
        source: isLamp ? 'lamp' : 'palace',
        palaceName,
        statusText: `Đang tọa trấn · Kiếp ${kiep}/5`,
        statusCode: 'anchored',
        inBag: false,
        active: Boolean(da.active),
        currentExp: da.currentExp || 0,
        maxExp: da.maxExp || 10000,
      };
    }
  }

  // 2. Process all definitions in DAO_ANH_LIST that are not yet actively anchored
  for (const def of DAO_ANH_LIST) {
    if (matchedDefIds.has(def.id)) continue;

    const isLamp = def.sourceType === 'lamp';
    let inBag = false;
    let isAnchoredPreDaoAnh = false;
    let palaceName;

    if (isLamp) {
      inBag = inventoryLamps.includes(def.sourceId);
    } else {
      inBag = inventoryArtifacts.includes(def.sourceId);
      // Check if anchored in palaceAnchors even before reaching Nguyen Anh Dao Anh stage
      for (const [pIdx, anchor] of Object.entries(palaceAnchors)) {
        const aId = typeof anchor === 'string' ? anchor : anchor?.id;
        if (aId === def.sourceId) {
          isAnchoredPreDaoAnh = true;
          palaceName = (typeof anchor === 'object' && anchor?.name)
            ? anchor.name
            : `Thiên Cung #${Number(pIdx) + 1}`;
          break;
        }
      }
    }

    if (inBag) {
      map[def.id] = {
        owned: false,
        inBag: true,
        kiep: 1,
        source: isLamp ? 'lamp' : 'palace',
        statusText: 'Sẵn trong túi',
        statusCode: 'in_bag',
      };
    } else if (isAnchoredPreDaoAnh) {
      map[def.id] = {
        owned: false,
        inBag: false,
        kiep: 1,
        source: 'palace',
        palaceName,
        statusText: `Đang trấn giữ ${palaceName}`,
        statusCode: 'anchored',
      };
    } else {
      map[def.id] = {
        owned: false,
        inBag: false,
        kiep: 1,
        source: isLamp ? 'lamp' : 'palace',
        statusText: 'Chưa sở hữu',
        statusCode: 'unowned',
      };
    }
  }

  return map;
}

/**
 * Calculates stats for gallery header.
 *
 * @param {Record<string, any>} ownershipMap
 * @returns {{ totalCount: number, ownedCount: number, maxKiepCount: number }}
 */
export function getDaoAnhStats(ownershipMap) {
  const totalCount = DAO_ANH_LIST.length;
  if (!ownershipMap) {
    return { totalCount, ownedCount: 0, maxKiepCount: 0 };
  }

  let ownedCount = 0;
  let maxKiepCount = 0;

  for (const def of DAO_ANH_LIST) {
    const status = ownershipMap[def.id];
    if (status && status.owned) {
      ownedCount++;
      if (status.kiep >= 5) {
        maxKiepCount++;
      }
    }
  }

  return { totalCount, ownedCount, maxKiepCount };
}
