/**
 * scripts/check-no-handdrawn-icons.mjs
 * Verification script: verifies that all hand-drawn SVG icons and inline SVG icons
 * outside the designated artwork/visualization allowlist have been completely eliminated
 * and replaced by the unified Icon component.
 */

import fs from 'fs';
import path from 'path';

const ALLOWLIST = [
  'src/components/ui/Icon.jsx',
  'src/components/comics/ComicIcons.jsx',
  'src/components/cultivation/ArtifactIcon.jsx',
  'src/components/cultivation/RealmPreviewVisualizer.jsx',
  'src/components/cultivation/DaoAnhAvatarRenderer.jsx',
  'src/components/cultivation/TribulationModal.jsx',
  'src/components/cultivation/BreakthroughModal.jsx',
];

// Special allowed inline SVGs with specific class names/roles (e.g., dynamic data visualization progress ring)
const ALLOWED_INLINE_SVGS = [
  {
    file: 'src/pages/ReaderPage.jsx',
    pattern: /className=\{styles\.meditationRingSvg\}/,
    reason: 'Dynamic meditation time progress ring (stroke-dasharray / strokeDashoffset animation)'
  }
];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (file.endsWith('.jsx')) {
      results.push(full);
    }
  }
  return results;
}

const files = walk('src');
const violations = [];

for (const file of files) {
  const relPath = path.relative(process.cwd(), file).replace(/\\/g, '/');

  const content = fs.readFileSync(file, 'utf8');

  // Check: Ensure DaoAnhGalleryModal.jsx does not use GlyphIcon or toIconKey
  if (relPath.includes('DaoAnhGalleryModal.jsx')) {
    if (content.includes('GlyphIcon') || content.includes('toIconKey')) {
      violations.push({
        file: relPath,
        type: 'forbidden-glyph-import',
        symbol: 'GlyphIcon / toIconKey in DaoAnhGalleryModal',
        line: 1
      });
    }
  }

  if (ALLOWLIST.includes(relPath)) {
    continue;
  }

  // Check 1: Hand-drawn icon function or const declarations (e.g. function IconX, const IconX =)
  // Skip top-level React page components like IconsPreviewPage
  const iconDeclMatches = [
    ...content.matchAll(/(?:function|const)\s+(Icon[A-Za-z0-9_]+|DownloadIcon|BookIcon|FileTextIcon|CheckCircleIcon|AlertTriangleIcon|ShareIcon|CloseIcon|Svg[A-Za-z0-9_]+)\s*(=|\()/g)
  ];
  for (const match of iconDeclMatches) {
    const iconName = match[1];
    if (iconName === 'IconsPreviewPage') continue;
    violations.push({
      file: relPath,
      type: 'handdrawn-icon-declaration',
      symbol: iconName,
      line: content.substring(0, match.index).split('\n').length
    });
  }

  // Check 2: Inline <svg> tags outside the allowlist
  const svgMatches = [...content.matchAll(/<svg\b([^>]*)>/g)];
  for (const match of svgMatches) {
    const svgAttrs = match[1];
    const matchIndex = match.index;
    const lineNumber = content.substring(0, matchIndex).split('\n').length;

    // Check if covered by ALLOWED_INLINE_SVGS
    const isAllowed = ALLOWED_INLINE_SVGS.some(item => {
      if (item.file !== relPath) return false;
      const snippet = content.substring(matchIndex, matchIndex + 200);
      return item.pattern.test(snippet);
    });

    if (!isAllowed) {
      violations.push({
        file: relPath,
        type: 'inline-svg-icon',
        symbol: `<svg ${svgAttrs.trim().substring(0, 40)}...>`,
        line: lineNumber
      });
    }
  }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('🔍 HAND-DRAWN ICON VERIFICATION AUDIT');
console.log('═══════════════════════════════════════════════════════════');

if (violations.length === 0) {
  console.log('✅ ALL CHECKS PASSED: 0 hand-drawn SVG icons found outside allowlist!');
  console.log('All icons in the codebase use the unified Lucide / Game Icons system.');
  process.exit(0);
} else {
  console.error(`❌ FOUND ${violations.length} VIOLATION(S):`);
  violations.forEach(v => {
    console.error(`  - [${v.type}] ${v.file}:${v.line} -> ${v.symbol}`);
  });
  process.exit(1);
}
