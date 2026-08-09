import { useState, useEffect, useCallback } from 'react';
import {
  getCultivationState,
  saveCultivationState,
  addReadingProgress,
  absorbLifeLamp,
  breakthroughToTrucCo,
  breakthroughToKimDan,
  attemptUnlock121st,
  manifestDaoAnh,
  injectThienMenhToDaoAnh,
  attemptTribulationSingle,
  attemptTribulationAll,
  getRealmDisplayName,
  getCombatPowerDisplay,
  getTotalMenhHoa,
  getTotalCombatPowerAnh,
  resetCultivationState,
  LIFE_LAMPS,
  MAX_ABSORBED_LAMPS,
  EXP_PER_CHAPTER,
  THIEN_MENH_PER_EXP,
  EXP_PER_PHAP_KHIEU,
  EXP_FOR_121_ATTEMPT,
  EXP_PER_THIEN_CUNG,
  NGUNG_KHI_THRESHOLDS,
  KIEP_THIEN_MENH_REQUIREMENTS,
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
    const next = attemptUnlock121st();
    setCultivation({ ...next });
    return next;
  }, []);

  const handleManifestDaoAnh = useCallback((palaceIndex) => {
    const next = manifestDaoAnh(palaceIndex);
    setCultivation({ ...next });
    return next;
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

  const debugGiveThienMenh = useCallback((amount = 5000) => {
    const state = getCultivationState();
    state.isThienMenhUnlocked = true;
    state.totalThienMenh = (state.totalThienMenh || 0) + amount;
    saveCultivationState(state);
    setCultivation({ ...state });
  }, []);

  const displayName = getRealmDisplayName(cultivation);
  const combatPowerDisplay = getCombatPowerDisplay(cultivation);
  const totalCombatPower = getTotalCombatPowerAnh(cultivation);
  const totalMenhHoa = getTotalMenhHoa(cultivation);

  return {
    cultivation,
    displayName,
    combatPowerDisplay,
    totalCombatPower,
    totalMenhHoa,
    gainReadingExp,
    absorbLamp: handleAbsorbLamp,
    breakthroughToTrucCo: handleBreakthroughTrucCo,
    breakthroughToKimDan: handleBreakthroughKimDan,
    attemptUnlock121: handleUnlock121,
    manifestDaoAnh: handleManifestDaoAnh,
    injectThienMenh: handleInjectThienMenh,
    attemptTribulationSingle: handleTribulationSingle,
    attemptTribulationAll: handleTribulationAll,
    resetCultivation: handleReset,
    debugAddChapter,
    debugGiveAllLamps,
    debugGiveThienMenh,
    LIFE_LAMPS,
    constants: {
      MAX_ABSORBED_LAMPS,
      EXP_PER_CHAPTER,
      THIEN_MENH_PER_EXP,
      EXP_PER_PHAP_KHIEU,
      EXP_FOR_121_ATTEMPT,
      EXP_PER_THIEN_CUNG,
      NGUNG_KHI_THRESHOLDS,
      KIEP_THIEN_MENH_REQUIREMENTS,
    },
  };
}
