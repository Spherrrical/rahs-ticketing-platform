'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, Download, ChevronDown, ArrowLeft } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Calendar, 
  DollarSign, 
  Users, 
  Search,
  UserCheck,
  Clock,
  Receipt
} from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

type Order = {
  id: string;
  purchaser_name: string;
  student_id: string | null;
  payment_method: string;
  total_amount: number;
  created_at: string;
  tickets: Ticket[];
};

type Ticket = {
  id: string;
  order_id: string;
  ticket_number: number;
  attendee_name: string;
  ticket_type: "student" | "guest";
  price: number;
  created_at: string;
  updated_at: string;
};

type DailySummary = {
  date: string;
  total: number;
  studentCount: number;
  guestCount: number;
};

type EventSummary = {
  totalSales: number;
  totalStudentTickets: number;
  totalGuestTickets: number;
  averageTicketPrice: number;
};

export default function TransactionList({ event, orders: initialOrders }: { event: any; orders: Order[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [sortBy, setSortBy] = useState("newest");
  const [filterType, setFilterType] = useState("all");
  const [priceRange, setPriceRange] = useState("all");

  useEffect(() => {
    const channel = supabase
      .channel('orders_and_tickets')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `event_id=eq.${event.id}`
        },
        async (payload) => {
          console.log('Order change:', payload);
          if (payload.eventType === 'INSERT') {
            const newOrder = payload.new as Order;
            // Fetch the tickets for this new order
            const { data: tickets, error } = await supabase
              .from('tickets')
              .select('*')
              .eq('order_id', newOrder.id);
              
            if (tickets && !error) {
              setOrders(currentOrders => [
                { ...newOrder, tickets: tickets },
                ...currentOrders
              ]);
            }
          } else if (payload.eventType === 'DELETE') {
            setOrders(currentOrders => 
              currentOrders.filter(order => order.id !== payload.old.id)
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `event_id=eq.${event.id}`
        },
        (payload) => {
          console.log('Ticket change:', payload);
          if (payload.eventType === 'INSERT') {
            // Handle new ticket insertion
            setOrders(currentOrders => 
              currentOrders.map(order => {
                if (order.id === payload.new.order_id) {
                  const newTicket = payload.new as Ticket;
                  return {
                    ...order,
                    tickets: [...order.tickets, newTicket]
                  };
                }
                return order;
              })
            );
          } else if (payload.eventType === 'UPDATE') {
            setOrders(currentOrders => 
              currentOrders.map(order => ({
                ...order,
                tickets: order.tickets.map(ticket => 
                  ticket.id === payload.new.id ? { ...ticket, ...payload.new } : ticket
                )
              }))
            );
          } else if (payload.eventType === 'DELETE') {
            setOrders(currentOrders =>
              currentOrders.map(order => ({
                ...order,
                tickets: order.tickets.filter(ticket => ticket.id !== payload.old.id)
              })).filter(order => order.tickets.length > 0)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [event.id]);

  const handleEdit = async (ticketId: string, newData: Partial<Ticket>) => {
    const { error } = await supabase
      .from('tickets')
      .update(newData)
      .eq('id', ticketId);

    if (error) {
      console.error('Error updating ticket:', error);
      alert('Failed to update ticket');
    }
  };

  const handleDelete = async (ticketId: string) => {
    const { error } = await supabase
      .from('tickets')
      .delete()
      .eq('id', ticketId);

    if (error) {
      console.error('Error deleting ticket:', error);
      alert('Failed to delete ticket');
    }
  };

  // Calculate daily summaries
  const dailySummaries = orders.reduce((acc: { [key: string]: DailySummary }, order) => {
    const date = new Date(order.created_at).toLocaleDateString();
    
    if (!acc[date]) {
      acc[date] = {
        date,
        total: 0,
        studentCount: 0,
        guestCount: 0
      };
    }

    acc[date].total += order.total_amount;
    order.tickets.forEach(ticket => {
      if (ticket.ticket_type === "student") {
        acc[date].studentCount++;
      } else {
        acc[date].guestCount++;
      }
    });

    return acc;
  }, {});

  // Calculate overall summary
  const eventSummary: EventSummary = orders.reduce((summary, order) => {
    return {
      totalSales: summary.totalSales + order.total_amount,
      totalStudentTickets: summary.totalStudentTickets + order.tickets.filter(t => t.ticket_type === "student").length,
      totalGuestTickets: summary.totalGuestTickets + order.tickets.filter(t => t.ticket_type === "guest").length,
      averageTicketPrice: summary.totalSales / (summary.totalStudentTickets + summary.totalGuestTickets) || 0
    };
  }, {
    totalSales: 0,
    totalStudentTickets: 0,
    totalGuestTickets: 0,
    averageTicketPrice: 0
  });

  const getPriceRange = (price: number) => {
    switch (priceRange) {
      case "0-20": return price <= 20;
      case "21-40": return price > 20 && price <= 40;
      case "41-60": return price > 40 && price <= 60;
      case "60+": return price > 60;
      default: return true;
    }
  };

  const filteredOrders = orders
    .filter(order => 
      order.purchaser_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.student_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.tickets.some(ticket => 
        ticket.attendee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.ticket_number.toString().includes(searchTerm)
      )
    )
    .filter(order => {
      if (filterType === "all") return true;
      return order.tickets.some(ticket => ticket.ticket_type === filterType);
    })
    .filter(order => getPriceRange(order.total_amount))
    .sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "price-high":
          return b.total_amount - a.total_amount;
        case "price-low":
          return a.total_amount - b.total_amount;
        case "name":
          return a.purchaser_name.localeCompare(b.purchaser_name);
        default:
          return 0;
      }
    });

  // Prepare CSV data
  const downloadCSV = () => {
    const headers = [
      "Date Purchased",
      "Purchaser Name", 
      "Student ID",
      "Ticket Number",
      "Attendee Name",
      "Ticket Type",
      "Price",
      "Payment Type"
    ];

    const rows = orders.flatMap(order => 
      order.tickets.map(ticket => [
        new Date(order.created_at).toLocaleDateString(),
        order.purchaser_name,
        order.student_id || "",
        ticket.ticket_number,
        ticket.attendee_name,
        ticket.ticket_type,
        ticket.price,
        order.payment_method
      ])
    ).sort((a, b) => Number(a[3]) - Number(b[3])); // Sort by ticket number

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.name}-tickets.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
        <div className="space-y-4">
          <Link 
            href={`/sell/${event.id}`}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to selling
          </Link>
          <div>
            <h1 className="text-4xl font-bold tracking-tight">{event.name}</h1>
            <div className="flex items-center gap-2 mt-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{new Date(event.event_date).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <Button onClick={downloadCSV} variant="outline" className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export to CSV
        </Button>
      </div>

      <Card className="bg-gradient-to-br from-blue-50/10 to-blue-100 dark:from-blue-900/50 dark:to-blue-800/50">
        <CardHeader>
          <CardTitle className="text-blue-800 dark:text-blue-200">Event Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-300">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm font-medium">Total Revenue</span>
              </div>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-50">
                ${eventSummary.totalSales.toFixed(2)}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-300">
                <Receipt className="h-4 w-4" />
                <span className="text-sm font-medium">Total Tickets</span>
              </div>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-50">
                {eventSummary.totalStudentTickets + eventSummary.totalGuestTickets}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-300">
                <UserCheck className="h-4 w-4" />
                <span className="text-sm font-medium">Student Tickets</span>
              </div>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-50">
                {eventSummary.totalStudentTickets}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-300">
                <Users className="h-4 w-4" />
                <span className="text-sm font-medium">Guest Tickets</span>
              </div>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-50">
                {eventSummary.totalGuestTickets}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {Object.values(dailySummaries).map(summary => (
          <Card 
            key={summary.date} 
            className="relative overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5 group"
          >
            <CardHeader className="p-4 pb-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">
                  {new Date(summary.date).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </h3>
                <div className="flex items-center gap-1.5">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {summary.studentCount + summary.guestCount}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 group">
                  <div className="w-3 h-3 rounded-full bg-blue-500/20 ring-1 ring-blue-500/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 m-[3px]" />
                  </div>
                  <div className="flex items-center justify-between flex-1">
                    <span className="text-sm font-medium">Students</span>
                    <span className="text-sm">{summary.studentCount}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 m-[3px]" />
                  </div>
                  <div className="flex items-center justify-between flex-1">
                    <span className="text-sm font-medium">Guests</span>
                    <span className="text-sm">{summary.guestCount}</span>
                  </div>
                </div>
              </div>

              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                  style={{ 
                    width: `${(summary.studentCount / (summary.studentCount + summary.guestCount)) * 100}%` 
                  }}
                />
              </div>

              <div className="pt-2 flex items-end justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-3xl font-bold tracking-tight">
                    ${summary.total.toFixed(2)}
                  </p>
                </div>
            
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name, student ID, or ticket number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="name">Name: A to Z</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Ticket Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tickets</SelectItem>
                <SelectItem value="student">Student Only</SelectItem>
                <SelectItem value="guest">Guest Only</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priceRange} onValueChange={setPriceRange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Price Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Prices</SelectItem>
                <SelectItem value="0-20">$0 - $20</SelectItem>
                <SelectItem value="21-40">$21 - $40</SelectItem>
                <SelectItem value="41-60">$41 - $60</SelectItem>
                <SelectItem value="60+">$60+</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <Alert>
            <AlertDescription>
              No transactions were found for this event.
            </AlertDescription>
          </Alert>
        ) : (
          <Accordion type="multiple" className="space-y-4">
            {filteredOrders.map(order => (
              <AccordionItem 
                key={order.id} 
                value={order.id} 
                className="border rounded-lg overflow-hidden bg-card"
              >
                <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-muted/50">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full">
                    <div className="flex-1">
                      <p className="font-semibold text-left">{order.purchaser_name}</p>
                      {order.student_id && (
                        <p className="text-sm text-muted-foreground text-left">ID: {order.student_id}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm">
                          {new Date(order.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        <span className="font-medium">
                          ${order.total_amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                
                <AccordionContent>
                  <div className="px-6 py-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticket #</TableHead>
                          <TableHead>Attendee</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {order.tickets.map(ticket => (
                          <TableRow key={ticket.id}>
                            <TableCell className="font-medium">#{ticket.ticket_number}</TableCell>
                            <TableCell>{ticket.attendee_name}</TableCell>
                            <TableCell>
                              <Badge variant={ticket.ticket_type === 'student' ? 'default' : 'secondary'}>
                                {ticket.ticket_type}
                              </Badge>
                            </TableCell>
                            <TableCell>${ticket.price.toFixed(2)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingTicket(ticket)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Edit Ticket #{ticket.ticket_number}</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                      <div className="space-y-2">
                                        <Label>Attendee Name</Label>
                                        <Input
                                          defaultValue={ticket.attendee_name}
                                          onChange={(e) => setEditingTicket(prev => 
                                            prev ? { ...prev, attendee_name: e.target.value } : null
                                          )}
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Price</Label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          defaultValue={ticket.price}
                                          onChange={(e) => setEditingTicket(prev => 
                                            prev ? { ...prev, price: parseFloat(e.target.value) } : null
                                          )}
                                        />
                                      </div>
                                    </div>
                                    <DialogFooter>
                                      <Button
                                        onClick={() => {
                                          if (editingTicket) {
                                            handleEdit(ticket.id, editingTicket);
                                          }
                                        }}
                                      >
                                        Save Changes
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-destructive">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Ticket</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete ticket #{ticket.ticket_number}? 
                                        This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        className="bg-destructive hover:bg-destructive/90"
                                        onClick={() => handleDelete(ticket.id)}
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
} 