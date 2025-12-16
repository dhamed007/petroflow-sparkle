import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardNav from "@/components/DashboardNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { FileText, FileSpreadsheet, Download, Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

type ReportType = "orders" | "deliveries" | "invoices";
type DateRange = { from: Date | undefined; to: Date | undefined };

const Reports = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("orders");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        navigate("/auth");
      } else {
        setUser(user);
      }
    });
  }, [navigate]);

  const fetchReportData = async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) {
      throw new Error("No tenant found");
    }

    const fromDate = dateRange.from?.toISOString() || subDays(new Date(), 30).toISOString();
    const toDate = dateRange.to?.toISOString() || new Date().toISOString();

    if (reportType === "orders") {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name)")
        .eq("tenant_id", profile.tenant_id)
        .gte("created_at", fromDate)
        .lte("created_at", toDate)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data?.map((order) => ({
        "Order #": order.order_number,
        Customer: order.customers?.name || "N/A",
        Product: order.product_type,
        Quantity: `${order.quantity} ${order.unit}`,
        Status: order.status,
        Priority: order.priority || "normal",
        "Delivery Address": order.delivery_address,
        "Created At": format(new Date(order.created_at), "yyyy-MM-dd HH:mm"),
      }));
    }

    if (reportType === "deliveries") {
      const { data, error } = await supabase
        .from("deliveries")
        .select("*, orders(order_number, customers(name))")
        .eq("tenant_id", profile.tenant_id)
        .gte("created_at", fromDate)
        .lte("created_at", toDate)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data?.map((delivery) => ({
        "Order #": delivery.orders?.order_number || "N/A",
        Customer: delivery.orders?.customers?.name || "N/A",
        Vehicle: delivery.vehicle_number || "N/A",
        Status: delivery.status,
        "Departure Time": delivery.departure_time
          ? format(new Date(delivery.departure_time), "yyyy-MM-dd HH:mm")
          : "N/A",
        "Arrival Time": delivery.arrival_time
          ? format(new Date(delivery.arrival_time), "yyyy-MM-dd HH:mm")
          : "N/A",
        "Delivered Qty": delivery.delivered_quantity || "N/A",
        "Created At": format(new Date(delivery.created_at), "yyyy-MM-dd HH:mm"),
      }));
    }

    if (reportType === "invoices") {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, orders(order_number, customers(name))")
        .eq("tenant_id", profile.tenant_id)
        .gte("created_at", fromDate)
        .lte("created_at", toDate)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data?.map((invoice) => ({
        "Invoice #": invoice.invoice_number,
        "Order #": invoice.orders?.order_number || "N/A",
        Customer: invoice.orders?.customers?.name || "N/A",
        Amount: `${invoice.currency || "USD"} ${invoice.amount.toLocaleString()}`,
        Tax: `${invoice.currency || "USD"} ${(invoice.tax_amount || 0).toLocaleString()}`,
        Total: `${invoice.currency || "USD"} ${invoice.total_amount.toLocaleString()}`,
        Status: invoice.status,
        "Due Date": invoice.due_date ? format(new Date(invoice.due_date), "yyyy-MM-dd") : "N/A",
        "Paid Date": invoice.paid_date ? format(new Date(invoice.paid_date), "yyyy-MM-dd") : "N/A",
      }));
    }

    return [];
  };

  const exportToPDF = async () => {
    setLoading(true);
    try {
      const data = await fetchReportData();
      if (!data || data.length === 0) {
        toast({ title: "No data", description: "No records found for the selected period." });
        return;
      }

      const doc = new jsPDF();
      const title = `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`;
      const dateStr = `${format(dateRange.from || new Date(), "MMM dd, yyyy")} - ${format(dateRange.to || new Date(), "MMM dd, yyyy")}`;

      doc.setFontSize(18);
      doc.text(title, 14, 22);
      doc.setFontSize(11);
      doc.text(dateStr, 14, 30);
      doc.text(`Generated: ${format(new Date(), "MMM dd, yyyy HH:mm")}`, 14, 36);

      const headers = Object.keys(data[0]);
      const rows = data.map((item) => Object.values(item));

      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: 44,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [234, 88, 12] },
      });

      doc.save(`${reportType}-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: "Success", description: "PDF report downloaded successfully." });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({ title: "Error", description: "Failed to generate PDF report.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = async () => {
    setLoading(true);
    try {
      const data = await fetchReportData();
      if (!data || data.length === 0) {
        toast({ title: "No data", description: "No records found for the selected period." });
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, reportType.charAt(0).toUpperCase() + reportType.slice(1));

      XLSX.writeFile(workbook, `${reportType}-report-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast({ title: "Success", description: "Excel report downloaded successfully." });
    } catch (error) {
      console.error("Error generating Excel:", error);
      toast({ title: "Error", description: "Failed to generate Excel report.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-2">Generate and export reports for orders, deliveries, and invoices</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              reportType === "orders" && "ring-2 ring-primary"
            )}
            onClick={() => setReportType("orders")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Orders Report
              </CardTitle>
              <CardDescription>Export order data with customer details</CardDescription>
            </CardHeader>
          </Card>

          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              reportType === "deliveries" && "ring-2 ring-primary"
            )}
            onClick={() => setReportType("deliveries")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-accent" />
                Deliveries Report
              </CardTitle>
              <CardDescription>Export delivery status and timing data</CardDescription>
            </CardHeader>
          </Card>

          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              reportType === "invoices" && "ring-2 ring-primary"
            )}
            onClick={() => setReportType("invoices")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-chart-2" />
                Invoices Report
              </CardTitle>
              <CardDescription>Export billing and payment data</CardDescription>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Export Options</CardTitle>
            <CardDescription>Select date range and export format</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium">Report Type</label>
                <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="orders">Orders</SelectItem>
                    <SelectItem value="deliveries">Deliveries</SelectItem>
                    <SelectItem value="invoices">Invoices</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[280px] justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange.from}
                      selected={dateRange}
                      onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex gap-4">
              <Button onClick={exportToPDF} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export PDF
              </Button>
              <Button onClick={exportToExcel} disabled={loading} variant="secondary" className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Export Excel
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Reports;
