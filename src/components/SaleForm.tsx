'use client';

import { supabase } from "@/lib/supabase";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Ticket, User, CreditCard, Loader2, Badge, AlertCircle, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, Receipt } from "lucide-react";
import { useRouter } from "next/navigation";


type Ticket = {
  attendeeName: string;
  ticketType: "student" | "guest";
  studentId?: string;
  linkedToStudent?: string;
  isChild?: boolean;
};

export default function SaleForm({ event }: { event: any }) {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([{
    attendeeName: "",
    ticketType: "student",
    studentId: ""
  }]);
  const [cashReceived, setCashReceived] = useState<string>("");
  const [lastTicketNumber, setLastTicketNumber] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successDetails, setSuccessDetails] = useState<{
    startingNumber: number;
    ticketCount: number;
    total: number;
    changeDue: number;
    ticketDetails: Ticket[];
  } | null>(null);
  const [currentTicketNumber, setCurrentTicketNumber] = useState<number>(0);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const channel = supabase
      .channel('ticket_sequence_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_sequence',
          filter: `event_id=eq.${event.id}`
        },
        (payload: any) => {
          const newNumber = payload.new.last_ticket_number;
          setLastTicketNumber(newNumber);
          
          // If our current displayed number is less than or equal to the new number,
          // increment our display to avoid overlap
          if (currentTicketNumber <= newNumber) {
            setCurrentTicketNumber(newNumber + 1);
          }
        }
      )
      .subscribe();

    // Get initial ticket number
    const fetchLastTicketNumber = async () => {
      const { data } = await supabase
        .from('ticket_sequence')
        .select('last_ticket_number')
        .eq('event_id', event.id)
        .single();
      
      if (data) {
        const lastNumber = data.last_ticket_number;
        setLastTicketNumber(lastNumber);
        setCurrentTicketNumber(lastNumber + 1);
      }
    };

    fetchLastTicketNumber();

    return () => {
      channel.unsubscribe();
    };
  }, [event.id]);

  const totalPrice = tickets.reduce((sum, ticket) => {
    if (ticket.ticketType === "student") {
      return sum + event.student_price;
    }
    // If it's a guest and not a child, charge guest price
    if (ticket.ticketType === "guest" && !ticket.isChild) {
      return sum + event.guest_price;
    }
    // Child tickets are free
    return sum;
  }, 0);

  const canAddTicket = tickets.length < event.ticket_limit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    if (!cashReceived || parseFloat(cashReceived) < totalPrice) {
      alert("Please enter the correct cash amount received");
      return;
    }

    setIsSubmitting(true);
    
    try {
      // First, check if our numbers are still valid
      const { data: currentSequence } = await supabase
        .from('ticket_sequence')
        .select('last_ticket_number')
        .eq('event_id', event.id)
        .single();

      if (currentSequence && currentSequence.last_ticket_number >= currentTicketNumber) {
        setCurrentTicketNumber(currentSequence.last_ticket_number + 1);
        alert("Ticket numbers have changed. Please review and submit again.");
        setIsSubmitting(false);
        return;
      }

      // Reserve ticket numbers using a database function
      const { data: sequence, error: sequenceError } = await supabase
        .rpc('reserve_ticket_numbers', {
          p_event_id: event.id,
          p_count: tickets.length
        });

      if (sequenceError) {
        console.error('Sequence Error:', sequenceError);
        throw sequenceError;
      }

      console.log('Reserved sequence:', sequence);
      const startingNumber = sequence - tickets.length + 1;
      
      // Create the order
      const purchaserName = tickets[0].attendeeName || "";
      
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          event_id: event.id,
          purchaser_name: purchaserName,
          student_id: tickets.find(t => t.ticketType === "student")?.studentId,
          payment_method: "cash",
          total_amount: totalPrice
        })
        .select()
        .single();

      if (orderError) {
        console.error('Order Error:', orderError);
        throw orderError;
      }

      console.log('Created order:', order);

      // Create tickets with sequential numbers
      const ticketPromises = tickets.map((ticket, index) => {
        // Check if there's a student ticket in the order
        const studentTicket = tickets.find(t => t.ticketType === "student");
        
        const ticketData = {
          order_id: order.id,
          event_id: event.id,
          attendee_name: ticket.ticketType === "guest" && studentTicket
            ? `${ticket.attendeeName} w/ ${studentTicket.attendeeName}${ticket.isChild ? ' (Child)' : ''}`
            : ticket.attendeeName,
          ticket_type: ticket.ticketType,
          ticket_number: startingNumber + index,
          price: ticket.ticketType === "student" 
            ? event.student_price 
            : (ticket.isChild ? 0 : event.guest_price)
        };
        console.log('Creating ticket:', ticketData);
        return supabase
          .from("tickets")
          .insert(ticketData)
          .select()
          .single();
      });

      const ticketResults = await Promise.all(ticketPromises);
      
      // Check for any ticket creation errors
      const ticketErrors = ticketResults.filter(result => result.error);
      if (ticketErrors.length > 0) {
        console.error('Ticket creation errors:', ticketErrors);
        throw new Error('Failed to create some tickets');
      }

      console.log('Created tickets:', ticketResults.map(r => r.data));

      // Instead of alert, set success details and show dialog
      setSuccessDetails({
        startingNumber,
        ticketCount: tickets.length,
        total: totalPrice,
        changeDue: parseFloat(cashReceived) - totalPrice,
        ticketDetails: tickets
      });
      setShowSuccessDialog(true);

      // Move the form reset after showing the dialog
      setTimeout(() => {
        setTickets([{
          attendeeName: "",
          ticketType: "student",
          studentId: ""
        }]);
        setCashReceived("");
      }, 100);

    } catch (error) {
      console.error(error);
      alert("Error processing sale");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen  py-12 px-4 sm:px-6 lg:px-14">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto"
      >
        <Card className="backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 shadow-xl rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-orange-600/20 to-red-800/20 text-gray-900 p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div className="flex flex-col">
                  <CardTitle className="text-3xl font-bold tracking-tight text-gray-900">{event.name}</CardTitle>
                  <div className="flex gap-3 mt-1">
                    <div className="flex items-center gap-2 bg-black/10 border border-black/20 rounded-lg px-4 py-1">
                      <span className="text-sm font-medium text-gray-900 mt-0.5">Student</span>
                      <span className="text-lg font-bold text-gray-900">${event.student_price}</span>
                    </div>
                    <div className="flex items-center gap-2 bg-black/10 border border-black/20 rounded-lg px-4 py-1">
                      <span className="text-sm font-medium text-gray-900 mt-0.5">Guest</span>
                      <span className="text-lg font-bold text-gray-900">${event.guest_price}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center bg-black/5 border border-black/20 rounded-xl px-5 py-3 shadow-lg">
                <span className="text-3xl font-bold tracking-tighter text-gray-900">{lastTicketNumber}</span>
                <span className="text-sm font-medium text-gray-900">Tickets Sold</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <AnimatePresence>
                {tickets.map((ticket, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="bg-white dark:bg-gray-700 shadow-md">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-xl font-semibold text-blue-600 dark:text-blue-400">
                          Ticket #{lastTicketNumber + 1 + index}
                        </CardTitle>
                        {index > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newTickets = [...tickets];
                              newTickets.splice(index, 1);
                              setTickets(newTickets);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="relative">
                          <User className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
                          <Input
                            type="text"
                            value={ticket.attendeeName}
                            onChange={(e) => {
                              const newTickets = [...tickets];
                              newTickets[index].attendeeName = e.target.value;
                              setTickets(newTickets);
                            }}
                            className="pl-10 h-12"
                            required
                            placeholder="Attendee name"
                          />
                        </div>

                        <RadioGroup
                          value={ticket.ticketType}
                          onValueChange={(value: "student" | "guest") => {
                            const newTickets = [...tickets];
                            newTickets[index].ticketType = value;
                            setTickets(newTickets);
                          }}
                          className="grid grid-cols-2 gap-4"
                        >
                          <Label
                            className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all
                              ${ticket.ticketType === 'student' 
                                ? 'bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-700' 
                                : 'bg-gray-50 dark:bg-gray-800 border-transparent'} 
                              border-2`}
                          >
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="student" id={`student-${index}`} />
                              <span className="font-medium dark:text-white">Student</span>
                            </div>
                            <span className="text-sm text-blue-600 dark:text-blue-300">${event.student_price}</span>
                          </Label>
                          <Label
                            className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all
                              ${ticket.ticketType === 'guest' 
                                ? 'bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-700' 
                                : 'bg-gray-50 dark:bg-gray-800 border-transparent'} 
                              border-2`}
                          >
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="guest" id={`guest-${index}`} />
                              <span className="font-medium dark:text-white">Guest</span>
                            </div>
                            <span className="text-sm text-blue-600 dark:text-blue-300">${event.guest_price}</span>
                          </Label>
                        </RadioGroup>

                        {ticket.ticketType === "student" && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                          >
                            <Input
                              type="text"
                              value={ticket.studentId}
                              onChange={(e) => {
                                const newTickets = [...tickets];
                                newTickets[index].studentId = e.target.value;
                                setTickets(newTickets);
                              }}
                              className="h-12"
                              placeholder="Student ID"
                            />
                          </motion.div>
                        )}

                        {ticket.ticketType === "guest" && (
                          <Button
                            type="button"
                            variant={ticket.isChild ? "default" : "outline"}
                            size="sm"
                            className={`w-full ${
                              ticket.isChild 
                                ? 'bg-green-100 hover:bg-green-200 text-green-700 border-green-200' 
                                : 'text-gray-600'
                            }`}
                            onClick={() => {
                              const newTickets = [...tickets];
                              newTickets[index].isChild = !newTickets[index].isChild;
                              setTickets(newTickets);
                            }}
                          >
                            <div className="flex items-center justify-center gap-2">
                              {ticket.isChild ? (
                                <>
                                  <Check className="h-4 w-4" />
                                  <span>Child (Free Admission)</span>
                                </>
                              ) : (
                                <span>Mark as Child (Under {event.child_limit || 5})</span>
                              )}
                            </div>
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>

              {canAddTicket && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed border-2 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  onClick={() => setTickets([...tickets, {
                    attendeeName: "",
                    ticketType: "guest",
                    isChild: false
                  }])}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Guest Ticket
                </Button>
              )}

              <Card className="bg-white dark:bg-gray-700 shadow-md">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold">Payment Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Total Due</span>
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">${totalPrice.toFixed(2)}</span>
                  </div>

                  <div className="relative">
                    <CreditCard className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
                    <Input
                      type="number"
                      step="0.01"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="pl-10 h-12"
                      required
                      placeholder="Cash received (numbers only)"
                    />
                  </div>

                  {cashReceived && parseFloat(cashReceived) >= totalPrice && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-green-700 dark:text-green-300">Change Due</span>
                        <span className="text-xl font-bold text-green-700 dark:text-green-300">
                          ${(parseFloat(cashReceived) - totalPrice).toFixed(2)}
                        </span>
                      </div>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </form>
          </CardContent>
          <CardFooter className="bg-gray-50 dark:bg-gray-800 p-6 flex flex-col space-y-4">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-14 text-lg font-medium bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>Complete Transaction</span>
                  <ArrowRight className="h-5 w-5" />
                </div>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.push(`/admin/${event.id}`)}
            >
              Go to Transactions
            </Button>
          </CardFooter>
        </Card>
      </motion.div>

      <AlertDialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-green-600 text-2xl">
              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-full">
                <Receipt className="h-6 w-6" />
              </div>
              Sale Complete!
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-6 mt-4">
              <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-xl space-y-4">
                <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                  <Ticket className="h-5 w-5" />
                  <span className="text-lg font-medium">
                    {successDetails?.ticketCount === 1
                      ? "1 Ticket Issued"
                      : `${successDetails?.ticketCount} Tickets Issued`}
                  </span>
                </div>
                
                <div className="grid gap-3">
                  {successDetails?.ticketDetails?.map((ticket, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between text-sm bg-white dark:bg-green-900/30 p-4 border border-green-200 dark:border-green-800 rounded-lg"
                    >
                      <div className="space-y-1">
                        <span className="font-semibold text-base text-green-700 dark:text-green-300 block">
                          #{successDetails.startingNumber + index}
                        </span>
                        <span className="text-green-600 dark:text-green-400">
                          {ticket.ticketType === "guest" 
                            ? `${ticket.attendeeName}${ticket.isChild ? ' (Child)' : ''}${successDetails.ticketDetails.find(t => t.ticketType === "student")?.attendeeName ? ` w/ ${successDetails.ticketDetails.find(t => t.ticketType === "student")?.attendeeName}` : ''}`
                            : ticket.attendeeName}
                        </span>
                      </div>
                      {/* @ts-ignore */}
                      <Badge variant={ticket.ticketType === "student" ? "default" : "secondary"} className="capitalize">
                        {ticket.ticketType}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-medium">${successDetails?.total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cash Received</span>
                      <span className="font-medium">${cashReceived}</span>
                    </div>
                    <div className="flex justify-between text-lg text-green-600 font-semibold pt-2 border-t">
                      <span>Change Due</span>
                      <span>${successDetails?.changeDue.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                <div className="flex gap-3">
                  <div className="text-blue-500">
                    <User className="h-5 w-5" />
                  </div>
                  <p className="text-blue-800 dark:text-blue-200 text-sm">
                    Please verify that you have handed the physical tickets to the customer before closing this window.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction 
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-medium"
              onClick={() => setShowSuccessDialog(false)}
            >
              <div className="flex items-center justify-center gap-2">
                <Check className="h-5 w-5" />
                I've handed the tickets to the attendee
              </div>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Invalid Ticket Selection
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {errorMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction 
              onClick={() => setShowErrorDialog(false)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Understood
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 