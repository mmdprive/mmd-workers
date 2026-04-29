function PlaceholderCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">{body}</p>
    </div>
  );
}

export default function ModelsPage() {
  return (
    <div className="space-y-6">
      <PlaceholderCard
        title="Models Console Placeholder"
        body="This route is restored so the app shell builds cleanly. The next recommended import from Figma Make is the model console or search engine section."
      />
    </div>
  );
}
