/** Turm-Symbol aus den Entwürfen */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 21h12M7 18h10l-1-8H8l-1 8zM7 10V5h2v2h2V5h2v2h2V5h2v5" />
    </svg>
  );
}
