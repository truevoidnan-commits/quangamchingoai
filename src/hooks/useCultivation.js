import { useState, useEffect, useCallback } from 'react';
import {
  getCultivationState,
  saveCultivationState,
  clearUnreadDrops,
  addReadingProgress,
  absorbLifeLamp,
  burnExpForLamp,
  sellLampForTienTinh,
  buyLampWithTienTinhAndExp,
  sellLampForPoints,
  buyLampWithPointsAndExp,
  anchorPalaceWithArtifact,
  sellArtifactForTienTinh,
  buyArtifactWithTienTinhAndExp,
  sellArtifactForPoints,
  buyArtifactWithPointsAndExp,
  sellMultipleItems,
  breakthroughToTrucCo,
  setNgungKhiActivePath,
  breakthroughToKimDan,
  activateKimDanTrialV2,
  endKimDanTrialV2,
  thangCungKimDan,
  unlockNextPhapKhieu,
  attemptUnlock121st,
  manifestDaoAnh,
  injectExpToDaoAnh,
  injectThienMenhToDaoAnh,
  attemptTribulationSingle,
  attemptTribulationAll,
  fillAllDaoAnhThienMenh,
  getRealmDisplayName,
  getLampPalaceName,
  getPalaceNameFromArtifact,
  getPalaceElementTheme,
  getDaoAnhTheme,
  formatDaoAnhTitle,
  convertToThienMenhIfInAnhRealm,
  getCombatPowerDisplay,
  getTotalMenhHoa,
  getTotalCombatPowerAnh,
  resetCultivationState,
  LIFE_LAMPS,
  SUPPRESSING_ARTIFACTS,
  LAMP_TIERS,
  TIEN_TINH_RATIO,
  DANG_DIEM_RATIO,
  MAX_ABSORBED_LAMPS,
  EXP_PER_CHAPTER,
  THIEN_MENH_PER_EXP,
  EXP_PER_PHAP_KHIEU,
  EXP_FOR_121_ATTEMPT,
  EXP_PER_THIEN_CUNG,
  NGUNG_KHI_THRESHOLDS,
  KIEP_THIEN_MENH_REQUIREMENTS,
  TRUC_CO_KHIEU_THRESHOLDS,
  getExpForPhapKhieuIndex,
  KIM_DAN_PALACE_COSTS,
  getPalaceCost,
} from '../lib/cultivation';

export function useCultivation() {
  const [cultivation, setCultivation] = useState(() => getCultivationState());

  useEffect(() => {
    const handleUpdate = (e) => {
      if (e.detail) {
        setCultivation({ ...e.detail });
      } else {
        setCultivation(getCultivationState());
      }
    };

    window.addEventListener('cultivation_updated', handleUpdate);
    return () => window.removeEventListener('cultivation_updated', handleUpdate);
  }, []);

  const gainReadingExp = useCallback((novelId, chapterId, wordCount) => {
    const res = addReadingProgress(novelId, chapterId, wordCount);
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleAbsorbLamp = useCallback((lampId) => {
    const next = absorbLifeLamp(lampId);
    setCultivation({ ...next });
    return next;
  }, []);

  const handleBurnExpForLamp = useCallback((lampId) => {
    const res = buyLampWithPointsAndExp(lampId);
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleSellLamp = useCallback((lampId) => {
    const res = sellLampForPoints(lampId);
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleAnchorPalace = useCallback((palaceIndex, artifactId) => {
    const res = anchorPalaceWithArtifact(palaceIndex, artifactId);
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleSellArtifact = useCallback((artifactId) => {
    const res = sellArtifactForPoints(artifactId);
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleSellMultipleItems = useCallback(({ lampIds = [], artifactIds = [] }) => {
    const res = sellMultipleItems({ lampIds, artifactIds });
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleBuyArtifact = useCallback((artifactId) => {
    const res = buyArtifactWithPointsAndExp(artifactId);
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleActivateKimDanTrialV2 = useCallback(() => {
    const res = activateKimDanTrialV2();
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleEndKimDanTrialV2 = useCallback(() => {
    const res = endKimDanTrialV2();
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleThangCung = useCallback(() => {
    const res = thangCungKimDan();
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleBreakthroughTrucCo = useCallback(() => {
    const next = breakthroughToTrucCo();
    setCultivation({ ...next });
    return next;
  }, []);

  const handleBreakthroughKimDan = useCallback(() => {
    const next = breakthroughToKimDan();
    setCultivation({ ...next });
    return next;
  }, []);

  const handleUnlock121 = useCallback(() => {
    const res = attemptUnlock121st();
    if (res && res.state) {
      setCultivation({ ...res.state });
    }
    return res;
  }, []);

  const handleManifestDaoAnh = useCallback((palaceIndex) => {
    const next = manifestDaoAnh(palaceIndex);
    setCultivation({ ...next });
    return next;
  }, []);

  const handleInjectExpToDaoAnh = useCallback((palaceIndex, amount) => {
    const res = injectExpToDaoAnh(palaceIndex, amount);
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleInjectThienMenh = useCallback((daoAnhId, amount) => {
    const next = injectThienMenhToDaoAnh(daoAnhId, amount);
    setCultivation({ ...next });
    return next;
  }, []);

  const handleTribulationSingle = useCallback((daoAnhId) => {
    const res = attemptTribulationSingle(daoAnhId);
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleTribulationAll = useCallback(() => {
    const res = attemptTribulationAll();
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleSetDaoAnhStrategy = useCallback((strategy) => {
    const state = getCultivationState();
    state.daoAnhTargetStrategy = strategy;
    saveCultivationState(state);
    setCultivation({ ...state });
  }, []);


  const handleReset = useCallback(() => {
    const next = resetCultivationState();
    setCultivation({ ...next });
    return next;
  }, []);

  // Debug fast helpers
  const debugAddChapter = useCallback(() => {
    const randomId = 'debug_' + Math.random().toString(36).substring(7);
    const res = addReadingProgress('debug_novel', randomId, 2000);
    setCultivation({ ...res.state });
    return res;
  }, []);

  const debugGiveAllLamps = useCallback(() => {
    const state = getCultivationState();
    state.inventoryLamps = LIFE_LAMPS.map(l => l.id);
    saveCultivationState(state);
    setCultivation({ ...state });
  }, []);

  const debugGiveAllArtifacts = useCallback(() => {
    const state = getCultivationState();
    state.inventoryArtifacts = SUPPRESSING_ARTIFACTS.map(a => a.id);
    saveCultivationState(state);
    setCultivation({ ...state });
  }, []);

  const debugGiveThienMenh = useCallback((amount = 5000) => {
    const state = getCultivationState();
    state.isThienMenhUnlocked = true;
    state.totalThienMenh = (state.totalThienMenh || 0) + amount;
    saveCultivationState(state);
    setCultivation({ ...state });
  }, []);

  const handleClearUnreadDrops = useCallback(() => {
    const newState = clearUnreadDrops();
    setCultivation({ ...newState });
  }, []);

  const displayName = getRealmDisplayName(cultivation);
  const combatPowerDisplay = getCombatPowerDisplay(cultivation);
  const totalCombatPower = getTotalCombatPowerAnh(cultivation);
  const totalMenhHoa = getTotalMenhHoa(cultivation);

  const handleFillAllDaoAnhThienMenh = useCallback(() => {
    const res = fillAllDaoAnhThienMenh();
    setCultivation({ ...res.state });
    return res;
  }, []);

  const handleUnlockNextPhapKhieu = useCallback(() => {
    const res = unlockNextPhapKhieu();
    setCultivation({ ...res });
    return res;
  }, []);

  const handleSetNgungKhiPath = useCallback((path) => {
    const res = setNgungKhiActivePath(path);
    setCultivation({ ...res });
    return res;
  }, []);

  return {
    cultivation,
    displayName,
    setNgungKhiPath: handleSetNgungKhiPath,
    getLampPalaceName,
    getPalaceNameFromArtifact,
    getPalaceElementTheme,
    getDaoAnhTheme,
    formatDaoAnhTitle,
    combatPowerDisplay,
    totalCombatPower,
    totalMenhHoa,
    unreadDropsCount: cultivation.unreadDropsCount || 0,
    clearUnreadDrops: handleClearUnreadDrops,
    gainReadingExp,
    absorbLamp: handleAbsorbLamp,
    burnExpForLamp: handleBurnExpForLamp,
    buyLamp: handleBurnExpForLamp,
    sellLamp: handleSellLamp,
    anchorPalace: handleAnchorPalace,
    sellArtifact: handleSellArtifact,
    sellMultipleItems: handleSellMultipleItems,
    buyArtifact: handleBuyArtifact,
    activateKimDanTrialV2: handleActivateKimDanTrialV2,
    endKimDanTrialV2: handleEndKimDanTrialV2,
    thangCung: handleThangCung,
    breakthroughToTrucCo: handleBreakthroughTrucCo,
    breakthroughToKimDan: handleBreakthroughKimDan,
    unlockNextPhapKhieu: handleUnlockNextPhapKhieu,
    khaiKhieu: handleUnlockNextPhapKhieu,
    attemptUnlock121: handleUnlock121,
    attempt121Breakthrough: handleUnlock121,
    manifestDaoAnh: handleManifestDaoAnh,
    injectExpToDaoAnh: handleInjectExpToDaoAnh,
    injectThienMenh: handleInjectThienMenh,
    attemptTribulationSingle: handleTribulationSingle,
    attemptTribulationAll: handleTribulationAll,
    fillAllDaoAnhThienMenh: handleFillAllDaoAnhThienMenh,
    fillAllDaoAnhExp: handleFillAllDaoAnhThienMenh,
    setDaoAnhStrategy: handleSetDaoAnhStrategy,
    resetCultivation: handleReset,
    debugAddChapter,
    debugGiveAllLamps,
    debugGiveAllArtifacts,
    debugGiveThienMenh,
    LIFE_LAMPS,
    SUPPRESSING_ARTIFACTS,
    LAMP_TIERS,
    TIEN_TINH_RATIO,
    DANG_DIEM_RATIO,
    constants: {
      MAX_ABSORBED_LAMPS,
      EXP_PER_CHAPTER,
      THIEN_MENH_PER_EXP,
      EXP_PER_PHAP_KHIEU,
      EXP_FOR_121_ATTEMPT,
      EXP_PER_THIEN_CUNG,
      NGUNG_KHI_THRESHOLDS,
      KIEP_THIEN_MENH_REQUIREMENTS,
      TRUC_CO_KHIEU_THRESHOLDS,
      getExpForPhapKhieuIndex,
      KIM_DAN_PALACE_COSTS,
      getPalaceCost,
    },
  };
}
