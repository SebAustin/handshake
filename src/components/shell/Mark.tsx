/** Handshake's mark: two hooked strokes meeting in the middle, drawn in ink. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="var(--accent)" />
      <path d="M6 10.5h7.5a3 3 0 0 1 0 6H11" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22 17.5h-7.5a3 3 0 0 1 0-6H17" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
