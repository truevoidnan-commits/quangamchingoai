# Design System: Thiên Đạo Tu Luyện OS

## 🎨 Theme & Vibe

Thiên Đạo Tu Luyện OS is a dark-themed, immersive web application interface designed for a mystic cultivation system. It blends ancient Eastern Daoist philosophy (Tai Chi, Bagua) with sleek, modern, "cyber-cultivation" aesthetics. The vibe is mysterious, majestic, mathematically precise, and highly responsive. Elements should feel like they are glowing with internal spiritual energy.

## 🌈 Colors

- **Primary Brand**: `#fef08a` (Divine Gold) - Used for primary actions, max resonance, and the most important highlights (Thiếu Dương).
- **Secondary Brand**: `#38bdf8` (Cyan / Frost Blue) - Used for secondary elements, initial stages of cultivation, and subtle glows (Thiếu Âm).
- **Accent 1**: `#fb923c` (Flame Orange) - Used for warnings, intermediate active states, and energetic highlights (Thái Dương).
- **Accent 2**: `#c084fc` (Mystic Purple) - Used for deep mystic states, advanced nodes, and the final stages (Thái Âm).
- **Accent 3**: `#ec4899` (Neon Pink/Purple) - Used exclusively for the 121st Extreme Node and the Lightning effect (Cực Cảnh).

### Backgrounds

- **App Background**: `#0a0a0a` (Deep Space Black) - The deepest void for the main canvas.
- **Surface Background**: `#0f172a` (Midnight Blue / Slate 900) - Used for panels, cards, and modal backgrounds to provide slight elevation.
- **Subtle Surface**: `rgba(15, 23, 42, 0.7)` - Glassmorphism backgrounds for floating panels.

### Text

- **Primary Text**: `#f8fafc` (Slate 50) - Crisp white for main readable text.
- **Secondary Text**: `#94a3b8` (Slate 400) - Muted text for descriptions and labels.
- **Tertiary Text**: `#475569` (Slate 600) - For disabled or very low emphasis text.

### Borders & Glows

- **Borders**: `#1e293b` (Slate 800) - Standard subtle borders for panels.
- **Active Border**: `#38bdf8` (Cyan) - For active or hovered states.
- **Shadows**: Large, soft, colored shadows are used extensively to simulate "glow" (e.g., `0 0 15px rgba(56, 189, 248, 0.5)`).

## 🔤 Typography

- **Headings Font**: `Cinzel`, `Playfair Display`, or similar elegant serif font to convey ancient majesty.
- **Body Font**: `Inter`, `Roboto`, or similar clean sans-serif for high legibility in data-dense command panels.
- **Scale**:
  - `h1`: 32px, bold, often with a subtle text shadow.
  - `h2`: 24px, semi-bold.
  - `h3`: 18px, medium.
  - `body`: 14px, regular, 1.5 line-height.
  - `caption`: 12px, for small labels and meridian info.

## 🔲 Shapes & Components

### Buttons

- **Primary Button**: Large, pill-shaped (`border-radius: 9999px`), glowing background (e.g., Gold or Cyan gradient), bold text. High contrast.
- **Secondary Button**: Outlined, dark background, colored border (matching the respective meridian element), text matches border color.

### Panels & Cards

- **App Shell Panels**: The Left Rail and Right Command Panel should have a subtle border (`1px solid #1e293b`), dark background (`#0f172a`), and sharp or slightly rounded corners (`border-radius: 8px`).
- **Inner Cards**: Used within panels. `border-radius: 12px`, with a subtle background `rgba(255, 255, 255, 0.03)`.

### Icons & Ornaments

- Use minimal, line-based icons for UI controls.
- Embellish with glowing dots, subtle dividing lines, and glowing rings (simulating cultivation nodes).

## 💫 Interactions & State

- **Hover**: Interactive elements should subtly scale up (`transform: scale(1.02)`) and increase their outer glow.
- **Active/Selected**: Elements feature a bright colored border and a persistent soft glow.
- **Disabled/Locked**: Low opacity (`0.4`), grayscale or desaturated colors, no hover effects.
- **Transitions**: Smooth, slightly prolonged transitions (`0.3s ease-in-out`) to simulate the flow of energy.
