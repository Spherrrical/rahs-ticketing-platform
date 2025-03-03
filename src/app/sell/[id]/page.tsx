import { supabase } from "@/lib/supabase";
import SaleForm from "@/components/SaleForm";

interface Props {
  params: { id: string }
}

export default async function SellPage(props: Props) {
  // Await the params object before accessing id
  const { id } = await props.params;

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