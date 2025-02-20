'use client';

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function PurchaseForm({ event }: { event: any }) {
  const [purchaserName, setPurchaserName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [tickets, setTickets] = useState([
    { attendeeName: "", ticketType: "student" as const }
  ]);

  const addTicket = () => {
    setTickets([...tickets, { attendeeName: "", ticketType: "student" as const }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const total = tickets.reduce((sum, ticket) => {
      return sum + (ticket.ticketType === "student" ? event.student_price : event.guest_price);
    }, 0);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        event_id: event.id,
        purchaser_name: purchaserName,
        student_id: studentId,
        payment_method: "cash",
        total_amount: total
      })
      .select()
      .single();

    if (orderError) {
      alert("Error creating order");
      return;
    }

    const ticketPromises = tickets.map(ticket => 
      supabase
        .from("tickets")
        .insert({
          order_id: order.id,
          attendee_name: ticket.attendeeName,
          ticket_type: ticket.ticketType,
          price: ticket.ticketType === "student" ? event.student_price : event.guest_price
        })
    );

    await Promise.all(ticketPromises);
    alert("Order completed successfully!");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block mb-2">Purchaser Name</label>
        <input
          type="text"
          value={purchaserName}
          onChange={(e) => setPurchaserName(e.target.value)}
          className="w-full p-2 border rounded"
          required
        />
      </div>

      <div>
        <label className="block mb-2">Student ID (if applicable)</label>
        <input
          type="text"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>

      {tickets.map((ticket, index) => (
        <div key={index} className="space-y-4 p-4 border rounded">
          <div>
            <label className="block mb-2">Attendee Name</label>
            <input
              type="text"
              value={ticket.attendeeName}
              onChange={(e) => {
                const newTickets = [...tickets];
                newTickets[index].attendeeName = e.target.value;
                setTickets(newTickets);
              }}
              className="w-full p-2 border rounded"
              required
            />
          </div>

          <div>
            <label className="block mb-2">Ticket Type</label>
            <select
              value={ticket.ticketType}
              onChange={(e) => {
                const newTickets = [...tickets];
                newTickets[index].ticketType = e.target.value as any;
                setTickets(newTickets);
              }}
              className="w-full p-2 border rounded"
            >
              <option value="student">Student (${event.student_price})</option>
              <option value="guest">Guest (${event.guest_price})</option>
            </select>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addTicket}
        className="w-full p-2 border rounded bg-secondary text-secondary-foreground"
      >
        Add Another Ticket
      </button>

      <button
        type="submit"
        className="w-full p-2 rounded bg-primary text-primary-foreground"
      >
        Purchase Tickets
      </button>
    </form>
  );
} 