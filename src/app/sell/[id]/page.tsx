import { supabase } from "@/lib/supabase";
import SaleForm from "@/components/SaleForm";

export default async function SellPage({
  params,
}: {
  params: { id: string };
}) {
  // Ensure params.id is properly awaited
  const id = await params.id;

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (!event) {
    return <div>Event not found</div>;
  }

  return (
    <div className="min-h-screen p-4">
      <main className="max-w-3xl mx-auto">
        <SaleForm event={event} />
      </main>
    </div>
  );
} 