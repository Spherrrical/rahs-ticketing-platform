import { supabase } from "@/lib/supabase";
import TransactionList from "@/components/TransactionList";

interface Props {
  params: { eventId: string }
}

export default async function AdminPage(props: Props) {
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", props.params.eventId)
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
    .eq("event_id", props.params.eventId)
    .order('created_at', { ascending: false });

  return (
    <div className="min-h-screen p-8">
      <main className="max-w-6xl mx-auto">
        <TransactionList event={event} orders={orders || []} />
      </main>
    </div>
  );
} 