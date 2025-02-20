import PurchaseForm from "@/components/PurchaseForm";
import { supabase } from "@/lib/supabase";

export default async function EventPage({
  params,
}: {
  params: { id: string };
}) {
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", params?.id)
    .single();

  if (!event) {
    return <div>Event not found</div>;
  }

  return (
    <div className="min-h-screen p-8">
      <main className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">{event.name}</h1>
        <PurchaseForm event={event} />
      </main>
    </div>
  );
} 