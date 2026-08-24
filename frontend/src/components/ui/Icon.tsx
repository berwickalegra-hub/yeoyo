import {
  ArrowRight,
  Ban,
  Banknote,
  Bell,
  BellOff,
  Bot,
  BookOpen,
  Briefcase,
  Calendar,
  Camera,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  CreditCard,
  Crown,
  Download,
  Eye,
  EyeOff,
  Flag,
  Gem,
  Gift,
  Heart,
  HeartHandshake,
  Home,
  Image as ImageIcon,
  Inbox,
  Info,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Lightbulb,
  Lock,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  MessageSquare,
  Minus,
  MoreVertical,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
  Tag,
  TrendingDown,
  TrendingUp,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';

// Maps the kebab-case icon names used in the Banani designs to their Lucide
// component. Extend this map screen-by-screen as new icons show up in the
// source — don't pre-import the whole Lucide set.
const ICONS = {
  'layout-grid': LayoutGrid,
  'layout-dashboard': LayoutDashboard,
  heart: Heart,
  'message-circle': MessageCircle,
  'message-square': MessageSquare,
  flag: Flag,
  banknote: Banknote,
  download: Download,
  user: User,
  settings: Settings,
  compass: Compass,
  users: Users,
  search: Search,
  'shield-check': ShieldCheck,
  'heart-handshake': HeartHandshake,
  smartphone: Smartphone,
  lock: Lock,
  gem: Gem,
  menu: Menu,
  'chevron-left': ChevronLeft,
  'chevron-down': ChevronDown,
  x: X,
  check: Check,
  'map-pin': MapPin,
  clock: Clock,
  camera: Camera,
  info: Info,
  'sliders-horizontal': SlidersHorizontal,
  'refresh-cw': RefreshCw,
  eye: Eye,
  'eye-off': EyeOff,
  'log-in': LogIn,
  send: Send,
  share: Share2,
  bell: Bell,
  'check-circle': CheckCircle,
  inbox: Inbox,
  ban: Ban,
  sparkles: Sparkles,
  'book-open': BookOpen,
  lightbulb: Lightbulb,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  crown: Crown,
  'credit-card': CreditCard,
  palette: Palette,
  'chevron-right': ChevronRight,
  star: Star,
  layers: Layers,
  bot: Bot,
  minus: Minus,
  'more-vertical': MoreVertical,
  image: ImageIcon,
  zap: Zap,
  home: Home,
  tag: Tag,
  'x-circle': XCircle,
  'user-check': UserCheck,
  'user-plus': UserPlus,
  shield: Shield,
  'arrow-right': ArrowRight,
  gift: Gift,
  'log-out': LogOut,
  'bell-off': BellOff,
  trash: Trash2,
  pencil: Pencil,
  calendar: Calendar,
  briefcase: Briefcase,
  plus: Plus,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 18,
  className,
  fill,
  // Lucide's own default (2) reads a little heavy/blunt at the small sizes
  // this app uses everywhere (14-20px) — 1.75 is the lighter weight most
  // "clean, professional" UI kits (Notion, Linear, …) settle on, and reads
  // noticeably less "harsh" against the light-blue theme's white surfaces.
  strokeWidth = 1.75,
}: {
  name: IconName;
  size?: number;
  className?: string;
  fill?: string;
  strokeWidth?: number;
}) {
  const Component = ICONS[name];
  // Only forward `fill` when a caller actually passes one (e.g. the star
  // rating's `fill={liked ? 'currentColor' : 'none'}`). Lucide's own
  // <Icon> spreads `...rest` (which includes `fill`) AFTER its internal
  // `defaultAttributes` (fill: 'none'), so passing `fill={undefined}`
  // unconditionally — which every call site with no `fill` prop was doing —
  // overwrote 'none' with `undefined`, React then omits the `fill`
  // attribute from the rendered <svg> entirely, and the browser falls back
  // to the SVG spec's own default fill color: solid black. This was making
  // every icon in the app render as a filled black silhouette instead of a
  // thin colored outline, on every screen, since Icon.tsx was first written
  // — never caught because no real-browser visual check ever ran until now.
  return (
    <Component
      size={size}
      className={className}
      {...(fill !== undefined ? { fill } : {})}
      strokeWidth={strokeWidth}
      aria-hidden
    />
  );
}
