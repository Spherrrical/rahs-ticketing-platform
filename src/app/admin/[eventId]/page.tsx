import { supabase } from "@/lib/supabase";
import TransactionList from "@/components/TransactionList";

export default async function AdminPage({
  params,
}: {
  params: { eventId: string };
}) {
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", params.eventId)
    .single();

  if (!event) {
    return <div>Event not found</div>;
  }

  // Fetch all orders with their tickets
  const { data: orders } = await supabase
    .from("orders")
    .select(`
      *,
      tickets (*)
    `)
    .eq("event_id", params.eventId)
    .order('created_at', { ascending: false });

  return (
    <div className="min-h-screen p-8">
      <main className="max-w-6xl mx-auto">
        <TransactionList event={event} orders={orders || []} />
      </main>
    </div>
  );
} 