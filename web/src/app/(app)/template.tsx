/** Runs on every in-app navigation (templates remount), giving each page a quick enter. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
