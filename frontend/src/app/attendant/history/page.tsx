import type { Metadata } from "next";
import { VisitHistory } from "@/components/VisitHistory";
import { todayInIst } from "@/lib/format";
import { apiGet, requireRole } from "@/lib/session";
import type { Visit } from "@/lib/types";

export const metadata: Metadata = { title: "Vehicle history · ParkSpotZ" };

export default async function AttendantHistoryPage(props: PageProps<"/attendant/history">) {
  await requireRole("attendant");
  const query = await props.searchParams;
  const date = typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : todayInIst();
  const data = await apiGet<{ visits: Visit[] }>(`/visits?date=${date}`);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Vehicle history</h1>
      <VisitHistory action="/attendant/history" date={date} visits={data?.visits ?? null} />
    </main>
  );
}
