import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    FaChartBar, FaShoppingCart, FaBoxOpen,
    FaCalendarCheck, FaUsers, FaDownload,
    FaRupeeSign, FaFileInvoiceDollar, FaRedo,
    FaExclamationTriangle,
    FaCheckCircle, FaArrowUp, FaFilter
} from "react-icons/fa";
import Navbar from "../../Components/Navbar/Navbar";
import "./Reports.scss";

// ============================================
// CONSTANTS
// ============================================
const REPORT_TABS = [
    { id: "sales", label: "Sales", icon: <FaChartBar /> },
    { id: "purchase", label: "Purchase", icon: <FaShoppingCart /> },
    { id: "inventory", label: "Inventory", icon: <FaBoxOpen /> },
    { id: "workshop", label: "Workshops", icon: <FaCalendarCheck /> },
    { id: "customer", label: "Customers", icon: <FaUsers /> }
];

const DATE_FILTERS = [
    { value: "today", label: "Today" },
    { value: "this-week", label: "This Week" },
    { value: "this-month", label: "This Month" },
    { value: "this-year", label: "This Year" },
    { value: "custom", label: "Custom Range" }
];

const INVENTORY_TYPES = [
    { value: "all", label: "All Types" },
    { value: "xp", label: "XP Oils" },
    { value: "dispenser", label: "Dispenser" },
    { value: "packages", label: "Packages" }
];

// ============================================
// HELPERS
// ============================================
const fmt = (val) =>
    `₹${Number(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const fmtNum = (val) =>
    Number(val || 0).toLocaleString('en-IN');

const getCategoryBadgeClass = (cat) => {
    if (!cat) return '';
    const c = cat.toLowerCase();
    if (c.includes('xp')) return 'rp-badge-xp';
    if (c.includes('dispenser')) return 'rp-badge-dispenser';
    if (c.includes('package')) return 'rp-badge-package';
    if (c.includes('bottle')) return 'rp-badge-bottle';
    return 'rp-badge-xp';
};

const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

// ============================================
// SUMMARY CARD
// ============================================
const SummaryCard = ({ label, value, icon, cardClass, iconClass }) => (
    <div className={`rp-summary-card ${cardClass}`}>
        <div className={`rp-card-icon ${iconClass}`}>{icon}</div>
        <div className="rp-card-body">
            <div className="rp-card-label">{label}</div>
            <div className="rp-card-value">{value}</div>
        </div>
    </div>
);

// ============================================
// MAIN COMPONENT
// ============================================
const Reports = () => {
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState("sales");
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Filter states
    const [dateFilter, setDateFilter] = useState("this-month");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [inventoryType, setInventoryType] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [searchFilter, setSearchFilter] = useState("");

    // Report data
    const [reportData, setReportData] = useState(null);

    // ============================================
    // FETCH REPORT
    // ============================================
    const fetchReport = async (tab = activeTab) => {
        try {
            setIsLoading(true);
            setReportData(null);

            const params = new URLSearchParams();
            params.set('filter', dateFilter);
            if (dateFilter === 'custom' && fromDate) params.set('fromDate', fromDate);
            if (dateFilter === 'custom' && toDate) params.set('toDate', toDate);
            if (inventoryType !== 'all') params.set('inventoryType', inventoryType);
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (searchFilter.trim()) params.set('search', searchFilter.trim());

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/reports/${tab}?${params}`,
                { credentials: 'include' }
            );

            if (!response.ok) {
                if (response.status === 401) { navigate('/login'); return; }
                throw new Error('Failed to fetch report');
            }

            const json = await response.json();
            setReportData(json.data);
        } catch (err) {
            console.error("Error fetching report:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchReport(activeTab);
    }, [activeTab]);

    // ============================================
    // EXPORT
    // ============================================
    const handleExport = async () => {
        try {
            setIsExporting(true);

            const params = new URLSearchParams();
            params.set('filter', dateFilter);
            params.set('export', 'true');
            if (dateFilter === 'custom' && fromDate) params.set('fromDate', fromDate);
            if (dateFilter === 'custom' && toDate) params.set('toDate', toDate);
            if (inventoryType !== 'all') params.set('inventoryType', inventoryType);
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (searchFilter.trim()) params.set('search', searchFilter.trim());

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/reports/${activeTab}?${params}`,
                { credentials: 'include' }
            );

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${activeTab}_report_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Export failed:", err);
        } finally {
            setIsExporting(false);
        }
    };

    // ============================================
    // FILTER RESET
    // ============================================
    const handleReset = () => {
        setDateFilter("this-month");
        setFromDate("");
        setToDate("");
        setInventoryType("all");
        setStatusFilter("all");
        setSearchFilter("");
    };

    // ============================================
    // FILTERS VISIBILITY
    // ============================================
    const showInventoryFilter = ["sales", "purchase", "inventory"].includes(activeTab);
    const showStatusFilter = ["inventory", "workshop"].includes(activeTab);
    const showSearchFilter = activeTab === "customer";

    // ============================================
    // RENDER — SALES TABLE
    // ============================================
    const renderSalesTable = () => {
        const summary = reportData?.summary || {};
        const invoiceDetails = reportData?.invoiceDetails || [];
        const productWiseSales = reportData?.productWiseSales || [];

        return (
            <>
                <div className="rp-summary-grid rp-grid-4">
                    <SummaryCard label="Total Revenue" value={fmt(summary.totalRevenue)} icon={<FaRupeeSign />} cardClass="rp-card-primary" iconClass="rp-icon-primary" />
                    <SummaryCard label="Total Products" value={fmtNum(summary.totalProducts)} icon={<FaBoxOpen />} cardClass="rp-card-info" iconClass="rp-icon-info" />
                    <SummaryCard label="Total Invoices" value={fmtNum(summary.totalInvoices)} icon={<FaFileInvoiceDollar />} cardClass="rp-card-success" iconClass="rp-icon-success" />
                    <SummaryCard label="Total Qty Sold" value={fmtNum(summary.totalQuantity)} icon={<FaChartBar />} cardClass="rp-card-warning" iconClass="rp-icon-warning" />
                </div>

                {/* Tab 1: Invoice Details */}
                <div className="rp-table-card">
                    <div className="rp-table-header">
                        <h3><FaFileInvoiceDollar /> Invoice Details</h3>
                        <span className="rp-row-count">{invoiceDetails.length} invoices</span>
                    </div>
                    {invoiceDetails.length === 0 ? <EmptyState label="No invoices for this period" /> : (
                        <div className="rp-table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Invoice</th>
                                        <th>Customer</th>
                                        <th>Date</th>
                                        <th>Payment</th>
                                        <th>Products</th>
                                        <th>Grand Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoiceDetails.map((row, i) => (
                                        <tr key={i}>
                                            <td className="rp-cell-name">{row['Invoice Number'] || '-'}</td>
                                            <td>{row['Customer'] || '-'}</td>
                                            <td>{row['Date'] || '-'}</td>
                                            <td>{row['Payment'] || '-'}</td>
                                            <td className="rp-cell-products">{row['Products'] || '-'}</td>
                                            <td className="rp-cell-revenue">{row['Grand Total'] || fmt(0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Tab 2: Product Wise Sales (NO REVENUE! with units) */}
                <div className="rp-table-card">
                    <div className="rp-table-header">
                        <h3><FaBoxOpen /> Product Wise Sales</h3>
                        <span className="rp-row-count">{productWiseSales.length} entries</span>
                    </div>
                    {productWiseSales.length === 0 ? <EmptyState label="No product sales for this period" /> : (
                        <div className="rp-table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Invoice</th>
                                        <th>Date</th>
                                        <th>Customer</th>
                                        <th>Product</th>
                                        <th>Category</th>
                                        <th>Quantity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {productWiseSales.map((row, i) => (
                                        <tr key={i}>
                                            <td className="rp-cell-name">{row['Invoice'] || '-'}</td>
                                            <td>{row['Date'] || '-'}</td>
                                            <td>{row['Customer'] || '-'}</td>
                                            <td>{row['Product'] || '-'}</td>
                                            <td><span className={`rp-category-badge ${getCategoryBadgeClass(row['Category'])}`}>{row['Category'] || '-'}</span></td>
                                            <td className="rp-cell-number">{row['Quantity'] || '0'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </>
        );
    };

    // ============================================
    // RENDER — PURCHASE TABLE
    // ============================================
    const renderPurchaseTable = () => {
        const summary = reportData?.summary || {};
        const purchaseData = reportData?.purchase || [];
        const transactionDetails = reportData?.transactionDetails || [];
        const productWisePurchase = reportData?.productWisePurchase || [];

        return (
            <>
                <div className="rp-summary-grid rp-grid-4">
                    <SummaryCard label="Total Cost" value={fmt(summary.totalCost)} icon={<FaRupeeSign />} cardClass="rp-card-danger" iconClass="rp-icon-danger" />
                    <SummaryCard label="Total Products" value={fmtNum(summary.totalProducts)} icon={<FaBoxOpen />} cardClass="rp-card-primary" iconClass="rp-icon-primary" />
                    <SummaryCard label="Total Quantity" value={fmtNum(summary.totalQuantity)} icon={<FaArrowUp />} cardClass="rp-card-info" iconClass="rp-icon-info" />
                    <SummaryCard label="Avg Price" value={fmt(summary.avgPrice)} icon={<FaChartBar />} cardClass="rp-card-warning" iconClass="rp-icon-warning" />
                </div>

                {/* Tab 1: Product Summary */}
                <div className="rp-table-card">
                    <div className="rp-table-header">
                        <h3><FaShoppingCart /> Product Purchase Summary</h3>
                        <span className="rp-row-count">{purchaseData.length} products</span>
                    </div>
                    {purchaseData.length === 0 ? <EmptyState label="No purchase data for this period" /> : (
                        <div className="rp-table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Category</th>
                                        <th>Quantity</th>
                                        <th>Avg Price</th>
                                        <th>Total Cost</th>
                                        <th>Transactions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchaseData.map((row, i) => (
                                        <tr key={i}>
                                            <td className="rp-cell-name">{row.productName || row._id || '-'}</td>
                                            <td><span className={`rp-category-badge ${getCategoryBadgeClass(row.category)}`}>{row.category || '-'}</span></td>
                                            <td className="rp-cell-number">{row.totalQuantity !== undefined ? `${Number(row.totalQuantity).toFixed(2)} ${row.unit || ''}` : '-'}</td>
                                            <td className="rp-cell-number">{row.category === 'Bottles' ? 'N/A' : fmt(row.avgPurchasePrice)}</td>
                                            <td className="rp-cell-cost">{row.category === 'Bottles' ? 'N/A' : fmt(row.totalCost)}</td>
                                            <td className="rp-cell-number">{row.transactionCount || 0}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Tab 2: Transaction Details */}
                <div className="rp-table-card">
                    <div className="rp-table-header">
                        <h3><FaShoppingCart /> Transaction Details</h3>
                        <span className="rp-row-count">{transactionDetails.length} transactions</span>
                    </div>
                    {transactionDetails.length === 0 ? <EmptyState label="No transactions for this period" /> : (
                        <div className="rp-table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Category</th>
                                        <th>Date</th>
                                        <th>Quantity</th>
                                        <th>Price/Unit</th>
                                        <th>Total</th>
                                        <th>Reason</th>
                                        <th>By</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactionDetails.map((row, i) => (
                                        <tr key={i}>
                                            <td className="rp-cell-name">{row['Product'] || '-'}</td>
                                            <td><span className={`rp-category-badge ${getCategoryBadgeClass(row['Category'])}`}>{row['Category'] || '-'}</span></td>
                                            <td>{row['Date'] || '-'}</td>
                                            <td className="rp-cell-number">{row['Quantity'] || '0'}</td>
                                            <td>{row['Price/Unit'] || '-'}</td>
                                            <td className="rp-cell-cost">{row['Total'] || '-'}</td>
                                            <td>{row['Reason'] || '-'}</td>
                                            <td>{row['By'] || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Tab 3: Product Wise Purchase */}
                <div className="rp-table-card">
                    <div className="rp-table-header">
                        <h3><FaBoxOpen /> Product Wise Purchase</h3>
                        <span className="rp-row-count">{productWisePurchase.length} entries</span>
                    </div>
                    {productWisePurchase.length === 0 ? <EmptyState label="No purchase entries" /> : (
                        <div className="rp-table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Category</th>
                                        <th>Date</th>
                                        <th>Quantity</th>
                                        <th>Price/Unit</th>
                                        <th>Total</th>
                                        <th>Reason</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {productWisePurchase.map((row, i) => (
                                        <tr key={i}>
                                            <td className="rp-cell-name">{row['Product'] || '-'}</td>
                                            <td><span className={`rp-category-badge ${getCategoryBadgeClass(row['Category'])}`}>{row['Category'] || '-'}</span></td>
                                            <td>{row['Date'] || '-'}</td>
                                            <td className="rp-cell-number">{row['Quantity'] || '0'}</td>
                                            <td>{row['Price/Unit'] || '-'}</td>
                                            <td className="rp-cell-cost">{row['Total'] || '-'}</td>
                                            <td>{row['Reason'] || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </>
        );
    };

    // ============================================
    // RENDER — INVENTORY TABLE
    // ============================================
    const renderInventoryTable = () => {
        const rows = reportData?.inventory || [];
        const movementHistory = reportData?.movementHistory || [];

        return (
            <>
                <div className="rp-summary-grid rp-grid-4">
                    <SummaryCard label="Total Items" value={fmtNum(reportData?.summary?.totalItems)} icon={<FaBoxOpen />} cardClass="rp-card-primary" iconClass="rp-icon-primary" />
                    <SummaryCard label="Total Value" value={fmt(reportData?.summary?.totalValue)} icon={<FaRupeeSign />} cardClass="rp-card-success" iconClass="rp-icon-success" />
                    <SummaryCard label="Low Stock" value={fmtNum(reportData?.summary?.lowStock)} icon={<FaExclamationTriangle />} cardClass="rp-card-warning" iconClass="rp-icon-warning" />
                    <SummaryCard label="Out of Stock" value={fmtNum(reportData?.summary?.outOfStock)} icon={<FaExclamationTriangle />} cardClass="rp-card-danger" iconClass="rp-icon-danger" />
                </div>

                {/* Tab 1: Current Stock */}
                <div className="rp-table-card">
                    <div className="rp-table-header">
                        <h3><FaBoxOpen /> Current Stock</h3>
                        <span className="rp-row-count">{rows.length} items</span>
                    </div>
                    {rows.length === 0 ? <EmptyState label="No inventory data found" /> : (
                        <div className="rp-table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Category</th>
                                        <th>Quantity</th>
                                        <th>Min Stock</th>
                                        <th>Avg Price</th>
                                        <th>Total Value</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, i) => (
                                        <tr key={i}>
                                            <td className="rp-cell-name">{row.productName || '-'}</td>
                                            <td><span className={`rp-category-badge ${getCategoryBadgeClass(row.category)}`}>{row.category || '-'}</span></td>
                                            <td className="rp-cell-number">{row.quantity !== undefined ? `${Number(row.quantity).toFixed(2)} ${row.unit || ''}` : '-'}</td>
                                            <td className="rp-cell-number">{fmtNum(row.minStock)}</td>
                                            <td>{row.category === 'Bottles' ? 'N/A' : fmt(row.avgPurchasePrice)}</td>
                                            <td className="rp-cell-revenue">{row.category === 'Bottles' ? 'N/A' : fmt(row.totalValue)}</td>
                                            <td>
                                                <span className={`rp-status-badge ${row.status === 'Out of Stock' ? 'rp-status-out' :
                                                    row.status === 'Low Stock' ? 'rp-status-low' : 'rp-status-healthy'
                                                    }`}>{row.status || '-'}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Tab 2: Movement History (ONLY IN transactions) */}
                <div className="rp-table-card">
                    <div className="rp-table-header">
                        <h3><FaArrowUp /> Movement History (Stock Added)</h3>
                        <span className="rp-row-count">{movementHistory.length} entries</span>
                    </div>
                    {movementHistory.length === 0 ? <EmptyState label="No stock added transactions" /> : (
                        <div className="rp-table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Category</th>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Quantity</th>
                                        <th>Price</th>
                                        <th>Balance</th>
                                        <th>Reason</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {movementHistory.map((row, i) => (
                                        <tr key={i}>
                                            <td className="rp-cell-name">{row.productName || '-'}</td>
                                            <td><span className={`rp-category-badge ${getCategoryBadgeClass(row.category)}`}>{row.category || '-'}</span></td>
                                            <td>{row.date ? new Date(row.date).toLocaleDateString('en-IN') : '-'}</td>
                                            <td><span className="rp-status-badge rp-status-healthy">{row.type || 'Added'}</span></td>
                                            <td className="rp-cell-number">{row.quantity !== undefined ? `${Number(row.quantity).toFixed(2)} ${row.unit || ''}` : '-'}</td>
                                            <td>{row.category === 'Bottles' ? 'N/A' : fmt(row.price)}</td>
                                            <td className="rp-cell-number">{row.balance !== undefined ? `${Number(row.balance).toFixed(2)} ${row.unit || ''}` : '-'}</td>
                                            <td>{row.reason || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </>
        );
    };

    // ============================================
    // RENDER — WORKSHOP TABLE
    // ============================================
    const renderWorkshopTable = () => {
        const rows = reportData?.workshops || [];
        const s = reportData?.summary || {};
        return (
            <>
                <div className="rp-summary-grid rp-grid-4">
                    <SummaryCard label="Total Workshops" value={fmtNum(s.totalWorkshops)} icon={<FaCalendarCheck />} cardClass="rp-card-primary" iconClass="rp-icon-primary" />
                    <SummaryCard label="Total Customers" value={fmtNum(s.totalCustomers)} icon={<FaUsers />} cardClass="rp-card-info" iconClass="rp-icon-info" />
                    <SummaryCard label="Total Attended" value={fmtNum(s.totalAttended)} icon={<FaCheckCircle />} cardClass="rp-card-success" iconClass="rp-icon-success" />
                    <SummaryCard label="Pending Invoices" value={fmtNum(s.totalPendingInvoices)} icon={<FaFileInvoiceDollar />} cardClass="rp-card-warning" iconClass="rp-icon-warning" />
                </div>
                <div className="rp-table-card">
                    <div className="rp-table-header">
                        <h3><FaCalendarCheck /> Workshop Details</h3>
                        <span className="rp-row-count">{rows.length} workshops</span>
                    </div>
                    {rows.length === 0 ? <EmptyState label="No workshops found for this period" /> : (
                        <div className="rp-table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Time</th>
                                        <th>Status</th>
                                        <th>Customers</th>
                                        <th>Attended</th>
                                        <th>Attendance</th>
                                        <th>Pending Inv.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, i) => {
                                        const pct = row.totalCustomers > 0
                                            ? (row.attended / row.totalCustomers) * 100
                                            : 0;
                                        const wsStatus = (row.status || 'active').toLowerCase();
                                        return (
                                            <tr key={i}>
                                                <td className="rp-cell-name">
                                                    {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </td>
                                                <td>{row.startTime}{row.endTime ? ` - ${row.endTime}` : ''}</td>
                                                <td>
                                                    <span className={`rp-workshop-status rp-ws-${wsStatus}`}>
                                                        <span className="rp-ws-dot"></span>
                                                        {row.status || 'Active'}
                                                    </span>
                                                </td>
                                                <td className="rp-cell-number">{fmtNum(row.totalCustomers)}</td>
                                                <td className="rp-cell-number">{fmtNum(row.attended)}</td>
                                                <td>
                                                    <div className="rp-attendance-wrap">
                                                        <div className="rp-attendance-bar">
                                                            <div className="rp-attendance-fill" style={{ width: `${pct}%` }}></div>
                                                        </div>
                                                        <span className="rp-attendance-pct">{pct.toFixed(0)}%</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    {row.pendingInvoices > 0 ? (
                                                        <span className="rp-status-badge rp-status-low">{row.pendingInvoices} pending</span>
                                                    ) : (
                                                        <span className="rp-status-badge rp-status-healthy">Done</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </>
        );
    };

    // ============================================
    // RENDER — CUSTOMER TABLE
    // ============================================
    const renderCustomerTable = () => {
        const rows = reportData?.customers || [];
        const s = reportData?.summary || {};
        return (
            <>
                <div className="rp-summary-grid rp-grid-4">
                    <SummaryCard label="Active Customers" value={fmtNum(s.totalCustomers)} icon={<FaUsers />} cardClass="rp-card-primary" iconClass="rp-icon-primary" />
                    <SummaryCard label="Total Revenue" value={fmt(s.totalRevenue)} icon={<FaRupeeSign />} cardClass="rp-card-success" iconClass="rp-icon-success" />
                    <SummaryCard label="Total Invoices" value={fmtNum(s.totalInvoices)} icon={<FaFileInvoiceDollar />} cardClass="rp-card-info" iconClass="rp-icon-info" />
                    <SummaryCard label="Avg Spent / Cust." value={fmt(s.avgSpent)} icon={<FaChartBar />} cardClass="rp-card-warning" iconClass="rp-icon-warning" />
                </div>
                <div className="rp-table-card">
                    <div className="rp-table-header">
                        <h3><FaUsers /> Customer Report</h3>
                        <span className="rp-row-count">{rows.length} customers</span>
                    </div>
                    {rows.length === 0 ? <EmptyState label="No customer activity for this period" /> : (
                        <div className="rp-table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Customer</th>
                                        <th>Contact</th>
                                        <th>Invoices</th>
                                        <th>Loyalty Coins</th>
                                        <th>Avg Invoice</th>
                                        <th>Total Spent</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, i) => (
                                        <tr key={i}>
                                            <td>
                                                <div className="rp-customer-avatar">
                                                    <div className="rp-avatar-circle">{getInitials(row.customerName)}</div>
                                                    <div>
                                                        <div className="rp-avatar-name">{row.customerName}</div>
                                                        <div className="rp-avatar-contact">{row.email || '—'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>{row.contactNumber}</td>
                                            <td className="rp-cell-number">{fmtNum(row.totalInvoices)}</td>
                                            <td className="rp-cell-number">{fmtNum(row.loyaltyCoins)}</td>
                                            <td>{fmt(row.avgInvoiceValue)}</td>
                                            <td className="rp-cell-revenue">{fmt(row.totalSpent)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </>
        );
    };

    // ============================================
    // EMPTY STATE COMPONENT
    // ============================================
    const EmptyState = ({ label }) => (
        <div className="rp-empty-state">
            <FaChartBar />
            <h4>No Data Found</h4>
            <p>{label || 'Try adjusting your filters to see results.'}</p>
        </div>
    );

    // ============================================
    // RENDER ACTIVE REPORT
    // ============================================
    const renderReport = () => {
        if (isLoading) {
            return (
                <div className="rp-table-card">
                    <div className="rp-loading-row">
                        <div className="rp-spinner-sm"></div>
                        Loading report data...
                    </div>
                </div>
            );
        }

        if (!reportData) return null;

        switch (activeTab) {
            case 'sales': return renderSalesTable();
            case 'purchase': return renderPurchaseTable();
            case 'inventory': return renderInventoryTable();
            case 'workshop': return renderWorkshopTable();
            case 'customer': return renderCustomerTable();
            default: return null;
        }
    };

    // ============================================
    // MAIN RENDER
    // ============================================
    return (
        <Navbar>
            <div className="rp-main">

                {/* Page Header */}
                <div className="rp-page-header">
                    <h2><FaChartBar /> Reports &amp; Analytics</h2>
                    <div className="rp-header-actions">
                        <button
                            className="rp-export-btn"
                            onClick={handleExport}
                            disabled={isExporting || isLoading || !reportData}
                        >
                            <FaDownload />
                            {isExporting ? "Exporting..." : "Export Excel"}
                        </button>
                    </div>
                </div>

                {/* Report Type Tabs */}
                <div className="rp-tabs-wrap">
                    <div className="rp-tabs">
                        {REPORT_TABS.map(tab => (
                            <button
                                key={tab.id}
                                className={activeTab === tab.id ? 'rp-tab-active' : ''}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Filters */}
                <div className="rp-filters">
                    <div className="rp-filter-group">
                        <label>Date Range</label>
                        <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
                            {DATE_FILTERS.map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                        </select>
                    </div>

                    {dateFilter === 'custom' && (
                        <>
                            <div className="rp-filter-group">
                                <label>From Date</label>
                                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                            </div>
                            <div className="rp-filter-group">
                                <label>To Date</label>
                                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                            </div>
                        </>
                    )}

                    {showInventoryFilter && (
                        <div className="rp-filter-group">
                            <label>Inventory Type</label>
                            <select value={inventoryType} onChange={e => setInventoryType(e.target.value)}>
                                {INVENTORY_TYPES.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {showStatusFilter && (
                        <div className="rp-filter-group">
                            <label>Status</label>
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                <option value="all">All</option>
                                {activeTab === 'inventory' && (
                                    <>
                                        <option value="low">Low Stock</option>
                                        <option value="out-of-stock">Out of Stock</option>
                                    </>
                                )}
                                {activeTab === 'workshop' && (
                                    <>
                                        <option value="active">Active</option>
                                        <option value="completed">Completed</option>
                                        <option value="inactive">Inactive</option>
                                    </>
                                )}
                            </select>
                        </div>
                    )}

                    {showSearchFilter && (
                        <div className="rp-filter-group">
                            <label>Search Customer</label>
                            <input
                                type="text"
                                value={searchFilter}
                                onChange={e => setSearchFilter(e.target.value)}
                                placeholder="Name, phone or email..."
                                autoComplete="off"
                            />
                        </div>
                    )}

                    <div className="rp-filter-actions">
                        <button
                            className="rp-apply-btn"
                            onClick={() => fetchReport(activeTab)}
                            disabled={isLoading}
                        >
                            <FaFilter /> Apply
                        </button>
                        <button className="rp-reset-btn" onClick={handleReset}>
                            <FaRedo /> Reset
                        </button>
                    </div>
                </div>

                {/* Report Content */}
                {renderReport()}

            </div>
        </Navbar>
    );
};

export default Reports;