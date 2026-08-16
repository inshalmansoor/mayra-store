// The five empty states from plans/04-frontend-nextjs.md §7 (cases 15-18, 20)
// — invitations, not sad-face illustrations. See plans/08 §20 copy principles.
export default function EmptyState({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 19, color: "var(--ink)", marginBottom: subtitle ? 4 : 20 }}>
        {title}
      </p>
      {subtitle && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--ink-soft)", marginBottom: 20 }}>
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}
