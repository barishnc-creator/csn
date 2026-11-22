/** Cousy işareti: sohbet halkası biçiminde C ve kucakladığı nokta. Rengi `currentColor`. */
export default function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="67 96 352 320" fill="none" aria-hidden="true">
      <path d="M356 172A128 128 0 1 0 356 340" stroke="currentColor" strokeWidth="64" strokeLinecap="round" />
      <circle cx="352" cy="256" r="32" fill="currentColor" />
    </svg>
  )
}
