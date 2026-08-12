import {
  Ban,
  Bell,
  Bot,
  BookOpen,
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
  Eye,
  EyeOff,
  Gem,
  Heart,
  HeartHandshake,
  Image as ImageIcon,
  Inbox,
  Info,
  Layers,
  LayoutGrid,
  Lightbulb,
  Lock,
  LogIn,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  MoreVertical,
  Palette,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
  TrendingUp,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

// Maps the kebab-case icon names used in the Banani designs to their Lucide
// component. Extend this map screen-by-screen as new icons show up in the
// source — don't pre-import the whole Lucide set.
const ICONS = {
  'layout-grid': LayoutGrid,
  heart: Heart,
  'message-circle': MessageCircle,
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
  bell: Bell,
  'check-circle': CheckCircle,
  inbox: Inbox,
  ban: Ban,
  sparkles: Sparkles,
  'book-open': BookOpen,
  lightbulb: Lightbulb,
  'trending-up': TrendingUp,
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
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 18,
  className,
  fill,
  strokeWidth,
}: {
  name: IconName;
  size?: number;
  className?: string;
  fill?: string;
  strokeWidth?: number;
}) {
  const Component = ICONS[name];
  return (
    <Component
      size={size}
      className={className}
      fill={fill}
      strokeWidth={strokeWidth}
      aria-hidden
    />
  );
}
