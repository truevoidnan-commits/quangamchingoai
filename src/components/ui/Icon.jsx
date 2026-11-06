import React from 'react';
import {
  Cloud,
  CloudOff,
  CloudCheck,
  CloudAlert,
  CloudUpload,
  CloudDownload,
  Smartphone,
  RefreshCw,
  Zap,
  Search,
  Replace,
  ReplaceAll,
  FileText,
  Share2,
  Settings2,
  Type,
  ArrowLeftRight,
  Plus,
  Menu,
  List,
  Clipboard,
  Trash2,
  Pencil,
  Save,
  Check,
  Download,
  Upload,
  Folder,
  Book,
  Library,
  BookOpen,
  Scroll,
  Lock,
  Unlock,
  Key,
  Shield,
  Settings,
  Eye,
  EyeOff,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Lightbulb,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Image,
  Scissors,
  Copy,
  Bell,
  Star as LucideStar,
  Crown,
  Flame,
  Waves,
  Moon,
  Sun,
  Hourglass,
  Package,
  Link as LinkIcon,
  Hammer,
  FlaskConical,
  Sparkles,
  SlidersHorizontal,
  MoreVertical,
  MoreHorizontal,
  ArrowUpDown,
  Play,
  Pause,
  Rewind,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Clock,
  HardDrive,
  Files,
  LayoutGrid,
  Wrench,
  HelpCircle,
} from 'lucide-react';

import {
  GiDragonHead,
  GiTigerHead,
  GiSpermWhale,
  GiEagleHead,
  GiPaperLantern,
  GiBroadsword,
  GiSwordArray,
  GiDeathSkull,
  GiDrop,
  GiYinYang,
  GiShintoShrineMirror,
  GiCrystalBall,
  GiRingedPlanet,
  GiMeditation,
  GiLotus,
  GiSprout,
  GiGoldNuggets,
} from 'react-icons/gi';

/**
 * 4-pointed Star brand symbol for Thiên Cơ Lâu
 */
function BrandStarIcon({ size = 20, className = '', style = {}, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      aria-hidden="true"
      {...props}
    >
      <path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" />
    </svg>
  );
}

// Map from icon name to definition: { type: 'lucide' | 'gi' | 'custom', comp: ReactComponent }
const ICON_REGISTRY = {
  // --- Cloud & Sync ---
  cloud: { type: 'lucide', comp: Cloud },
  'cloud-check': { type: 'lucide', comp: CloudCheck },
  synced: { type: 'lucide', comp: CloudCheck },
  'cloud-off': { type: 'lucide', comp: CloudOff },
  offline: { type: 'lucide', comp: CloudOff },
  'cloud-alert': { type: 'lucide', comp: CloudAlert },
  'sync-error': { type: 'lucide', comp: CloudAlert },
  'cloud-upload': { type: 'lucide', comp: CloudUpload },
  'cloud-download': { type: 'lucide', comp: CloudDownload },
  phone: { type: 'lucide', comp: Smartphone },
  device: { type: 'lucide', comp: Smartphone },
  smartphone: { type: 'lucide', comp: Smartphone },
  sync: { type: 'lucide', comp: RefreshCw },
  refresh: { type: 'lucide', comp: RefreshCw },

  // --- Actions & Navigation ---
  bolt: { type: 'lucide', comp: Zap },
  instant: { type: 'lucide', comp: Zap },
  flash: { type: 'lucide', comp: Zap },
  zap: { type: 'lucide', comp: Zap },
  search: { type: 'lucide', comp: Search },
  replace: { type: 'lucide', comp: Replace },
  'replace-all': { type: 'lucide', comp: ReplaceAll },
  file: { type: 'lucide', comp: FileText },
  'file-text': { type: 'lucide', comp: FileText },
  pen: { type: 'lucide', comp: Pencil },
  share: { type: 'lucide', comp: Share2 },
  'share-2': { type: 'lucide', comp: Share2 },
  'settings-2': { type: 'lucide', comp: Settings2 },
  type: { type: 'lucide', comp: Type },
  plus: { type: 'lucide', comp: Plus },
  menu: { type: 'lucide', comp: Menu },
  list: { type: 'lucide', comp: List },
  clipboard: { type: 'lucide', comp: Clipboard },
  paste: { type: 'lucide', comp: Clipboard },
  trash: { type: 'lucide', comp: Trash2 },
  delete: { type: 'lucide', comp: Trash2 },
  edit: { type: 'lucide', comp: Pencil },
  pencil: { type: 'lucide', comp: Pencil },
  save: { type: 'lucide', comp: Save },
  download: { type: 'lucide', comp: Download },
  upload: { type: 'lucide', comp: Upload },
  folder: { type: 'lucide', comp: Folder },
  book: { type: 'lucide', comp: Book },
  books: { type: 'lucide', comp: Library },
  library: { type: 'lucide', comp: Library },
  'book-open': { type: 'lucide', comp: BookOpen },
  scroll: { type: 'lucide', comp: Scroll },
  lock: { type: 'lucide', comp: Lock },
  unlock: { type: 'lucide', comp: Unlock },
  key: { type: 'lucide', comp: Key },
  shield: { type: 'lucide', comp: Shield },
  settings: { type: 'lucide', comp: Settings },
  eye: { type: 'lucide', comp: Eye },
  'eye-off': { type: 'lucide', comp: EyeOff },
  close: { type: 'lucide', comp: X },
  x: { type: 'lucide', comp: X },
  check: { type: 'lucide', comp: Check },
  'check-circle': { type: 'lucide', comp: CheckCircle2 },
  alert: { type: 'lucide', comp: AlertTriangle },
  'alert-triangle': { type: 'lucide', comp: AlertTriangle },
  'alert-circle': { type: 'lucide', comp: AlertCircle },
  info: { type: 'lucide', comp: Info },
  lightbulb: { type: 'lucide', comp: Lightbulb },
  'arrow-right': { type: 'lucide', comp: ArrowRight },
  'arrow-left': { type: 'lucide', comp: ArrowLeft },
  'arrow-up': { type: 'lucide', comp: ArrowUp },
  'arrow-down': { type: 'lucide', comp: ArrowDown },
  'chevron-right': { type: 'lucide', comp: ChevronRight },
  'chevron-left': { type: 'lucide', comp: ChevronLeft },
  'chevron-up': { type: 'lucide', comp: ChevronUp },
  'chevron-down': { type: 'lucide', comp: ChevronDown },
  'external-link': { type: 'lucide', comp: ExternalLink },
  image: { type: 'lucide', comp: Image },
  scissors: { type: 'lucide', comp: Scissors },
  copy: { type: 'lucide', comp: Copy },
  bell: { type: 'lucide', comp: Bell },
  crown: { type: 'lucide', comp: Crown },
  flame: { type: 'lucide', comp: Flame },
  wave: { type: 'lucide', comp: Waves },
  waves: { type: 'lucide', comp: Waves },
  moon: { type: 'lucide', comp: Moon },
  sun: { type: 'lucide', comp: Sun },
  hourglass: { type: 'lucide', comp: Hourglass },
  package: { type: 'lucide', comp: Package },
  link: { type: 'lucide', comp: LinkIcon },
  hammer: { type: 'lucide', comp: Hammer },
  flask: { type: 'lucide', comp: FlaskConical },
  pill: { type: 'lucide', comp: FlaskConical },
  sparkle: { type: 'lucide', comp: Sparkles },
  sparkles: { type: 'lucide', comp: Sparkles },
  sliders: { type: 'lucide', comp: SlidersHorizontal },
  filter: { type: 'lucide', comp: SlidersHorizontal },
  'more-vertical': { type: 'lucide', comp: MoreVertical },
  'dots-vertical': { type: 'lucide', comp: MoreVertical },
  'more-horizontal': { type: 'lucide', comp: MoreHorizontal },
  'dots-horizontal': { type: 'lucide', comp: MoreHorizontal },
  sort: { type: 'lucide', comp: ArrowUpDown },
  play: { type: 'lucide', comp: Play },
  pause: { type: 'lucide', comp: Pause },
  rewind: { type: 'lucide', comp: Rewind },
  clock: { type: 'lucide', comp: Clock },
  'hard-drive': { type: 'lucide', comp: HardDrive },
  pages: { type: 'lucide', comp: Files },
  grid: { type: 'lucide', comp: LayoutGrid },
  tools: { type: 'lucide', comp: Wrench },

  // --- Brand & Decorative ---
  star: { type: 'custom', comp: BrandStarIcon },
  'brand-star': { type: 'custom', comp: BrandStarIcon },
  'star-outline': { type: 'lucide', comp: LucideStar },

  // --- Cultivation / Tiên Hiệp (react-icons/gi) ---
  dragon: { type: 'gi', comp: GiDragonHead },
  tiger: { type: 'gi', comp: GiTigerHead },
  whale: { type: 'gi', comp: GiSpermWhale },
  eagle: { type: 'gi', comp: GiEagleHead },
  lantern: { type: 'gi', comp: GiPaperLantern },
  sword: { type: 'gi', comp: GiBroadsword },
  'sword-array': { type: 'gi', comp: GiSwordArray },
  skull: { type: 'gi', comp: GiDeathSkull },
  drop: { type: 'gi', comp: GiDrop },
  blood: { type: 'gi', comp: GiDrop },
  'yin-yang': { type: 'gi', comp: GiYinYang },
  mirror: { type: 'gi', comp: GiShintoShrineMirror },
  orb: { type: 'gi', comp: GiCrystalBall },
  planet: { type: 'gi', comp: GiRingedPlanet },
  'realm-ngung-khi': { type: 'gi', comp: GiMeditation },
  meditation: { type: 'gi', comp: GiMeditation },
  lotus: { type: 'gi', comp: GiLotus },
  'realm-truc-co': { type: 'gi', comp: GiSprout },
  sprout: { type: 'gi', comp: GiSprout },
  'realm-kim-dan': { type: 'gi', comp: GiGoldNuggets },
  'gold-nuggets': { type: 'gi', comp: GiGoldNuggets },
};

/**
 * Universal Unified Icon Component for Thiên Cơ Lâu
 *
 * @param {string} name - Name identifier from ICON_REGISTRY
 * @param {number} size - Width/height in pixels (default: 20)
 * @param {number} strokeWidth - Lucide stroke width (default: 1.75)
 * @param {string} color - Optional color string (default: currentColor)
 * @param {string} className - Optional CSS class
 * @param {object} style - Optional inline styles
 */
export default function Icon({
  name = 'star',
  size = 20,
  strokeWidth = 1.75,
  color,
  className = '',
  style = {},
  'aria-label': ariaLabel,
  ...props
}) {
  const isAccessible = Boolean(ariaLabel);
  const entry = ICON_REGISTRY[name];

  if (!entry) {
    if (import.meta.env?.DEV) {
      console.warn(`[Icon] Unknown icon name: "${name}". Falling back to HelpCircle.`);
    }
    return (
      <HelpCircle
        size={size}
        strokeWidth={strokeWidth}
        color={color}
        className={className}
        style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, opacity: 0.6, ...style }}
        aria-hidden={!isAccessible ? 'true' : undefined}
        aria-label={ariaLabel}
        role={isAccessible ? 'img' : undefined}
        {...props}
      />
    );
  }

  const Component = entry.comp;

  if (entry.type === 'custom') {
    return (
      <Component
        size={size}
        className={className}
        style={{ color: color || 'currentColor', ...style }}
        aria-label={ariaLabel}
        {...props}
      />
    );
  }

  if (entry.type === 'gi') {
    return (
      <Component
        size={size}
        color={color}
        className={className}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          flexShrink: 0,
          fill: color || 'currentColor',
          ...style,
        }}
        aria-hidden={!isAccessible ? 'true' : undefined}
        aria-label={ariaLabel}
        role={isAccessible ? 'img' : undefined}
        {...props}
      />
    );
  }

  // Default: Lucide
  return (
    <Component
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
      aria-hidden={!isAccessible ? 'true' : undefined}
      aria-label={ariaLabel}
      role={isAccessible ? 'img' : undefined}
      {...props}
    />
  );
}

/**
 * Maps legacy emoji strings stored in cultivation / profile data to SVG Icon keys
 */
export function toIconKey(emojiOrStr) {
  if (!emojiOrStr) return 'star';
  const s = String(emojiOrStr).trim();
  if (s.includes('\u{1F4AD}')) return 'realm-ngung-khi';
  if (s.includes('\u{1F525}')) return 'realm-truc-co';
  if (s.includes('\u{1FA90}')) return 'realm-kim-dan';
  if (s.includes('\u{1F432}') || s.includes('\u{1F409}')) return 'dragon';
  if (s.includes('\u{1F42F}') || s.includes('\u{1F405}')) return 'tiger';
  if (s.includes('\u{1F40B}') || s.includes('\u{1F433}')) return 'whale';
  if (s.includes('\u{1F985}')) return 'eagle';
  if (s.includes('\u{2694}️') || s.includes('\u{1F5E1}️')) return 'sword';
  if (s.includes('\u{262F}️')) return 'yin-yang';
  if (s.includes('\u{1F3EE}')) return 'lantern';
  if (s.includes('\u{1FA78}')) return 'drop';
  if (s.includes('\u{1FA9E}')) return 'mirror';
  if (s.includes('\u{1F52E}')) return 'orb';
  if (s.includes('\u{1F451}')) return 'crown';
  if (s.includes('\u{26A1}')) return 'bolt';
  if (s.includes('\u{1F480}')) return 'skull';
  if (s.includes('\u{1F4E6}')) return 'package';
  if (s.includes('\u{1F528}')) return 'hammer';
  if (s.includes('\u{1F48A}')) return 'flask';
  if (s.includes('\u{23F3}') || s.includes('\u{23F0}')) return 'hourglass';
  if (s.includes('\u{2601}️')) return 'cloud';
  if (s.includes('\u{1F4F1}')) return 'phone';
  if (s.includes('\u{1F504}')) return 'sync';
  if (s.includes('\u{1F514}')) return 'bell';
  if (s.includes('\u{26A0}️')) return 'alert';
  if (s.includes('\u{1F4A1}')) return 'lightbulb';
  if (s.includes('\u{1F4D6}') || s.includes('\u{1F4DA}')) return 'book';
  return 'star';
}

// -------------------------------------------------------------
// Named Export Wrappers (for drop-in compatibility across app)
// -------------------------------------------------------------
export const IconSearch = (props) => <Icon name="search" {...props} />;
export const IconLock = (props) => <Icon name="lock" {...props} />;
export const IconUnlock = (props) => <Icon name="unlock" {...props} />;
export const IconEye = (props) => <Icon name="eye" {...props} />;
export const IconEyeOff = (props) => <Icon name="eye-off" {...props} />;
export const IconGrid = (props) => <Icon name="grid" {...props} />;
export const IconList = (props) => <Icon name="list" {...props} />;
export const IconPlus = (props) => <Icon name="plus" {...props} />;
export const IconPlay = (props) => <Icon name="play" {...props} />;
export const IconPause = (props) => <Icon name="pause" {...props} />;
export const IconRewind = (props) => <Icon name="rewind" {...props} />;
export const IconDownload = (props) => <Icon name="download" {...props} />;
export const IconUpload = (props) => <Icon name="upload" {...props} />;
export const IconEdit = (props) => <Icon name="edit" {...props} />;
export const IconTrash = (props) => <Icon name="trash" {...props} />;
export const IconMoreVertical = (props) => <Icon name="more-vertical" {...props} />;
export const IconMoreHorizontal = (props) => <Icon name="more-horizontal" {...props} />;
export const IconDotsVertical = (props) => <Icon name="more-vertical" {...props} />;
export const IconDotsHorizontal = (props) => <Icon name="more-horizontal" {...props} />;
export const IconClose = (props) => <Icon name="close" {...props} />;
export const IconX = (props) => <Icon name="close" {...props} />;
export const IconCheck = (props) => <Icon name="check" {...props} />;
export const IconCheckCircle = (props) => <Icon name="check-circle" {...props} />;
export const IconSort = (props) => <Icon name="sort" {...props} />;
export const IconReplace = (props) => <Icon name="replace" {...props} />;
export const IconBook = (props) => <Icon name="book" {...props} />;
export const IconBookOpen = (props) => <Icon name="book-open" {...props} />;
export const IconZap = (props) => <Icon name="bolt" {...props} />;
export const IconBolt = (props) => <Icon name="bolt" {...props} />;
export const IconChevronDown = (props) => <Icon name="chevron-down" {...props} />;
export const IconChevronUp = (props) => <Icon name="chevron-up" {...props} />;
export const IconChevronLeft = (props) => <Icon name="chevron-left" {...props} />;
export const IconChevronRight = (props) => <Icon name="chevron-right" {...props} />;
export const IconArrowLeft = (props) => <Icon name="arrow-left" {...props} />;
export const IconArrowRight = (props) => <Icon name="arrow-right" {...props} />;
export const IconArrowUp = (props) => <Icon name="arrow-up" {...props} />;
export const IconArrowDown = (props) => <Icon name="arrow-down" {...props} />;
export const IconTools = (props) => <Icon name="tools" {...props} />;
export const IconCloud = (props) => <Icon name="cloud" {...props} />;
export const IconCloudCheck = (props) => <Icon name="cloud-check" {...props} />;
export const IconCloudUpload = (props) => <Icon name="cloud-upload" {...props} />;
export const IconCloudDownload = (props) => <Icon name="cloud-download" {...props} />;
export const IconCloudOff = (props) => <Icon name="cloud-off" {...props} />;
export const IconCloudAlert = (props) => <Icon name="cloud-alert" {...props} />;
export const IconDevice = (props) => <Icon name="phone" {...props} />;
export const IconSettings = (props) => <Icon name="settings" {...props} />;
export const IconAlertTriangle = (props) => <Icon name="alert" {...props} />;
export const IconAlertCircle = (props) => <Icon name="alert-circle" {...props} />;
export const IconAlert = (props) => <Icon name="alert-circle" {...props} />;
export const IconScroll = (props) => <Icon name="scroll" {...props} />;
export const IconPages = (props) => <Icon name="pages" {...props} />;
export const IconClock = (props) => <Icon name="clock" {...props} />;
export const IconRefresh = (props) => <Icon name="sync" {...props} />;
export const IconHardDrive = (props) => <Icon name="hard-drive" {...props} />;
export const IconFolder = (props) => <Icon name="folder" {...props} />;

// Game Icons named exports
export const IconDragon = (props) => <Icon name="dragon" {...props} />;
export const IconTiger = (props) => <Icon name="tiger" {...props} />;
export const IconWhale = (props) => <Icon name="whale" {...props} />;
export const IconEagle = (props) => <Icon name="eagle" {...props} />;
export const IconLantern = (props) => <Icon name="lantern" {...props} />;
export const IconSword = (props) => <Icon name="sword" {...props} />;
export const IconSkull = (props) => <Icon name="skull" {...props} />;
export const IconDrop = (props) => <Icon name="drop" {...props} />;
export const IconYinYang = (props) => <Icon name="yin-yang" {...props} />;
export const IconMirror = (props) => <Icon name="mirror" {...props} />;
export const IconOrb = (props) => <Icon name="orb" {...props} />;
export const IconPlanet = (props) => <Icon name="planet" {...props} />;
export const IconRealmNgungKhi = (props) => <Icon name="realm-ngung-khi" {...props} />;
export const IconRealmTrucCo = (props) => <Icon name="realm-truc-co" {...props} />;
export const IconRealmKimDan = (props) => <Icon name="realm-kim-dan" {...props} />;

export const IconFile = (props) => <Icon name="file" {...props} />;
export const IconFileText = (props) => <Icon name="file-text" {...props} />;
export const IconShare = (props) => <Icon name="share" {...props} />;
export const IconPen = (props) => <Icon name="pen" {...props} />;
export const IconMeditation = (props) => <Icon name="meditation" {...props} />;
export const IconLotus = (props) => <Icon name="lotus" {...props} />;
export const IconSliders = (props) => <Icon name="sliders" {...props} />;

export { ICON_REGISTRY };
