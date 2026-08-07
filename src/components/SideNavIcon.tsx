import type { ReactElement, SVGProps } from 'react'
import type { SideNavId } from '../lib/nav'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function NavIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    />
  )
}

export function SideNavLogo({ expanded = false }: { expanded?: boolean }) {
  return (
    <div
      className={`side-nav-logo${expanded ? ' is-expanded' : ''}`}
      aria-hidden
    >
      <img
        className="side-nav-logo-img"
        src="/ledger-logo.png"
        alt=""
        width={598}
        height={236}
        decoding="async"
      />
    </div>
  )
}

function IconBudgeting(props: IconProps) {
  return (
    <NavIcon {...props}>
      <rect x="3.5" y="6.5" width="17" height="12" rx="2.5" />
      <path d="M3.5 10.5h17" />
      <path d="M8 14.25h3.5" />
    </NavIcon>
  )
}

function IconLearning(props: IconProps) {
  return (
    <NavIcon {...props}>
      <path d="M4.5 6.5c2.2-.9 4.4-.9 6.5 0v11c-2.1-.9-4.3-.9-6.5 0V6.5Z" />
      <path d="M19.5 6.5c-2.2-.9-4.4-.9-6.5 0v11c2.1-.9 4.3-.9 6.5 0V6.5Z" />
      <path d="M11 6.5v11" />
    </NavIcon>
  )
}

/** Hockey goalie mask — Gear flips (replaces cube). */
function IconGearFlips(props: IconProps) {
  return (
    <NavIcon {...props}>
      <path d="M8 9c0-2.7 1.8-4.75 4-4.75S16 6.3 16 9v4.75c0 1.85-1.05 3.4-2.6 4.1L12 19.15l-1.4-.8C9.05 17.15 8 15.6 8 13.75V9Z" />
      <path d="M10.15 10.15h3.7M10.15 12.35h3.7M10.15 14.55h3.7" />
      <path d="M12 9.35v6.4" />
      <path d="M9.35 16.85c.75.55 1.65.85 2.65.85s1.9-.3 2.65-.85" />
    </NavIcon>
  )
}

function IconSettings(props: IconProps) {
  return (
    <NavIcon {...props}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3.6v2.1M12 18.3v2.1M4.9 7.4l1.8 1.05M17.3 15.55l1.8 1.05M4.9 16.6l1.8-1.05M17.3 8.45l1.8-1.05M3.6 12h2.1M18.3 12h2.1" />
    </NavIcon>
  )
}

function IconCollapse(props: IconProps) {
  return (
    <NavIcon {...props} size={props.size ?? 18}>
      <path d="M14.5 6.5 9.5 12l5 5.5" />
      <path d="M9 6.5v11" />
    </NavIcon>
  )
}

function IconExpand(props: IconProps) {
  return (
    <NavIcon {...props} size={props.size ?? 18}>
      <path d="M9.5 6.5 14.5 12l-5 5.5" />
      <path d="M15 6.5v11" />
    </NavIcon>
  )
}

const ICONS: Record<SideNavId, (props: IconProps) => ReactElement> = {
  budgeting: IconBudgeting,
  learning: IconLearning,
  gear: IconGearFlips,
  settings: IconSettings,
}

export function SideNavIcon({
  id,
  size,
}: {
  id: SideNavId
  size?: number
}) {
  const Icon = ICONS[id]
  return <Icon size={size} />
}

export function SideNavToggleIcon({ expanded }: { expanded: boolean }) {
  return expanded ? <IconCollapse /> : <IconExpand />
}
