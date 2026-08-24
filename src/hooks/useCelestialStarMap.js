import { useMemo } from 'react';
import { FOUR_DIVINE_BEASTS, SIX_CONSTELLATIONS } from '../data/divineBeasts';

export { FOUR_DIVINE_BEASTS, SIX_CONSTELLATIONS };

export default function useCelestialStarMap(openedCount = 0) {
  const { stars, constellationList } = useMemo(() => {
    const starList = [];
    const constList = [];
    const SCALE_FACTOR = 0.89;

    FOUR_DIVINE_BEASTS.forEach((c) => {
      const ox = c.origin.x;
      const oy = c.origin.y;

      const mappedStars = c.starsRel.map((s, sIdx) => {
        const starGlobalIdx = c.startIdx + sIdx;
        const x = ox + s.dx * SCALE_FACTOR;
        const y = oy + s.dy * SCALE_FACTOR;
        const isUnlocked = starGlobalIdx <= openedCount;

        const starObj = {
          index: starGlobalIdx,
          name: `Khiếu #${starGlobalIdx} · ${s.name}`,
          shortName: s.name,
          element: c.element,
          category: `${c.name} (${c.westernName})`,
          constellationId: c.id,
          constellationName: c.name,
          westernName: c.westernName,
          color: c.color,
          isMajor: Boolean(s.isMajor),
          x,
          y,
          isUnlocked,
          cost: 50 + Math.floor(starGlobalIdx * 1.2)
        };

        starList.push(starObj);
        return starObj;
      });

      // Build constellation lines
      const edgePaths = (c.edges || []).map(([i1, i2]) => {
        const s1 = mappedStars[i1];
        const s2 = mappedStars[i2];
        const isConnectedAndUnlocked = s1 && s2 && s1.isUnlocked && s2.isUnlocked;
        return {
          d: s1 && s2 ? `M ${s1.x} ${s1.y} L ${s2.x} ${s2.y}` : '',
          isUnlocked: isConnectedAndUnlocked,
          color: c.color
        };
      });

      constList.push({
        ...c,
        stars: mappedStars,
        edgePaths,
        unlockedCount: mappedStars.filter(s => s.isUnlocked).length
      });
    });

    return { stars: starList, constellationList: constList };
  }, [openedCount]);

  return { stars, constellationList };
}
