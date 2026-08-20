import { useMemo } from 'react';

const ELEMENTS = ['Hỏa', 'Thủy', 'Kim', 'Mộc'];

const ELEMENT_NAMES = [
  'Thái Dương · Hỏa',
  'Thiếu Âm · Thủy',
  'Thiếu Dương · Kim',
  'Thái Âm · Mộc'
];

// Generate exact 120 nodes in a spiral/mandala pattern
export default function useTaijiCoordinates(openedCount = 0) {
  const nodes = useMemo(() => {
    const arr = [];
    const cx = 500;
    const cy = 400;
    
    // Distribute 120 nodes across 4 branches (30 each)
    // We will interleave them or just place them in rings. Let's do 4 spiral arms.
    const nodesPerArm = 30;
    
    for (let i = 0; i < 120; i++) {
      const armIndex = i % 4; // 0, 1, 2, 3
      const nodeIndexInArm = Math.floor(i / 4); // 0 to 29
      
      // Radius expands outwards
      const minR = 80;
      const maxR = 300;
      const r = minR + (nodeIndexInArm / (nodesPerArm - 1)) * (maxR - minR);
      
      // Angle shifts to form a spiral
      // Base angle for the arm: 0, 90, 180, 270 degrees
      const baseAngle = (armIndex * 90) * (Math.PI / 180);
      
      // Spiral twist
      const twist = (nodeIndexInArm / nodesPerArm) * Math.PI * 1.5;
      
      const angle = baseAngle + twist;
      
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      
      arr.push({
        index: i + 1,
        element: ELEMENTS[armIndex],
        category: ELEMENT_NAMES[armIndex],
        name: `Khiếu #${i + 1}`,
        x,
        y,
        isUnlocked: i < openedCount,
        cost: 50 + Math.floor(i * 1.2)
      });
    }
    return arr;
  }, [openedCount]);

  // Helper to generate SVG path data connecting nodes of the same element
  const getMeridianPath = (elementNodes) => {
    if (!elementNodes || elementNodes.length < 2) return '';
    // Sort by index just in case
    const sorted = [...elementNodes].sort((a, b) => a.index - b.index);
    let d = `M ${sorted[0].x} ${sorted[0].y}`;
    for (let i = 1; i < sorted.length; i++) {
      d += ` L ${sorted[i].x} ${sorted[i].y}`;
    }
    return d;
  };

  return { nodes, getMeridianPath };
}
