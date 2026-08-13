import type { ReactElement, SVGProps } from 'react'
import type { BuiltInCategoryId, CategoryId } from '../types'

type IconSvgProps = SVGProps<SVGSVGElement> & { size?: number }

function LineIcon({ size = 14, ...props }: IconSvgProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    />
  )
}

function IconDroplet(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M8 2.5c0 0-4.25 4.4-4.25 7.1a4.25 4.25 0 1 0 8.5 0C12.25 6.9 8 2.5 8 2.5Z" />
    </LineIcon>
  )
}

function IconFlame(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M8 2.4c.2 2.1 1.9 3.1 1.9 5.1A3.1 3.1 0 1 1 5.1 5.9C5.9 4.5 6.7 3.6 8 2.4Z" />
      <path d="M8 13.4a1.85 1.85 0 0 0 1.85-1.85c0-1.1-.95-1.7-1.85-2.55-.9.85-1.85 1.45-1.85 2.55A1.85 1.85 0 0 0 8 13.4Z" />
    </LineIcon>
  )
}

function IconBolt(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M9.2 1.75 4.5 9.1h3.1L6.8 14.25 12.1 6.9H9Z" />
    </LineIcon>
  )
}

function IconCar(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M3.2 9.2 4.4 5.9a1.4 1.4 0 0 1 1.3-.9h4.6a1.4 1.4 0 0 1 1.3.9l1.2 3.3" />
      <path d="M2.4 9.2h11.2v2.1a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V9.2Z" />
      <circle cx="5" cy="11.1" r="0.85" />
      <circle cx="11" cy="11.1" r="0.85" />
    </LineIcon>
  )
}

function IconPhone(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <rect x="5" y="1.75" width="6" height="12.5" rx="1.4" />
      <path d="M7.2 12.6h1.6" />
    </LineIcon>
  )
}

function IconWifi(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M2.6 6.4a7.4 7.4 0 0 1 10.8 0" />
      <path d="M4.5 8.5a4.7 4.7 0 0 1 7 0" />
      <path d="M6.4 10.5a2.1 2.1 0 0 1 3.2 0" />
      <circle cx="8" cy="12.6" r="0.7" fill="currentColor" stroke="none" />
    </LineIcon>
  )
}

function IconHome(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M2.75 7.4 8 2.75l5.25 4.65" />
      <path d="M4.1 6.7v6.55h7.8V6.7" />
      <path d="M6.6 13.25V9.4h2.8v3.85" />
    </LineIcon>
  )
}

function IconReceipt(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M4.2 2.4h7.6v11.2l-1.3-.9-1.3.9-1.3-.9-1.3.9-1.3-.9-1.3.9V2.4Z" />
      <path d="M6 5.5h4M6 8h4M6 10.5h2.4" />
    </LineIcon>
  )
}

function IconShield(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M8 2.3 3.4 4.2v3.7c0 3.1 2 5.1 4.6 5.9 2.6-.8 4.6-2.8 4.6-5.9V4.2L8 2.3Z" />
    </LineIcon>
  )
}

function IconChild(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <circle cx="8" cy="5" r="2.1" />
      <path d="M4.2 13.2c.5-2.3 1.9-3.5 3.8-3.5s3.3 1.2 3.8 3.5" />
    </LineIcon>
  )
}

function IconPerson(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <circle cx="8" cy="5.1" r="2.2" />
      <path d="M3.6 13.4c.7-2.6 2.4-3.9 4.4-3.9s3.7 1.3 4.4 3.9" />
    </LineIcon>
  )
}

function IconPaw(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <ellipse cx="5" cy="5.2" rx="1.15" ry="1.4" />
      <ellipse cx="11" cy="5.2" rx="1.15" ry="1.4" />
      <ellipse cx="3.7" cy="8.2" rx="1.05" ry="1.25" />
      <ellipse cx="12.3" cy="8.2" rx="1.05" ry="1.25" />
      <path d="M8 7.2c-1.7 0-3 1.45-3 2.85 0 1.2.9 2.05 2.1 2.05h1.8c1.2 0 2.1-.85 2.1-2.05C11 8.65 9.7 7.2 8 7.2Z" />
    </LineIcon>
  )
}

function IconMusic(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M6.2 12.4a1.8 1.8 0 1 1-1.7-1.8" />
      <path d="M12.5 10.6a1.8 1.8 0 1 1-1.7-1.8" />
      <path d="M6.2 12.4V3.6l6.3-1.3v8.3" />
    </LineIcon>
  )
}

function IconTv(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <rect x="2.4" y="4.2" width="11.2" height="7.6" rx="1.2" />
      <path d="M6.2 13.6h3.6M8 11.8v1.8" />
    </LineIcon>
  )
}

function IconPlay(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <rect x="2.5" y="3" width="11" height="10" rx="1.4" />
      <path d="M7 6.1v3.8l3.2-1.9L7 6.1Z" />
    </LineIcon>
  )
}

function IconPackage(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M2.8 5.2 8 2.5l5.2 2.7v5.6L8 13.5l-5.2-2.7V5.2Z" />
      <path d="M2.8 5.2 8 7.9l5.2-2.7M8 7.9v5.6" />
    </LineIcon>
  )
}

function IconStretch(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <circle cx="8" cy="3.4" r="1.35" />
      <path d="M5.2 13.3 7.1 8.4 4.4 6.6M10.8 13.3 8.9 8.4l2.7-1.8" />
      <path d="M7.1 8.4h1.8" />
    </LineIcon>
  )
}

function IconDumbbell(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M3.2 6.2v3.6M4.7 5.2v5.6M11.3 5.2v5.6M12.8 6.2v3.6M4.7 8h6.6" />
    </LineIcon>
  )
}

function IconBowl(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M3 7.2h10c0 3.4-2.1 5.6-5 5.6S3 10.6 3 7.2Z" />
      <path d="M6.2 4.2c.5 1.1 1.2 1.7 1.8 1.7s1.3-.6 1.8-1.7" />
    </LineIcon>
  )
}

function IconLaptop(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <rect x="3.4" y="3.2" width="9.2" height="7" rx="1" />
      <path d="M2.2 12.8h11.6l-1.2-2.6H3.4L2.2 12.8Z" />
    </LineIcon>
  )
}

function IconDesktop(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <rect x="2.4" y="2.6" width="11.2" height="8.2" rx="1.1" />
      <path d="M6.2 13.4h3.6M8 10.8v2.6" />
    </LineIcon>
  )
}

function IconBrain(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M7.2 3.2a2.2 2.2 0 0 0-3.7 1.6c0 .7.3 1.2.7 1.6A2 2 0 0 0 3.4 9c0 .9.5 1.6 1.3 1.9v1.7h2.5V3.2Z" />
      <path d="M8.8 3.2a2.2 2.2 0 0 1 3.7 1.6c0 .7-.3 1.2-.7 1.6A2 2 0 0 1 12.6 9c0 .9-.5 1.6-1.3 1.9v1.7H8.8V3.2Z" />
    </LineIcon>
  )
}

function IconEye(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M1.8 8s2.4-4.2 6.2-4.2S14.2 8 14.2 8s-2.4 4.2-6.2 4.2S1.8 8 1.8 8Z" />
      <circle cx="8" cy="8" r="1.7" />
    </LineIcon>
  )
}

function IconCart(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M2.2 3.2h1.5l1.3 7.2h7.6l1.4-5.4H5" />
      <circle cx="6.4" cy="12.7" r="0.85" />
      <circle cx="11.2" cy="12.7" r="0.85" />
    </LineIcon>
  )
}

function IconCup(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M4.2 4.2h6.4v5.1a2.4 2.4 0 0 1-2.4 2.4H6.6A2.4 2.4 0 0 1 4.2 9.3V4.2Z" />
      <path d="M10.6 5.4h1.3a1.7 1.7 0 0 1 0 3.4h-1.3" />
      <path d="M5.2 13.4h5.6" />
    </LineIcon>
  )
}

function IconGlass(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M5.2 2.5h5.6L9.5 8.4a1.6 1.6 0 0 1-1.5 1.15H8a1.6 1.6 0 0 1-1.5-1.15L5.2 2.5Z" />
      <path d="M8 9.55v3.7M5.8 13.4h4.4" />
    </LineIcon>
  )
}

function IconFuel(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <rect x="3.2" y="2.4" width="6.2" height="11.2" rx="1.1" />
      <path d="M9.4 5.2h1.5l1.7 1.7v4.2a1.3 1.3 0 0 1-2.6 0" />
      <path d="M4.7 5h3.2v2.4H4.7V5Z" />
    </LineIcon>
  )
}

function IconTicket(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M2.5 5.2h11v2a1.5 1.5 0 0 0 0 3v2h-11v-2a1.5 1.5 0 0 0 0-3v-2Z" />
      <path d="M6.2 5.2v7.2" />
    </LineIcon>
  )
}

function IconUtensils(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M4.4 2.5v4.2c0 .9.6 1.5 1.4 1.5V13.5" />
      <path d="M3.3 2.5v3.4M5.5 2.5v3.4M7.6 2.5v3.4" />
      <path d="M11.4 2.5c1.4 0 2.3 1.1 2.3 2.6 0 1.3-.8 2.2-1.8 2.5V13.5" />
    </LineIcon>
  )
}

function IconTakeout(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M3.4 6.2h9.2l-.7 6.6H4.1L3.4 6.2Z" />
      <path d="M5.2 6.2 6.4 3.4h3.2l1.2 2.8" />
      <path d="M6.5 9h3" />
    </LineIcon>
  )
}

function IconShirt(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M5.4 3.2 8 5l2.6-1.8 2.4 1.6-1.5 2.2v6.8H4.5V7L3 4.8l2.4-1.6Z" />
      <path d="M6.4 3.6c.4.7 1 .1 1.6 1.1.6-1 .1-.4 1.6-1.1" />
    </LineIcon>
  )
}

function IconStar(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M8 2.4 9.5 6h3.7l-3 2.3 1.2 3.7L8 10.1l-3.4 1.9 1.2-3.7-3-2.3H6.5L8 2.4Z" />
    </LineIcon>
  )
}

function IconSpark(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M8 2.2v3.2M8 10.6v3.2M2.2 8h3.2M10.6 8h3.2" />
      <path d="M4.1 4.1l2.2 2.2M9.7 9.7l2.2 2.2M11.9 4.1 9.7 6.3M6.3 9.7 4.1 11.9" />
    </LineIcon>
  )
}

function IconDot(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <circle cx="8" cy="8" r="4.2" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </LineIcon>
  )
}

function IconTag(props: IconSvgProps) {
  return (
    <LineIcon {...props}>
      <path d="M2.6 8.4V3.4h5l5.6 5.6-3.5 3.5L2.6 8.4Z" />
      <circle cx="5.4" cy="5.5" r="0.9" />
    </LineIcon>
  )
}

const BUILTIN_ICONS: Record<
  BuiltInCategoryId,
  (props: IconSvgProps) => ReactElement
> = {
  water: IconDroplet,
  gas_utility: IconFlame,
  elexicon: IconBolt,
  car_payment: IconCar,
  daycare: IconChild,
  nanny: IconPerson,
  therapy: IconBrain,
  lens: IconEye,
  one_time: IconSpark,
  cj_food: IconPaw,
  pet_insurance: IconPaw,
  restaurants: IconUtensils,
  take_out: IconTakeout,
  coffee: IconCup,
  cellphone: IconPhone,
  bell_bundle: IconWifi,
  entertainment: IconTicket,
  amazon: IconPackage,
  internet: IconWifi,
  mortgage: IconHome,
  taxes: IconReceipt,
  home_car_insurance: IconShield,
  gas_vehicle: IconFuel,
  netflix: IconPlay,
  amazon_prime: IconPackage,
  abilities: IconStretch,
  gym: IconDumbbell,
  clothes: IconShirt,
  isla: IconStar,
  liquor: IconGlass,
  groceries: IconCart,
  factor: IconBowl,
  spotify: IconMusic,
  apple_tv: IconTv,
  work_subscription: IconLaptop,
  trevor_car: IconCar,
  kate_car: IconCar,
  other: IconDot,
}

/** Outline/line icon for a category id (custom → tag). */
export function CategoryLineIcon({
  categoryId,
  size = 14,
  className,
}: {
  categoryId: CategoryId
  size?: number
  className?: string
}) {
  const Icon =
    (BUILTIN_ICONS as Record<string, (props: IconSvgProps) => ReactElement>)[
      categoryId
    ] ?? IconTag
  return <Icon size={size} className={className} />
}

/** Phone or desktop line icon for sync history device source. */
export function SyncSourceIcon({
  source,
  size = 15,
  className,
}: {
  source: 'phone' | 'desktop'
  size?: number
  className?: string
}) {
  const Icon = source === 'phone' ? IconPhone : IconDesktop
  return <Icon size={size} className={className} />
}
