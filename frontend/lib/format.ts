// Pinned Intl.NumberFormat instance created once at module scope — using
// toLocaleString() directly can format differently between the Node server
// and the browser, producing a hydration mismatch on every price on the
// page. See plans/04-frontend-nextjs.md §4.2.
const nf = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });

export function fmt(n: number): string {
  return `Rs ${nf.format(Math.round(n))}`;
}
