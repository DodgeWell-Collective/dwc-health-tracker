import Today from "../../page";

export const dynamic = "force-dynamic";

/** Any day's view, at its own path so the day arrows can reuse prefetched pages. */
export default async function Day({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return <Today searchParams={Promise.resolve({ date })} />;
}
