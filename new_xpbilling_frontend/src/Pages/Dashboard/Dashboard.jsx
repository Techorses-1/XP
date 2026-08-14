import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    FaRupeeSign, FaFileInvoiceDollar, FaUsers, FaCalendarCheck,
    FaChartBar, FaChartPie, FaListAlt, FaBoxOpen,
    FaTrophy, FaArrowUp, FaArrowDown, FaCalendarAlt,
    FaExclamationTriangle, FaCheckCircle, FaFlask, FaBox,
    FaClock, FaInfoCircle, FaBuilding, FaShoppingCart
} from "react-icons/fa";
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, LineChart, Line,
    ComposedChart
} from "recharts";
import Navbar from "../../Components/Navbar/Navbar";
import "./Dashboard.scss";

// ============================================
// CONSTANTS
// ============================================
const TIME_FILTERS = [
    { label: "Today", value: "today" },
    { label: "This Week", value: "this-week" },
    { label: "This Month", value: "this-month" },
    { label: "Last 6 Months", value: "last-6-months" },
    { label: "This Year", value: "this-year" },
    { label: "Last Year", value: "last-year" },
    { label: "Current FY", value: "current-financial-year" },
    { label: "Last FY", value: "last-financial-year" }
];

const CHART_COLORS = {
    primary: "#3f3f91",
    primaryLight: "#6a6ac5",
    success: "#28a745",
    warning: "#e67e22",
    danger: "#dc3545",
    info: "#17a2b8",
    purple: "#8b7ad6",
    teal: "#1abc9c",
    orange: "#fd7e14",
    pink: "#e83e8c"
};

const PIE_COLORS = [
    CHART_COLORS.primary,
    CHART_COLORS.info,
    CHART_COLORS.success,
    CHART_COLORS.warning,
    CHART_COLORS.danger
];

// ============================================
// CUSTOM TOOLTIP
// ============================================
const CustomTooltip = ({ active, payload, label, prefix = "₹" }) => {
    if (!active || !payload || !payload.length) return null;
    return (
        <div style={{
            background: '#fff',
            border: '1px solid #eaeef6',
            borderRadius: '10px',
            padding: '10px 14px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
            fontFamily: "'Open Sans', sans-serif",
            fontSize: '13px'
        }}>
            <p style={{ margin: '0 0 6px', fontFamily: "'Roboto', sans-serif", fontWeight: 700, color: '#2d2f87', fontSize: '13px' }}>
                {label}
            </p>
            {payload.map((entry, i) => (
                <p key={i} style={{ margin: '3px 0', color: entry.color, fontWeight: 600 }}>
                    {entry.name}: {prefix}{typeof entry.value === 'number' ? entry.value.toLocaleString('en-IN') : entry.value}
                </p>
            ))}
        </div>
    );
};

const CustomPieTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    return (
        <div style={{
            background: '#fff',
            border: '1px solid #eaeef6',
            borderRadius: '10px',
            padding: '10px 14px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
            fontFamily: "'Open Sans', sans-serif",
            fontSize: '13px'
        }}>
            <p style={{ margin: 0, fontFamily: "'Roboto', sans-serif", fontWeight: 700, color: payload[0].payload.fill }}>
                {payload[0].name}
            </p>
            <p style={{ margin: '4px 0 0', fontWeight: 600, color: '#555' }}>
                {payload[0].value.toLocaleString('en-IN')}
            </p>
        </div>
    );
};

// ============================================
// STAT CARD COMPONENT
// ============================================
const StatCard = ({ label, value, icon, iconClass, cardClass, change, changeText, prefix = "" }) => (
    <div className={`db-stat-card ${cardClass}`}>
        <div className={`db-stat-icon ${iconClass}`}>{icon}</div>
        <div className="db-stat-body">
            <div className="db-stat-label">{label}</div>
            <div className="db-stat-value">{prefix}{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</div>
            {change !== undefined && (
                <div className={`db-stat-change ${change > 0 ? 'db-change-up' : change < 0 ? 'db-change-down' : 'db-change-neutral'}`}>
                    {change > 0 ? <FaArrowUp /> : change < 0 ? <FaArrowDown /> : null}
                    <span>{Math.abs(change)}%</span>
                    <span className="db-change-text">{changeText}</span>
                </div>
            )}
        </div>
    </div>
);

// ============================================
// SKELETON LOADER
// ============================================
const SkeletonCard = () => (
    <div className="db-stat-card">
        <div className="db-skeleton db-stat-icon" style={{ width: 44, height: 44, borderRadius: 12 }}></div>
        <div className="db-stat-body" style={{ width: '100%' }}>
            <div className="db-skeleton db-skeleton-text short"></div>
            <div className="db-skeleton" style={{ height: 28, width: '60%', borderRadius: 6, margin: '8px 0' }}></div>
            <div className="db-skeleton db-skeleton-text short"></div>
        </div>
    </div>
);

// ============================================
// MAIN COMPONENT
// ============================================
const Dashboard = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [timeFilter, setTimeFilter] = useState("today");

    // Stats
    const [stats, setStats] = useState({
        totalRevenue: 0,
        totalInvoices: 0,
        totalCustomers: 0,
        totalWorkshops: 0,
        revenueChange: 0,
        invoiceChange: 0,
        customerChange: 0,
        workshopChange: 0,
        avgInvoiceValue: 0,
        gstCollected: 0,
        activePromos: 0
    });

    // Chart data
    const [revenueData, setRevenueData] = useState([]);
    const [paymentMethodData, setPaymentMethodData] = useState([]);
    const [recentInvoices, setRecentInvoices] = useState([]);
    const [inventoryAlerts, setInventoryAlerts] = useState([]);
    const [topXPOils, setTopXPOils] = useState([]);
    const [topDispenserOils, setTopDispenserOils] = useState([]);
    const [topPackages, setTopPackages] = useState([]);
    const [lowStockCount, setLowStockCount] = useState(0);
    const [outOfStockCount, setOutOfStockCount] = useState(0);
    const [workshopsByFilter, setWorkshopsByFilter] = useState([]);
    const [todayWorkshops, setTodayWorkshops] = useState([]);
    const [upcomingWorkshops, setUpcomingWorkshops] = useState([]);
    const [pendingInvoices, setPendingInvoices] = useState([]);
    const [loyaltySummary, setLoyaltySummary] = useState({
        totalEarned: 0,
        totalUsed: 0,
        totalLoyaltyDiscount: 0
    });
    const [salesByInventory, setSalesByInventory] = useState({
        xp: [],
        dispenser: [],
        packages: []
    });
    const [purchaseByInventory, setPurchaseByInventory] = useState({
        xp: [],
        dispenser: []
    });
    const [filterLabel, setFilterLabel] = useState("Today");

    // ============================================
    // FETCH DASHBOARD DATA
    // ============================================
    const fetchDashboardData = async (filter) => {
        try {
            setIsLoading(true);
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/dashboard/get-dashboard-data?filter=${filter}`,
                { credentials: 'include' }
            );

            if (!response.ok) {
                if (response.status === 401) { navigate('/login'); return; }
                throw new Error('Failed to fetch dashboard data');
            }

            const result = await response.json();
            const data = result.data;

            if (result.success) {
                // Filter Label
                setFilterLabel(data.filter?.label || filter);

                // Stats
                setStats({
                    totalRevenue: data.sales?.totalRevenue || 0,
                    totalInvoices: data.sales?.invoiceCount || 0,
                    totalCustomers: data.customers?.total || 0,
                    totalWorkshops: data.workshops?.byFilter?.length || 0,
                    revenueChange: 0,
                    invoiceChange: 0,
                    customerChange: 0,
                    workshopChange: 0,
                    avgInvoiceValue: data.sales?.avgInvoiceValue || 0,
                    gstCollected: data.sales?.totalGST || 0,
                    activePromos: data.promoUsage?.length || 0
                });

                // Charts
                setRevenueData(data.revenueTrend || []);
                setPaymentMethodData(data.paymentBreakdown || []);
                setRecentInvoices(data.recentActivity?.invoices || []);
                setInventoryAlerts(data.inventory?.lowStock?.items || []);
                setLowStockCount(data.inventory?.lowStock?.count || 0);
                setOutOfStockCount(data.inventory?.outOfStock?.count || 0);
                setTopXPOils(data.topSelling?.xpOils || []);
                setTopDispenserOils(data.topSelling?.dispenserOils || []);
                setTopPackages(data.topSelling?.packages || []);

                // ✅ NEW: Workshops by filter
                setWorkshopsByFilter(data.workshops?.byFilter || []);
                setTodayWorkshops(data.workshops?.today || []);
                setUpcomingWorkshops(data.workshops?.upcoming || []);
                setPendingInvoices(data.workshops?.pendingInvoices || []);

                // ✅ NEW: Sales by Inventory
                setSalesByInventory({
                    xp: data.salesByInventory?.xp || [],
                    dispenser: data.salesByInventory?.dispenser || [],
                    packages: data.salesByInventory?.packages || []
                });

                // ✅ NEW: Purchase by Inventory
                setPurchaseByInventory({
                    xp: data.purchaseByInventory?.xp || [],
                    dispenser: data.purchaseByInventory?.dispenser || []
                });

                setLoyaltySummary(data.loyaltySummary || {
                    totalEarned: 0,
                    totalUsed: 0,
                    totalLoyaltyDiscount: 0
                });
            }

        } catch (error) {
            console.error("Error fetching dashboard:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData(timeFilter);
    }, [timeFilter]);

    // ============================================
    // HELPERS
    // ============================================
    const formatCurrency = (val) =>
        `₹${(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

    const getPaymentBadgeClass = (method) => {
        if (!method) return '';
        const m = method.toLowerCase();
        if (m === 'cash') return 'db-status-cash';
        if (m === 'upi') return 'db-status-upi';
        if (m === 'card') return 'db-status-card';
        return '';
    };

    const getInitials = (name) => {
        if (!name) return '?';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatTime = (timeString) => {
        if (!timeString) return '-';
        return timeString;
    };

    const today = new Date().toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    // ============================================
    // RENDER — LOADING
    // ============================================
    if (isLoading) {
        return (
            <Navbar>
                <div className="db-main">
                    <div className="db-welcome-header" style={{ maxWidth: 1300, margin: '0 auto 28px' }}>
                        <div className="db-welcome-left">
                            <div className="db-skeleton" style={{ height: 30, width: 280, borderRadius: 8 }}></div>
                            <div className="db-skeleton" style={{ height: 14, width: 200, borderRadius: 6, marginTop: 8 }}></div>
                        </div>
                    </div>
                    <div className="db-stats-grid">
                        {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
                    </div>
                    <div className="db-loading-container">
                        <div className="db-loading-spinner"></div>
                        <p>Loading dashboard...</p>
                    </div>
                </div>
            </Navbar>
        );
    }

    // ============================================
    // RENDER — MAIN
    // ============================================
    return (
        <Navbar>
            <div className="db-main">

                {/* ── Welcome Header ── */}
                <div className="db-welcome-header">
                    <div className="db-welcome-left">
                        <h1>Welcome back, <span>Admin</span> 👋</h1>
                        <p>Here's what's happening with your business today.</p>
                    </div>
                    <div className="db-date-chip">
                        <FaCalendarAlt />
                        {today}
                    </div>
                </div>

                {/* ── Time Filter Tabs ── */}
                <div style={{ maxWidth: 1300, margin: '0 auto 24px' }}>
                    <div className="db-time-filters">
                        {TIME_FILTERS.map(f => (
                            <button
                                key={f.value}
                                className={timeFilter === f.value ? 'db-filter-active' : ''}
                                onClick={() => setTimeFilter(f.value)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <div className="db-filter-label-display">
                        Showing data for: <strong>{filterLabel}</strong>
                    </div>
                </div>

                {/* ── 4 Main Stat Cards ── */}
                <div className="db-stats-grid">
                    <StatCard
                        label="Total Revenue"
                        value={formatCurrency(stats.totalRevenue)}
                        prefix=""
                        icon={<FaRupeeSign />}
                        iconClass="db-icon-revenue"
                        cardClass="db-stat-revenue"
                        // change={stats.revenueChange}
                        // changeText="vs previous period"
                    />
                    <StatCard
                        label="Total Invoices"
                        value={stats.totalInvoices}
                        icon={<FaFileInvoiceDollar />}
                        iconClass="db-icon-invoices"
                        cardClass="db-stat-invoices"
                        // change={stats.invoiceChange}
                        // changeText="vs previous period"
                    />
                    <StatCard
                        label="Total Customers"
                        value={stats.totalCustomers}
                        icon={<FaUsers />}
                        iconClass="db-icon-customers"
                        cardClass="db-stat-customers"
                        // change={stats.customerChange}
                        // changeText="vs previous period"
                    />
                    <StatCard
                        label="Workshops"
                        value={stats.totalWorkshops}
                        icon={<FaCalendarCheck />}
                        iconClass="db-icon-workshops"
                        cardClass="db-stat-workshops"
                        // change={stats.workshopChange}
                        // changeText="vs previous period"
                    />
                </div>

                {/* ── 3 Mini Metrics ── */}
                <div className="db-mini-metrics">
                    <div className="db-mini-metric-card">
                        <div className="db-mini-icon" style={{ background: 'linear-gradient(135deg,rgba(63,63,145,.12),rgba(106,106,197,.18))', color: '#3f3f91' }}>
                            <FaChartBar />
                        </div>
                        <div className="db-mini-body">
                            <div className="db-mini-label">Avg Invoice Value</div>
                            <div className="db-mini-value">{formatCurrency(stats.avgInvoiceValue)}</div>
                        </div>
                    </div>
                    <div className="db-mini-metric-card">
                        <div className="db-mini-icon" style={{ background: 'linear-gradient(135deg,rgba(40,167,69,.12),rgba(92,184,92,.18))', color: '#28a745' }}>
                            <FaRupeeSign />
                        </div>
                        <div className="db-mini-body">
                            <div className="db-mini-label">GST Collected</div>
                            <div className="db-mini-value">{formatCurrency(stats.gstCollected)}</div>
                        </div>
                    </div>
                    <div className="db-mini-metric-card">
                        <div className="db-mini-icon" style={{ background: 'linear-gradient(135deg,rgba(230,126,34,.12),rgba(240,173,78,.18))', color: '#e67e22' }}>
                            <FaFlask />
                        </div>
                        <div className="db-mini-body">
                            <div className="db-mini-label">Active Promo Codes</div>
                            <div className="db-mini-value">{stats.activePromos}</div>
                        </div>
                    </div>
                </div>

                {/* ── Revenue + Purchase Trend ── */}
                {/* <div className="db-chart-card db-chart-full">
                    <div className="db-chart-header">
                        <h3><FaChartBar /> Revenue & Purchase Trend</h3>
                        <div className="db-chart-badge-group">
                            <span className="db-chart-badge db-badge-revenue">
                                <FaRupeeSign /> Revenue: {formatCurrency(stats.totalRevenue)}
                            </span>
                            <span className="db-chart-badge db-badge-purchase">
                                <FaShoppingCart /> Purchase: {formatCurrency(stats.gstCollected)}
                            </span>
                        </div>
                    </div>
                    <div className="db-chart-body">
                        {revenueData.length === 0 ? (
                            <div className="db-chart-empty">
                                <FaChartBar />
                                <p>No data for this period</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <ComposedChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.2} />
                                            <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" />
                                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#8891a5' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12, fill: '#8891a5' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend />
                                    <Area
                                        type="monotone"
                                        dataKey="revenue"
                                        name="Revenue"
                                        stroke={CHART_COLORS.primary}
                                        strokeWidth={2.5}
                                        fill="url(#revGradient)"
                                        dot={{ r: 3, fill: CHART_COLORS.primary }}
                                        activeDot={{ r: 6, fill: CHART_COLORS.primary }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="purchase"
                                        name="Purchase"
                                        stroke={CHART_COLORS.warning}
                                        strokeWidth={2.5}
                                        dot={{ r: 3, fill: CHART_COLORS.warning }}
                                        activeDot={{ r: 6, fill: CHART_COLORS.warning }}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div> */}

                {/* ── Revenue Trend & Purchase Trend (2 Separate Charts) ── */}
                <div className="db-charts-row db-charts-row-50-50">

                    {/* Revenue Trend */}
                    <div className="db-chart-card">
                        <div className="db-chart-header">
                            <h3><FaChartBar /> Revenue Trend</h3>
                            <div className="db-chart-badge">
                                <FaRupeeSign /> {formatCurrency(stats.totalRevenue)}
                            </div>
                        </div>
                        <div className="db-chart-body">
                            {revenueData.length === 0 ? (
                                <div className="db-chart-empty">
                                    <FaChartBar />
                                    <p>No revenue data for this period</p>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={240}>
                                    <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.2} />
                                                <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" />
                                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#8891a5' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 12, fill: '#8891a5' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Area
                                            type="monotone"
                                            dataKey="revenue"
                                            name="Revenue"
                                            stroke={CHART_COLORS.primary}
                                            strokeWidth={2.5}
                                            fill="url(#revGradient)"
                                            dot={{ r: 3, fill: CHART_COLORS.primary }}
                                            activeDot={{ r: 6, fill: CHART_COLORS.primary }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* Purchase Trend */}
                    <div className="db-chart-card">
                        <div className="db-chart-header">
                            <h3><FaShoppingCart /> Purchase Trend</h3>
                            <div className="db-chart-badge db-badge-purchase">
                                <FaShoppingCart /> {formatCurrency(stats.gstCollected)}
                            </div>
                        </div>
                        <div className="db-chart-body">
                            {revenueData.length === 0 ? (
                                <div className="db-chart-empty">
                                    <FaShoppingCart />
                                    <p>No purchase data for this period</p>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={240}>
                                    <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="purchaseGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={CHART_COLORS.warning} stopOpacity={0.2} />
                                                <stop offset="95%" stopColor={CHART_COLORS.warning} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" />
                                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#8891a5' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 12, fill: '#8891a5' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                                        <Tooltip content={<CustomTooltip prefix="₹" />} />
                                        <Area
                                            type="monotone"
                                            dataKey="purchase"
                                            name="Purchase"
                                            stroke={CHART_COLORS.warning}
                                            strokeWidth={2.5}
                                            fill="url(#purchaseGradient)"
                                            dot={{ r: 3, fill: CHART_COLORS.warning }}
                                            activeDot={{ r: 6, fill: CHART_COLORS.warning }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── 3 Charts Row ── */}
                <div className="db-charts-row db-charts-row-33-33-33">
                    {/* Top XP Oils */}
                    <div className="db-chart-card">
                        <div className="db-chart-header">
                            <h3><FaFlask /> Top XP Oils</h3>
                        </div>
                        <div className="db-chart-body">
                            {topXPOils.length === 0 ? (
                                <div className="db-chart-empty">
                                    <FaFlask />
                                    <p>No XP oil sales</p>
                                </div>
                            ) : (
                                topXPOils.map((item, idx) => (
                                    <div key={idx} className="db-top-item">
                                        <span className="db-top-rank">{idx + 1}</span>
                                        <span className="db-top-name">{item._id}</span>
                                        <span className="db-top-qty">{item.totalSold.toFixed(3)} KG</span>
                                        <span className="db-top-revenue">{formatCurrency(item.totalRevenue)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Top Dispenser Oils */}
                    <div className="db-chart-card">
                        <div className="db-chart-header">
                            <h3><FaBoxOpen /> Top Dispenser Oils</h3>
                        </div>
                        <div className="db-chart-body">
                            {topDispenserOils.length === 0 ? (
                                <div className="db-chart-empty">
                                    <FaBoxOpen />
                                    <p>No dispenser sales</p>
                                </div>
                            ) : (
                                topDispenserOils.map((item, idx) => (
                                    <div key={idx} className="db-top-item">
                                        <span className="db-top-rank">{idx + 1}</span>
                                        <span className="db-top-name">{item._id}</span>
                                        <span className="db-top-qty">{item.totalML} ml</span>
                                        <span className="db-top-revenue">{formatCurrency(item.totalRevenue)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Top Packages */}
                    <div className="db-chart-card">
                        <div className="db-chart-header">
                            <h3><FaBox /> Top Packages</h3>
                        </div>
                        <div className="db-chart-body">
                            {topPackages.length === 0 ? (
                                <div className="db-chart-empty">
                                    <FaBox />
                                    <p>No package sales</p>
                                </div>
                            ) : (
                                topPackages.map((item, idx) => (
                                    <div key={idx} className="db-top-item">
                                        <span className="db-top-rank">{idx + 1}</span>
                                        <span className="db-top-name">{item._id}</span>
                                        <span className="db-top-qty">{item.totalSold} sold</span>
                                        <span className="db-top-revenue">{formatCurrency(item.totalRevenue)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Sales by Inventory + Purchase by Inventory ── */}
                <div className="db-charts-row db-charts-row-50-50">

                    {/* Sales by Inventory */}
                    <div className="db-chart-card">
                        <div className="db-chart-header">
                            <h3><FaChartBar /> Sales by Inventory</h3>
                        </div>
                        <div className="db-chart-body">
                            {salesByInventory.xp.length === 0 && salesByInventory.dispenser.length === 0 && salesByInventory.packages.length === 0 ? (
                                <div className="db-chart-empty">
                                    <FaChartBar />
                                    <p>No sales data</p>
                                </div>
                            ) : (
                                <div className="db-inventory-sales-list">
                                    {salesByInventory.xp.slice(0, 3).map((item, idx) => (
                                        <div key={`xp-${idx}`} className="db-inv-sale-item db-inv-xp">
                                            <span className="db-inv-sale-icon"><FaFlask /></span>
                                            <span className="db-inv-sale-name">{item._id}</span>
                                            <span className="db-inv-sale-revenue">{formatCurrency(item.totalRevenue)}</span>
                                        </div>
                                    ))}
                                    {salesByInventory.dispenser.slice(0, 3).map((item, idx) => (
                                        <div key={`disp-${idx}`} className="db-inv-sale-item db-inv-dispenser">
                                            <span className="db-inv-sale-icon"><FaBoxOpen /></span>
                                            <span className="db-inv-sale-name">{item._id}</span>
                                            <span className="db-inv-sale-revenue">{formatCurrency(item.totalRevenue)}</span>
                                        </div>
                                    ))}
                                    {salesByInventory.packages.slice(0, 3).map((item, idx) => (
                                        <div key={`pkg-${idx}`} className="db-inv-sale-item db-inv-package">
                                            <span className="db-inv-sale-icon"><FaBox /></span>
                                            <span className="db-inv-sale-name">{item._id}</span>
                                            <span className="db-inv-sale-revenue">{formatCurrency(item.totalRevenue)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Purchase by Inventory */}
                    <div className="db-chart-card">
                        <div className="db-chart-header">
                            <h3><FaShoppingCart /> Purchase by Inventory</h3>
                        </div>
                        <div className="db-chart-body">
                            {purchaseByInventory.xp.length === 0 && purchaseByInventory.dispenser.length === 0 ? (
                                <div className="db-chart-empty">
                                    <FaShoppingCart />
                                    <p>No purchase data</p>
                                </div>
                            ) : (
                                <div className="db-inventory-purchase-list">
                                    {purchaseByInventory.xp.slice(0, 5).map((item, idx) => (
                                        <div key={`xp-${idx}`} className="db-inv-purchase-item db-inv-xp">
                                            <span className="db-inv-purchase-icon"><FaFlask /></span>
                                            <span className="db-inv-purchase-name">{item._id}</span>
                                            <span className="db-inv-purchase-cost">{formatCurrency(item.totalCost)}</span>
                                        </div>
                                    ))}
                                    {purchaseByInventory.dispenser.slice(0, 5).map((item, idx) => (
                                        <div key={`disp-${idx}`} className="db-inv-purchase-item db-inv-dispenser">
                                            <span className="db-inv-purchase-icon"><FaBoxOpen /></span>
                                            <span className="db-inv-purchase-name">{item._id}</span>
                                            <span className="db-inv-purchase-cost">{formatCurrency(item.totalCost)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Payment Methods Pie ── */}
                <div className="db-chart-card db-chart-full">
                    <div className="db-chart-header">
                        <h3><FaChartPie /> Payment Methods</h3>
                    </div>
                    <div className="db-chart-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {paymentMethodData.length === 0 ? (
                            <div className="db-chart-empty">
                                <FaChartPie />
                                <p>No payment data for this period</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                                <ResponsiveContainer width="40%" height={200}>
                                    <PieChart>
                                        <Pie
                                            data={paymentMethodData}
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={80}
                                            dataKey="totalAmount"
                                            nameKey="_id"
                                        >
                                            {paymentMethodData.map((entry, index) => (
                                                <Cell
                                                    key={index}
                                                    fill={[CHART_COLORS.success, CHART_COLORS.info, CHART_COLORS.purple][index % 3]}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomPieTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '20px' }}>
                                    {paymentMethodData.map((entry, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontFamily: "'Open Sans', sans-serif", color: '#555' }}>
                                            <span style={{ width: 14, height: 14, borderRadius: '50%', background: [CHART_COLORS.success, CHART_COLORS.info, CHART_COLORS.purple][i % 3], display: 'inline-block', flexShrink: 0 }}></span>
                                            <span style={{ fontWeight: 600, minWidth: 60 }}>{entry._id}</span>
                                            <span style={{ color: '#888' }}>{entry.count} transactions</span>
                                            <span style={{ fontWeight: 700, color: '#2d2f87' }}>{formatCurrency(entry.totalAmount)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Recent Invoices ── */}
                <div className="db-recent-table-card db-card-full">
                    <div className="db-table-header">
                        <h3><FaListAlt /> Recent Invoices</h3>
                        <button className="db-view-all-link" onClick={() => navigate('/invoices')}>
                            View All →
                        </button>
                    </div>
                    <div className="db-table-wrap">
                        {recentInvoices.length === 0 ? (
                            <div className="db-chart-empty" style={{ padding: '40px 20px' }}>
                                <FaFileInvoiceDollar />
                                <p>No invoices found</p>
                            </div>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th>Invoice #</th>
                                        <th>Customer</th>
                                        <th>Amount</th>
                                        <th>Payment</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentInvoices.slice(0, 8).map((inv, i) => (
                                        <tr key={inv.invoiceNumber || i}>
                                            <td className="db-invoice-num">{inv.invoiceNumber || `#${String(i + 1).padStart(4, '0')}`}</td>
                                            <td className="db-customer-name">{inv.customer?.customerName}</td>
                                            <td className="db-amount">{formatCurrency(inv.grandTotal)}</td>
                                            <td>
                                                <span className={`db-status-badge ${getPaymentBadgeClass(inv.paymentStatus)}`}>
                                                    {inv.paymentStatus || 'Cash'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* ── Workshops Section ── */}
                <div className="db-full-row db-full-row-3">

                    {/* Workshops by Filter */}
                    <div className="db-workshops-card">
                        <div className="db-table-header">
                            <h3><FaCalendarAlt /> Workshops ({filterLabel})</h3>
                            <button className="db-view-all-link" onClick={() => navigate('/workshops')}>
                                View All →
                            </button>
                        </div>
                        {workshopsByFilter.length === 0 ? (
                            <div className="db-chart-empty" style={{ padding: '20px' }}>
                                <FaCalendarAlt />
                                <p>No workshops for this period</p>
                            </div>
                        ) : (
                            workshopsByFilter.slice(0, 6).map((w, i) => (
                                <div key={i} className="db-workshop-item">
                                    <span className="db-workshop-date">{formatDate(w.date)}</span>
                                    <span className="db-workshop-time">{formatTime(w.startTime)}</span>
                                    <span className="db-workshop-customers">{w.customerCount} customers</span>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Today's Workshops */}
                    <div className="db-workshops-card">
                        <div className="db-table-header">
                            <h3><FaCalendarCheck /> Today's Workshops</h3>
                            <button className="db-view-all-link" onClick={() => navigate('/workshops')}>
                                View All →
                            </button>
                        </div>
                        {todayWorkshops.length === 0 ? (
                            <div className="db-chart-empty" style={{ padding: '20px' }}>
                                <FaCalendarCheck />
                                <p>No workshops today</p>
                            </div>
                        ) : (
                            todayWorkshops.map((w, i) => (
                                <div key={i} className="db-workshop-item">
                                    <span className="db-workshop-date">{formatDate(w.date)}</span>
                                    <span className="db-workshop-time">{formatTime(w.startTime)}</span>
                                    <span className="db-workshop-customers">{w.customerCount} customers</span>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Upcoming Workshops */}
                    <div className="db-workshops-card">
                        <div className="db-table-header">
                            <h3><FaClock /> Upcoming Workshops</h3>
                            <button className="db-view-all-link" onClick={() => navigate('/workshops')}>
                                View All →
                            </button>
                        </div>
                        {upcomingWorkshops.length === 0 ? (
                            <div className="db-chart-empty" style={{ padding: '20px' }}>
                                <FaClock />
                                <p>No upcoming workshops</p>
                            </div>
                        ) : (
                            upcomingWorkshops.map((w, i) => (
                                <div key={i} className="db-workshop-item db-upcoming">
                                    <span className="db-workshop-date">{formatDate(w.date)}</span>
                                    <span className="db-workshop-time">{formatTime(w.startTime)}</span>
                                    <span className="db-workshop-customers">{w.customerCount} customers</span>
                                    <span className="db-workshop-badge">Upcoming</span>
                                </div>
                            ))
                        )}
                    </div>




                    {/* Pending Invoices */}
                    <div className="db-workshops-card">
                        <div className="db-table-header">
                            <h3><FaExclamationTriangle style={{ color: '#dc3545' }} /> Pending Workshop Invoices</h3>
                            <button className="db-view-all-link" onClick={() => navigate('/workshops')}>
                                View All →
                            </button>
                        </div>
                        {pendingInvoices.length === 0 ? (
                            <div className="db-chart-empty" style={{ padding: '20px' }}>
                                <FaCheckCircle style={{ color: '#28a745' }} />
                                <p>No pending invoices</p>
                            </div>
                        ) : (
                            pendingInvoices.slice(0, 6).map((w, i) => (
                                <div key={i} className="db-pending-item">
                                    <span className="db-pending-date">{formatDate(w.workshopDate)}</span>
                                    <span className="db-pending-time">{formatTime(w.workshopTime)}</span>
                                    <span className="db-pending-customers">
                                        {w.customers.slice(0, 2).map(c => c.customerName).join(', ')}
                                        {w.customers.length > 2 && ` +${w.customers.length - 2} more`}
                                    </span>
                                    <span className="db-pending-badge">No Invoice</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ── Low Stock Alerts ── */}
                <div className="db-inventory-alerts-card db-card-full">
                    <div className="db-table-header">
                        <h3><FaExclamationTriangle style={{ color: '#e67e22' }} /> Inventory Alerts</h3>
                        <button className="db-view-all-link" onClick={() => navigate('/inventory')}>
                            Manage Inventory →
                        </button>
                    </div>
                    {inventoryAlerts.length === 0 && lowStockCount === 0 && outOfStockCount === 0 ? (
                        <div className="db-alert-empty-state">
                            <FaCheckCircle />
                            <p>All inventory levels are healthy!</p>
                        </div>
                    ) : (
                        <div className="db-inventory-alerts-grid">
                            {outOfStockCount > 0 && (
                                <div className="db-alert-section">
                                    <h4 className="db-alert-empty">
                                        <FaExclamationTriangle /> Out of Stock ({outOfStockCount})
                                    </h4>
                                    {inventoryAlerts.filter(a => a.quantity === 0).slice(0, 5).map((alert, i) => (
                                        <div key={i} className="db-alert-item db-alert-empty-item">
                                            <span className="db-alert-name">{alert.productName || alert.name}</span>
                                            <span className="db-alert-qty db-alert-empty">0</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {lowStockCount > 0 && (
                                <div className="db-alert-section">
                                    <h4 className="db-alert-low">
                                        <FaExclamationTriangle /> Low Stock ({lowStockCount})
                                    </h4>
                                    {inventoryAlerts.filter(a => a.quantity > 0).slice(0, 5).map((alert, i) => (
                                        <div key={i} className="db-alert-item db-alert-low-item">
                                            <span className="db-alert-name">{alert.productName || alert.name}</span>
                                            <span className="db-alert-qty db-alert-low">{alert.quantity} / {alert.minStock}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Loyalty Summary ── */}
                <div className="db-inventory-alerts-card db-card-full">
                    <div className="db-table-header">
                        <h3><FaFlask style={{ color: '#f39c12' }} /> Loyalty Coins Summary</h3>
                    </div>
                    <div className="db-loyalty-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        <div className="db-loyalty-item">
                            <span className="db-loyalty-label">Coins Earned</span>
                            <span className="db-loyalty-value db-loyalty-earned">+{loyaltySummary.totalEarned || 0}</span>
                        </div>
                        <div className="db-loyalty-item">
                            <span className="db-loyalty-label">Coins Used</span>
                            <span className="db-loyalty-value db-loyalty-used">-{loyaltySummary.totalUsed || 0}</span>
                        </div>
                        <div className="db-loyalty-item">
                            <span className="db-loyalty-label">Loyalty Discount</span>
                            <span className="db-loyalty-value db-loyalty-discount">{formatCurrency(loyaltySummary.totalLoyaltyDiscount || 0)}</span>
                        </div>
                        <div className="db-loyalty-item">
                            <span className="db-loyalty-label">Net Coins</span>
                            <span className="db-loyalty-value db-loyalty-net">
                                +{(loyaltySummary.totalEarned || 0) - (loyaltySummary.totalUsed || 0)}
                            </span>
                        </div>
                    </div>
                </div>

            </div>
        </Navbar>
    );
};

export default Dashboard;