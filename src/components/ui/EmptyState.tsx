export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-xl border border-dashed border-border bg-panel p-12 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-3 text-secondary">{description}</p>
    </section>
  );
}
