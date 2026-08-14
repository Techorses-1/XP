const express = require("express");
const router = express.Router();
const Customer = require("../models/customer");
const Invoice = require("../models/invoice");
const Workshop = require("../models/workshop");
const XPInventory = require("../models/inventory/xp/xpInventory");
const DispenserInventory = require("../models/inventory/dispenser/dispenserInventory");
const BottlesInventory = require("../models/inventory/bottles/bottlesInventory");
const XPTransactions = require("../models/inventory/xp/xpTransactions");
const DispenserTransactions = require("../models/inventory/dispenser/dispenserTransactions");
const BottlesTransactions = require("../models/inventory/bottles/bottlesTransactions");
const Package = require("../models/package");
const User = require("../models/user");
const jwt = require("jsonwebtoken");

// ============================================
// AUTH MIDDLEWARE
// ============================================
const auth = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findOne({ userId: decoded.userId });
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }
        req.user = user;
        next();
    } catch (error) {
        console.error("Auth middleware error:", error);
        res.status(401).json({ message: 'Invalid token' });
    }
};

// ============================================
// ✅ ADD THIS: CHECK DASHBOARD PERMISSION
// ============================================
const checkDashboardPermission = (req, res, next) => {
    const permissions = req.user.permissions || [];

    // Dashboard can be accessed by: admin, manager, or any role with 'dashboard' permission
    if (permissions.includes('admin') ||
        permissions.includes('manager') ||
        permissions.includes('dashboard')) {
        next();
    } else {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Dashboard permission required.'
        });
    }
};

// ============================================
// HELPER: Get Date Range
// ============================================
const getDateRange = (filter) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let startDate, endDate;

    switch (filter) {
        case 'today':
            startDate = today;
            endDate = new Date(today.getTime() + 86400000 - 1);
            break;

        case 'this-week': {
            const day = today.getDay();
            startDate = new Date(today);
            startDate.setDate(today.getDate() - day);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
            break;
        }

        case 'this-month': {
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        }

        case 'last-6-months': {
            startDate = new Date(today);
            startDate.setMonth(today.getMonth() - 6);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999);
            break;
        }

        case 'this-year': {
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = new Date(today.getFullYear(), 11, 31);
            endDate.setHours(23, 59, 59, 999);
            break;
        }

        case 'last-year': {
            const year = today.getFullYear() - 1;
            startDate = new Date(year, 0, 1);
            endDate = new Date(year, 11, 31);
            endDate.setHours(23, 59, 59, 999);
            break;
        }

        case 'last-financial-year': {
            const year = today.getFullYear();
            const month = today.getMonth() + 1;
            let financialYearStartYear, financialYearEndYear;

            if (month >= 4) {
                financialYearStartYear = year - 1;
                financialYearEndYear = year;
            } else {
                financialYearStartYear = year - 2;
                financialYearEndYear = year - 1;
            }

            startDate = new Date(financialYearStartYear, 3, 1);
            endDate = new Date(financialYearEndYear, 2, 31);
            endDate.setHours(23, 59, 59, 999);
            break;
        }

        case 'current-financial-year': {
            const year = today.getFullYear();
            const month = today.getMonth() + 1;
            let financialYearStartYear, financialYearEndYear;

            if (month >= 4) {
                financialYearStartYear = year;
                financialYearEndYear = year + 1;
            } else {
                financialYearStartYear = year - 1;
                financialYearEndYear = year;
            }

            startDate = new Date(financialYearStartYear, 3, 1);
            endDate = new Date(financialYearEndYear, 2, 31);
            endDate.setHours(23, 59, 59, 999);
            break;
        }

        default:
            startDate = today;
            endDate = new Date(today.getTime() + 86400000 - 1);
    }

    return { startDate, endDate };
};

// ============================================
// HELPER: Get Financial Year Label
// ============================================
const getFinancialYearLabel = (filter) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    let startYear, endYear;

    if (filter === 'last-financial-year') {
        if (month >= 4) {
            startYear = year - 1;
            endYear = year;
        } else {
            startYear = year - 2;
            endYear = year - 1;
        }
    } else {
        if (month >= 4) {
            startYear = year;
            endYear = year + 1;
        } else {
            startYear = year - 1;
            endYear = year;
        }
    }

    return `FY ${startYear}-${endYear.toString().slice(-2)}`;
};

// ============================================
// ✅ MAIN DASHBOARD API - WITH PERMISSION CHECK
// ============================================
router.get("/get-dashboard-data", auth, checkDashboardPermission, async (req, res) => {
    try {
        const {
            filter = 'today',
            startDate: customStartDate,
            endDate: customEndDate
        } = req.query;

        // Get date range based on filter
        let { startDate, endDate } = getDateRange(filter);

        // Override with custom dates if provided
        if (customStartDate && customEndDate) {
            startDate = new Date(customStartDate);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(customEndDate);
            endDate.setHours(23, 59, 59, 999);
        }

        console.log(`📊 Dashboard Data - Filter: ${filter}, From: ${startDate}, To: ${endDate}`);
        console.log(`👤 User: ${req.user.name} (${req.user.email})`);

        // ============================================
        // 1. CUSTOMER METRICS
        // ============================================
        const totalCustomers = await Customer.countDocuments();
        const newCustomers = await Customer.countDocuments({
            createdAt: { $gte: startDate, $lte: endDate }
        });

        const loyaltyCoinsTotal = await Customer.aggregate([
            { $group: { _id: null, total: { $sum: '$loyaltyCoins' } } }
        ]);
        const totalLoyaltyCoins = loyaltyCoinsTotal[0]?.total || 0;
        const avgLoyaltyCoins = totalCustomers > 0 ? Math.round(totalLoyaltyCoins / totalCustomers) : 0;

        // ============================================
        // 2. SALES & REVENUE METRICS
        // ============================================
        const salesAggregation = await Invoice.aggregate([
            {
                $match: {
                    status: 'Active',
                    invoiceDate: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$grandTotal' },
                    totalGST: { $sum: '$gstAmount' },
                    totalDiscount: { $sum: '$totalDiscountAmount' },
                    totalLoyaltyEarned: { $sum: '$loyaltyCoinsEarned' },
                    totalLoyaltyUsed: { $sum: '$loyaltyCoinsUsed' },
                    invoiceCount: { $sum: 1 },
                    avgInvoiceValue: { $avg: '$grandTotal' }
                }
            }
        ]);

        const salesData = salesAggregation[0] || {
            totalRevenue: 0,
            totalGST: 0,
            totalDiscount: 0,
            totalLoyaltyEarned: 0,
            totalLoyaltyUsed: 0,
            invoiceCount: 0,
            avgInvoiceValue: 0
        };

        // ============================================
        // 3. PAYMENT BREAKDOWN
        // ============================================
        const paymentBreakdown = await Invoice.aggregate([
            {
                $match: {
                    status: 'Active',
                    invoiceDate: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: '$paymentStatus',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$grandTotal' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // ============================================
        // 4. INVENTORY METRICS
        // ============================================
        const xpTotal = await XPInventory.countDocuments();
        const dispenserTotal = await DispenserInventory.countDocuments();
        const bottlesTotal = await BottlesInventory.countDocuments();
        const totalInventoryItems = xpTotal + dispenserTotal + bottlesTotal;

        const getLowStockItems = async (model) => {
            return await model.find({
                $expr: { $lt: ["$quantity", "$minStock"] }
            }).lean();
        };

        const getOutOfStockItems = async (model) => {
            return await model.find({ quantity: 0 }).lean();
        };

        const [xpLowStock, dispenserLowStock, bottlesLowStock] = await Promise.all([
            getLowStockItems(XPInventory),
            getLowStockItems(DispenserInventory),
            getLowStockItems(BottlesInventory)
        ]);

        const lowStockItems = [...xpLowStock, ...dispenserLowStock, ...bottlesLowStock];
        const lowStockCount = lowStockItems.length;

        const [xpOutOfStock, dispenserOutOfStock, bottlesOutOfStock] = await Promise.all([
            getOutOfStockItems(XPInventory),
            getOutOfStockItems(DispenserInventory),
            getOutOfStockItems(BottlesInventory)
        ]);

        const outOfStockItems = [...xpOutOfStock, ...dispenserOutOfStock, ...bottlesOutOfStock];
        const outOfStockCount = outOfStockItems.length;

        // ============================================
        // 5. WORKSHOP METRICS
        // ============================================
        const workshopsByFilter = await Workshop.find({
            date: { $gte: startDate, $lte: endDate },
            isDeleted: false,
            status: 'active'
        }).sort({ date: 1, startTime: 1 }).lean();

        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);

        const tomorrowDate = new Date(todayDate);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);

        const nextWeekDate = new Date(todayDate);
        nextWeekDate.setDate(nextWeekDate.getDate() + 7);

        const upcomingWorkshops = await Workshop.find({
            date: { $gte: tomorrowDate, $lte: nextWeekDate },
            isDeleted: false,
            status: 'active'
        }).sort({ date: 1, startTime: 1 }).limit(10).lean();

        const pendingWorkshopInvoices = await Workshop.find({
            date: { $lte: todayDate },
            isDeleted: false,
            status: 'active'
        }).lean();

        const pendingInvoices = [];
        for (const workshop of pendingWorkshopInvoices) {
            const pendingCustomers = workshop.customers.filter(c =>
                c.attended === true && c.invoiceCreated !== true
            );
            if (pendingCustomers.length > 0) {
                pendingInvoices.push({
                    workshopId: workshop.workshopId,
                    workshopDate: workshop.date,
                    workshopTime: workshop.startTime,
                    customers: pendingCustomers.map(c => ({
                        customerId: c.customerId,
                        customerName: c.customerName,
                        contactNumber: c.contactNumber,
                        packageName: c.packageName
                    }))
                });
            }
        }

        // ============================================
        // 6. TOP SELLING ITEMS
        // ============================================
        const topXPOils = await Invoice.aggregate([
            { $match: { status: 'Active', hasPackage: true } },
            { $unwind: '$packageItem' },
            {
                $match: {
                    'packageItem.xpOil.productName': { $ne: 'FRAGRANCE BASE' },
                    'packageItem.xpOil.productName': { $exists: true }
                }
            },
            {
                $group: {
                    _id: '$packageItem.xpOil.productName',
                    totalSold: { $sum: '$packageItem.xpOil.quantity' },
                    totalRevenue: { $sum: '$packageItem.finalPrice' }
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: 5 }
        ]);

        const topDispenserOils = await Invoice.aggregate([
            { $match: { status: 'Active', hasDispenser: true } },
            { $unwind: '$dispenserItems' },
            {
                $group: {
                    _id: '$dispenserItems.productName',
                    totalML: { $sum: '$dispenserItems.totalML' },
                    totalQuantity: { $sum: '$dispenserItems.quantity' },
                    totalRevenue: { $sum: '$dispenserItems.finalPrice' }
                }
            },
            { $sort: { totalML: -1 } },
            { $limit: 5 }
        ]);

        const topPackages = await Invoice.aggregate([
            { $match: { status: 'Active', hasPackage: true } },
            {
                $group: {
                    _id: '$packageItem.packageName',
                    totalSold: { $sum: 1 },
                    totalRevenue: { $sum: '$packageItem.finalPrice' }
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: 5 }
        ]);

        // ============================================
        // 7. REVENUE + PURCHASE TREND
        // ============================================
        const revenueTrend = [];
        for (let i = 6; i >= 0; i--) {
            const day = new Date(todayDate);
            day.setDate(day.getDate() - i);
            const dayStart = new Date(day);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(day);
            dayEnd.setHours(23, 59, 59, 999);

            const dayRevenue = await Invoice.aggregate([
                {
                    $match: {
                        status: 'Active',
                        invoiceDate: { $gte: dayStart, $lte: dayEnd }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$grandTotal' },
                        count: { $sum: 1 }
                    }
                }
            ]);

            const dayPurchase = await XPTransactions.aggregate([
                {
                    $match: {
                        'transactions.transactionType': 'IN',
                        'transactions.createdAt': { $gte: dayStart, $lte: dayEnd }
                    }
                },
                { $unwind: '$transactions' },
                {
                    $group: {
                        _id: null,
                        total: { $sum: { $multiply: ['$transactions.quantity', '$transactions.purchasePrice'] } }
                    }
                }
            ]);

            const dayPurchaseDispenser = await DispenserTransactions.aggregate([
                {
                    $match: {
                        'transactions.transactionType': 'IN',
                        'transactions.createdAt': { $gte: dayStart, $lte: dayEnd }
                    }
                },
                { $unwind: '$transactions' },
                {
                    $group: {
                        _id: null,
                        total: { $sum: { $multiply: ['$transactions.quantity', '$transactions.purchasePrice'] } }
                    }
                }
            ]);

            const totalPurchase = (dayPurchase[0]?.total || 0) + (dayPurchaseDispenser[0]?.total || 0);

            revenueTrend.push({
                date: day.toISOString().split('T')[0],
                label: day.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }),
                revenue: dayRevenue[0]?.total || 0,
                purchase: totalPurchase,
                invoiceCount: dayRevenue[0]?.count || 0
            });
        }

        // ============================================
        // 8. SALES BY INVENTORY TYPE
        // ============================================
        const xpSalesSummary = await Invoice.aggregate([
            { $match: { status: 'Active', hasPackage: true } },
            { $unwind: '$packageItem' },
            {
                $match: {
                    'packageItem.xpOil.productName': { $ne: 'FRAGRANCE BASE' }
                }
            },
            {
                $group: {
                    _id: '$packageItem.xpOil.productName',
                    totalSold: { $sum: '$packageItem.xpOil.quantity' },
                    totalRevenue: { $sum: '$packageItem.finalPrice' }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        const dispenserSalesSummary = await Invoice.aggregate([
            { $match: { status: 'Active', hasDispenser: true } },
            { $unwind: '$dispenserItems' },
            {
                $group: {
                    _id: '$dispenserItems.productName',
                    totalML: { $sum: '$dispenserItems.totalML' },
                    totalRevenue: { $sum: '$dispenserItems.finalPrice' }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        const packageSalesSummary = await Invoice.aggregate([
            { $match: { status: 'Active', hasPackage: true } },
            {
                $group: {
                    _id: '$packageItem.packageName',
                    totalSold: { $sum: 1 },
                    totalRevenue: { $sum: '$packageItem.finalPrice' }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);

        // ============================================
        // 9. PURCHASE BY INVENTORY TYPE
        // ============================================
        const xpPurchaseSummary = await XPTransactions.aggregate([
            { $match: { 'transactions.transactionType': 'IN' } },
            { $unwind: '$transactions' },
            {
                $group: {
                    _id: '$productName',
                    totalQuantity: { $sum: '$transactions.quantity' },
                    totalCost: { $sum: { $multiply: ['$transactions.quantity', '$transactions.purchasePrice'] } }
                }
            },
            { $sort: { totalCost: -1 } }
        ]);

        const dispenserPurchaseSummary = await DispenserTransactions.aggregate([
            { $match: { 'transactions.transactionType': 'IN' } },
            { $unwind: '$transactions' },
            {
                $group: {
                    _id: '$productName',
                    totalQuantity: { $sum: '$transactions.quantity' },
                    totalCost: { $sum: { $multiply: ['$transactions.quantity', '$transactions.purchasePrice'] } }
                }
            },
            { $sort: { totalCost: -1 } }
        ]);

        // ============================================
        // 10. TOTAL PURCHASE COST
        // ============================================
        const xpValue = await XPInventory.aggregate([
            { $group: { _id: null, total: { $sum: { $multiply: ['$quantity', '$avgPurchasePrice'] } } } }
        ]);
        const dispenserValue = await DispenserInventory.aggregate([
            { $group: { _id: null, total: { $sum: { $multiply: ['$quantity', '$avgPurchasePrice'] } } } }
        ]);

        const totalPurchaseCost = (xpValue[0]?.total || 0) + (dispenserValue[0]?.total || 0);

        // ============================================
        // 11. RECENT ACTIVITY
        // ============================================
        const recentInvoices = await Invoice.find({
            status: 'Active'
        })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('invoiceNumber customer grandTotal paymentStatus createdAt')
            .lean();

        // ============================================
        // 12. PROMO CODE STATS
        // ============================================
        const promoUsage = await Invoice.aggregate([
            {
                $match: {
                    status: 'Active',
                    hasPromo: true,
                    invoiceDate: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: '$promoApplied.code',
                    totalUsed: { $sum: 1 },
                    totalDiscount: { $sum: '$promoDiscount' }
                }
            },
            { $sort: { totalUsed: -1 } },
            { $limit: 5 }
        ]);

        // ============================================
        // 13. LOYALTY COINS SUMMARY
        // ============================================
        const loyaltySummary = await Invoice.aggregate([
            {
                $match: {
                    status: 'Active',
                    invoiceDate: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalEarned: { $sum: '$loyaltyCoinsEarned' },
                    totalUsed: { $sum: '$loyaltyCoinsUsed' },
                    totalLoyaltyDiscount: { $sum: '$loyaltyDiscountAmount' }
                }
            }
        ]);

        // ============================================
        // RESPONSE
        // ============================================
        res.status(200).json({
            success: true,
            data: {
                filter: {
                    type: filter,
                    label: filter === 'last-financial-year' || filter === 'current-financial-year'
                        ? getFinancialYearLabel(filter)
                        : filter.replace('-', ' ').toUpperCase(),
                    startDate: startDate,
                    endDate: endDate
                },
                customers: {
                    total: totalCustomers,
                    new: newCustomers,
                    loyaltyCoins: {
                        total: totalLoyaltyCoins,
                        average: avgLoyaltyCoins
                    }
                },
                sales: {
                    totalRevenue: salesData.totalRevenue,
                    totalGST: salesData.totalGST,
                    totalDiscount: salesData.totalDiscount,
                    invoiceCount: salesData.invoiceCount,
                    avgInvoiceValue: salesData.avgInvoiceValue,
                    totalLoyaltyEarned: salesData.totalLoyaltyEarned,
                    totalLoyaltyUsed: salesData.totalLoyaltyUsed
                },
                paymentBreakdown: paymentBreakdown,
                inventory: {
                    totalItems: totalInventoryItems,
                    lowStock: {
                        count: lowStockCount,
                        items: lowStockItems.slice(0, 10).map(item => ({
                            productName: item.productName || `${item.mlSize}ml ${item.itemType}`,
                            quantity: item.quantity,
                            minStock: item.minStock,
                            category: item.productName ? 'XP' : 'Dispenser'
                        }))
                    },
                    outOfStock: {
                        count: outOfStockCount,
                        items: outOfStockItems.slice(0, 10).map(item => ({
                            productName: item.productName || `${item.mlSize}ml ${item.itemType}`,
                            quantity: item.quantity,
                            category: item.productName ? 'XP' : 'Dispenser'
                        }))
                    },
                    totalPurchaseCost: totalPurchaseCost
                },
                workshops: {
                    byFilter: workshopsByFilter.map(w => ({
                        workshopId: w.workshopId,
                        date: w.date,
                        startTime: w.startTime,
                        endTime: w.endTime,
                        customerCount: w.customers?.length || 0,
                        customers: w.customers?.map(c => ({
                            customerId: c.customerId,
                            customerName: c.customerName,
                            contactNumber: c.contactNumber,
                            attended: c.attended,
                            invoiceCreated: c.invoiceCreated
                        })) || []
                    })),
                    today: workshopsByFilter.filter(w => {
                        const wDate = new Date(w.date);
                        wDate.setHours(0, 0, 0, 0);
                        return wDate.getTime() === todayDate.getTime();
                    }).map(w => ({
                        workshopId: w.workshopId,
                        date: w.date,
                        startTime: w.startTime,
                        endTime: w.endTime,
                        customerCount: w.customers?.length || 0
                    })),
                    upcoming: upcomingWorkshops.map(w => ({
                        workshopId: w.workshopId,
                        date: w.date,
                        startTime: w.startTime,
                        endTime: w.endTime,
                        customerCount: w.customers?.length || 0
                    })),
                    pendingInvoices: pendingInvoices
                },
                salesByInventory: {
                    xp: xpSalesSummary,
                    dispenser: dispenserSalesSummary,
                    packages: packageSalesSummary
                },
                purchaseByInventory: {
                    xp: xpPurchaseSummary,
                    dispenser: dispenserPurchaseSummary
                },
                revenueTrend: revenueTrend,
                recentActivity: {
                    invoices: recentInvoices
                },
                promoUsage: promoUsage,
                loyaltySummary: {
                    totalEarned: loyaltySummary[0]?.totalEarned || 0,
                    totalUsed: loyaltySummary[0]?.totalUsed || 0,
                    totalLoyaltyDiscount: loyaltySummary[0]?.totalLoyaltyDiscount || 0
                },
                topSelling: {
                    xpOils: topXPOils,
                    dispenserOils: topDispenserOils,
                    packages: topPackages
                }
            }
        });

    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard data",
            error: error.message
        });
    }
});

module.exports = router;