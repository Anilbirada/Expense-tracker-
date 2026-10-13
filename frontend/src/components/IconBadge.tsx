import React from 'react';
import {
  Utensils,
  Car,
  GraduationCap,
  ShoppingBag,
  Home,
  Zap,
  HeartPulse,
  Film,
  Repeat,
  MoreHorizontal,
  Briefcase,
  Laptop,
  TrendingUp,
  Award,
  Wallet,
  PlusCircle,
  Tag,
  Coffee,
  Plane,
  BookOpen,
  Smartphone,
  Shield,
  Gift,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Utensils,
  Car,
  GraduationCap,
  ShoppingBag,
  Home,
  Zap,
  HeartPulse,
  Film,
  Repeat,
  MoreHorizontal,
  Briefcase,
  Laptop,
  TrendingUp,
  Award,
  Wallet,
  PlusCircle,
  Tag,
  Coffee,
  Plane,
  BookOpen,
  Smartphone,
  Shield,
  Gift,
};

export const AVAILABLE_ICONS = Object.keys(ICON_MAP);

interface IconBadgeProps {
  icon: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const IconBadge: React.FC<IconBadgeProps> = ({
  icon,
  color = '#2563eb',
  size = 'md',
}) => {
  const IconComp = ICON_MAP[icon] || Tag;
  const dims =
    size === 'sm'
      ? 'w-8 h-8 text-xs'
      : size === 'lg'
      ? 'w-12 h-12 text-base'
      : 'w-10 h-10 text-sm';
  const iconDims =
    size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';

  return (
    <div
      className={`${dims} rounded-xl flex items-center justify-center shrink-0 font-semibold`}
      style={{
        backgroundColor: `${color}18`,
        color: color,
        border: `1px solid ${color}35`,
      }}
    >
      <IconComp className={iconDims} />
    </div>
  );
};
