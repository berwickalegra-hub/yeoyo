import {
  Ban,
  Bell,
  Camera,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  Clock,
  Compass,
  Eye,
  Gem,
  Heart,
  HeartHandshake,
  Inbox,
  Info,
  LayoutGrid,
  Lock,
  MapPin,
  Menu,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
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
  send: Send,
  bell: Bell,
  'check-circle': CheckCircle,
  inbox: Inbox,
  ban: Ban,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const Component = ICONS[name];
  return <Component size={size} className={className} aria-hidden />;
}
