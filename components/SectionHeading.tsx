export function Badge({ human = false }: { human?: boolean }) {
  return (
    <span className={human ? "badge human" : "badge"}>
      {human ? "人が判断" : "AI担当"}
    </span>
  );
}
export function SectionHeading({
  n,
  title,
  human = false,
  count,
}: {
  n: string;
  title: string;
  human?: boolean;
  count?: number;
}) {
  return (
    <div className="section-heading">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="step-number">{n}</span>
        <h2>{title}</h2>
        <Badge human={human} />
      </div>
      {count !== undefined && <span className="count">{count}件</span>}
    </div>
  );
}
