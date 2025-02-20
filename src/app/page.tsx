'use client'

import { supabase } from "@/lib/supabase";
import { Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Event = {
  id: string;
  name: string;
  event_date: string;
  student_price: number;
  guest_price: number;
}

export default function Home() {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const { data, error } = await supabase.from("events").select("*");
        if (error) throw error;
        if (data) setEvents(data);
      } catch (error) {
        console.error("Error fetching events:", error);
        setEvents([]);
      }
    }

    fetchEvents();
  }, []);

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <main className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center text-gray-800">RAHS Ticket Sales Portal</h1>
        <div className="grid gap-6">
          {events.map((event) => (
            <Link 
              key={event.id}
              href={`/sell/${event.id}`}
              className="block transition-all duration-200 hover:scale-[1.02]"
            >
              <div className="p-6 rounded-xl border bg-white shadow-sm hover:shadow-md">
                <div className="flex justify-between items-start">
                  <h2 className="text-2xl font-semibold text-gray-800">{event.name}</h2>
                  <div className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                    {new Date(event.event_date).toLocaleDateString()}
                  </div>
                </div>
                <div className="mt-4 flex gap-4">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-green-100 rounded-full">
                      <Users className="w-4 h-4 text-green-600" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Student</p>
                      <p className="text-lg font-semibold text-gray-800">${event.student_price}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-purple-100 rounded-full">
                      <Users className="w-4 h-4 text-purple-600" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Guest</p>
                      <p className="text-lg font-semibold text-gray-800">${event.guest_price}</p>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
