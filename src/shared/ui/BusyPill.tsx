export default function BusyPill({ label }: { label: string }) {
  return <div className="busy-pill"><span className="spinner" /> {label}</div>;
}
