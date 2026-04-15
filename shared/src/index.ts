export interface HealthResponse {
  ok: boolean;
  service: string;
}

export interface TableSummary {
  id: string;
  name: string;
  status: "available" | "occupied" | "reserved";
}

export interface StatsPoint {
  label: string;
  value: number;
}

export interface TopProductStat extends StatsPoint {
  quantity: number;
}

export interface TableRotationStat extends StatsPoint {
  turns: number;
}

export interface PeakHourStat extends StatsPoint {
  orders: number;
}

export interface StatsSummary {
  ticketAverage: number;
  currentWeekSales: number;
  previousWeekSales: number;
  weekOverWeekChange: number;
}

export interface StatsResponse {
  range: {
    from: string;
    to: string;
  };
  salesByHour: StatsPoint[];
  salesByDay: StatsPoint[];
  topProducts: TopProductStat[];
  tableRotations: TableRotationStat[];
  peakHours: PeakHourStat[];
  summary: StatsSummary;
}

export interface DashboardMetricComparison {
  current: number;
  previous: number | null;
  changePercent: number | null;
}

export interface DashboardSalesByHourPoint {
  hour: string;
  total: number;
}

export interface DashboardTopProduct {
  name: string;
  quantity: number;
  total: number;
}

export interface DashboardRecentBill {
  id: string;
  paidAt: string;
  tableLabel: string;
  waiterName: string;
  items: number;
  total: number;
  paymentMethod: "CASH" | "CARD" | "MIXED";
}

export interface DashboardStatsResponse {
  totalSales: DashboardMetricComparison;
  totalOrders: DashboardMetricComparison;
  averageTicket: DashboardMetricComparison;
  activeTables: DashboardMetricComparison;
  salesByHour: DashboardSalesByHourPoint[];
  topProducts: DashboardTopProduct[];
  recentBills: DashboardRecentBill[];
}
