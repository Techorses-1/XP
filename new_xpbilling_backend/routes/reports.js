const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const XLSX = require("xlsx");
const Customer = require("../models/customer");
const Invoice = require("../models/invoice");
const Workshop = require("../models/workshop");
const Package = require("../models/package");
const XPInventory = require("../models/inventory/xp/xpInventory");
const DispenserInventory = require("../models/inventory/dispenser/dispenserInventory");
const BottlesInventory = require("../models/inventory/bottles/bottlesInventory");
const XPTransactions = require("../models/inventory/xp/xpTransactions");
const DispenserTransactions = require("../models/inventory/dispenser/dispenserTransactions");
const BottlesTransactions = require("../models/inventory/bottles/bottlesTransactions");
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
// ✅ ADD THIS: CHECK REPORT PERMISSION
// ============================================
const checkReportPermission = (req, res, next) => {
    const permissions = req.user.permissions || [];

    // Reports can be accessed by: admin, manager, or any role with 'report' permission
    if (permissions.includes('admin') ||
        permissions.includes('manager') ||
        permissions.includes('report')) {
        next();
    } else {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Report permission required.'
        });
    }
};

// ============================================
// HELPER: Get Date Range
// ============================================
const getDateRange = (filter, customStartDate, customEndDate) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let startDate, endDate;

    if (filter === 'custom' && customStartDate && customEndDate) {
        startDate = new Date(customStartDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(customEndDate);
        endDate.setHours(23, 59, 59, 999);
        return { startDate, endDate };
    }

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
        case 'this-year': {
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = new Date(today.getFullYear(), 11, 31);
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
// HELPER: Format Currency
// ============================================
const formatCurrency = (value) => {
    return `₹${Number(value || 0).toFixed(2)}`;
};

// ============================================
// HELPER: Get Complete Product List from Invoice
// ============================================
const getCompleteProductList = (invoice) => {
    const products = [];

    if (invoice.hasPackage && invoice.packageItem) {
        const pkg = invoice.packageItem;
        const xpName = pkg.xpOil?.productName || '';
        const pkgName = pkg.packageName || 'Package';

        if (xpName && xpName !== 'FRAGRANCE BASE') {
            products.push(`${xpName} (Package: ${pkgName})`);
        } else {
            products.push(`Package: ${pkgName}`);
        }
    }

    if (invoice.hasDispenser && invoice.dispenserItems) {
        for (const item of invoice.dispenserItems) {
            products.push(`${item.productName} (${item.ml}ml × ${item.quantity})`);
        }
    }

    return products.length > 0 ? products.join(', ') : 'No Products';
};

// ============================================
// HELPER: Group data by Product for Excel
// ============================================
const groupByProductForExcel = (data, productKey, categoryKey) => {
    if (!data || data.length === 0) return [];

    const productMap = new Map();

    for (const row of data) {
        const productName = (row[productKey] || 'Unknown').trim();
        if (!productMap.has(productName)) {
            productMap.set(productName, []);
        }
        productMap.get(productName).push(row);
    }

    const groupedData = [];
    for (const [productName, rows] of productMap) {
        const firstRow = { ...rows[0] };
        groupedData.push(firstRow);

        for (let i = 1; i < rows.length; i++) {
            const newRow = { ...rows[i] };
            newRow[productKey] = '';
            if (categoryKey) {
                newRow[categoryKey] = '';
            }
            groupedData.push(newRow);
        }
    }

    return groupedData;
};

// ============================================
// HELPER: Multi-Sheet Excel Export
// ============================================
const exportToMultiSheetExcel = (sheets, fileName) => {
    const wb = XLSX.utils.book_new();

    for (const [sheetName, data] of Object.entries(sheets)) {
        if (!data || data.length === 0) {
            const emptyData = [['No data available']];
            const ws = XLSX.utils.aoa_to_sheet(emptyData);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            continue;
        }

        const headers = Object.keys(data[0]);
        const worksheetData = [
            headers,
            ...data.map(row => headers.map(h => {
                const val = row[h];
                if (typeof val === 'number') {
                    return val;
                }
                return val || '-';
            }))
        ];

        const ws = XLSX.utils.aoa_to_sheet(worksheetData);

        const colWidths = headers.map((h, i) => {
            let maxLen = h.length;
            data.forEach(row => {
                const val = String(row[h] || '-');
                if (val.length > maxLen) maxLen = val.length;
            });
            return { wch: Math.min(Math.max(maxLen + 2, 12), 50) };
        });
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    return wbout;
};

// ============================================
// ✅ 1. SALES REPORT - WITH PERMISSION CHECK
// ============================================
router.get("/sales", auth, checkReportPermission, async (req, res) => {
    try {
        const {
            filter = 'today',
            fromDate,
            toDate,
            productId,
            inventoryType = 'all',
            export: isExport = 'false'
        } = req.query;

        console.log(`👤 User: ${req.user.name} (${req.user.email}) accessing Sales Report`);

        const { startDate, endDate } = getDateRange(filter, fromDate, toDate);

        console.log(`📊 Sales Report - Filter: ${filter}, From: ${startDate}, To: ${endDate}`);

        const matchConditions = {
            status: 'Active',
            invoiceDate: { $gte: startDate, $lte: endDate }
        };

        const invoices = await Invoice.find(matchConditions).lean();
        console.log(`📄 Found ${invoices.length} invoices in date range`);

        if (invoices.length === 0) {
            const emptyResult = {
                summary: { totalRevenue: 0, totalQuantity: 0, totalInvoices: 0, totalProducts: 0 },
                sales: [],
                exportData: {
                    'Summary': [],
                    'Invoice Details': [],
                    'Product Wise Sales': []
                }
            };

            if (isExport === 'true') {
                const sheets = {
                    'Summary': [],
                    'Invoice Details': [],
                    'Product Wise Sales': []
                };
                const excelBuffer = exportToMultiSheetExcel(sheets, 'sales_report.xlsx');
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=sales_report_${new Date().toISOString().split('T')[0]}.xlsx`);
                return res.send(excelBuffer);
            }

            return res.status(200).json({ success: true, data: emptyResult, filters: { filter, startDate, endDate, totalInvoices: 0 } });
        }

        // TOTAL REVENUE = SUM OF grandTotal
        const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
        console.log(`💰 Total Revenue: ₹${totalRevenue}`);

        // PRODUCT BREAKDOWN
        const productMap = new Map();
        let totalQuantitySold = 0;

        for (const invoice of invoices) {
            if (invoice.hasPackage && invoice.packageItem && (inventoryType === 'all' || inventoryType === 'xp' || inventoryType === 'packages')) {
                const pkg = invoice.packageItem;
                const productName = pkg.xpOil?.productName || pkg.packageName;

                if (productName && productName !== 'FRAGRANCE BASE') {
                    const key = `xp|${productName}`;
                    if (!productMap.has(key)) {
                        productMap.set(key, {
                            productName: productName,
                            category: 'XP Oil',
                            totalQuantity: 0,
                            invoiceCount: 0,
                            unit: 'g',
                            invoiceNumbers: new Set()
                        });
                    }
                    const entry = productMap.get(key);
                    const qty = pkg.xpOil?.quantity || 1;
                    const qtyInGrams = qty * 1000;
                    entry.totalQuantity += qtyInGrams;
                    totalQuantitySold += qtyInGrams;
                    entry.invoiceCount += 1;
                    entry.invoiceNumbers.add(invoice.invoiceNumber || invoice.invoiceId);
                }
            }

            if (invoice.hasDispenser && invoice.dispenserItems && (inventoryType === 'all' || inventoryType === 'dispenser')) {
                for (const item of invoice.dispenserItems) {
                    const key = `disp|${item.productName}`;
                    if (!productMap.has(key)) {
                        productMap.set(key, {
                            productName: item.productName,
                            category: 'Dispenser',
                            totalQuantity: 0,
                            invoiceCount: 0,
                            unit: 'ml',
                            invoiceNumbers: new Set()
                        });
                    }
                    const entry = productMap.get(key);
                    const qty = item.totalML || 0;
                    entry.totalQuantity += qty;
                    totalQuantitySold += qty;
                    entry.invoiceCount += 1;
                    entry.invoiceNumbers.add(invoice.invoiceNumber || invoice.invoiceId);
                }
            }
        }

        let salesData = Array.from(productMap.values()).map(entry => ({
            _id: entry.productName,
            productName: entry.productName,
            category: entry.category,
            totalQuantity: entry.totalQuantity,
            unit: entry.unit,
            invoiceCount: entry.invoiceNumbers.size,
            invoiceNumbers: Array.from(entry.invoiceNumbers)
        }));

        if (productId) {
            salesData = salesData.filter(item => item._id === productId || item.productName === productId);
        }

        salesData.sort((a, b) => b.totalQuantity - a.totalQuantity);

        const summary = {
            totalRevenue: totalRevenue,
            totalQuantity: totalQuantitySold,
            totalInvoices: invoices.length,
            totalProducts: salesData.length
        };

        // EXPORT DATA - 3 TABS
        const summaryData = [{
            'Total Revenue': formatCurrency(totalRevenue),
            'Total Invoices': invoices.length,
            'Total Products Sold': salesData.length,
            'Total Quantity Sold': Number(totalQuantitySold || 0).toFixed(2)
        }];

        const invoiceDetailsData = invoices.map(inv => ({
            'Invoice Number': inv.invoiceNumber || inv.invoiceId,
            'Customer': inv.customer?.customerName || 'Unknown',
            'Date': new Date(inv.invoiceDate).toLocaleDateString('en-IN'),
            'Payment': inv.paymentStatus || 'Cash',
            'Products': getCompleteProductList(inv),
            'Grand Total': formatCurrency(inv.grandTotal || 0)
        }));

        // Product Wise Sales - Flat data first
        const productWiseFlatData = [];
        for (const item of salesData) {
            for (const inv of invoices) {
                let found = false;
                let quantity = 0;
                let unit = item.unit || '';

                if (inv.hasPackage && inv.packageItem) {
                    const pkg = inv.packageItem;
                    const pkgName = pkg.xpOil?.productName || pkg.packageName;
                    if (pkgName === item.productName) {
                        found = true;
                        const qtyInKG = pkg.xpOil?.quantity || 1;
                        const density = pkg.xpOil?.density || 1000;
                        quantity = qtyInKG * density;
                        unit = 'ml';
                    }
                }
                if (!found && inv.hasDispenser && inv.dispenserItems) {
                    for (const disp of inv.dispenserItems) {
                        if (disp.productName === item.productName) {
                            found = true;
                            quantity = disp.totalML || 0;
                            unit = 'ml';
                            break;
                        }
                    }
                }
                if (found) {
                    productWiseFlatData.push({
                        'Product': item.productName,
                        'Category': item.category,
                        'Invoice': inv.invoiceNumber || inv.invoiceId,
                        'Date': new Date(inv.invoiceDate).toLocaleDateString('en-IN'),
                        'Customer': inv.customer?.customerName || 'Unknown',
                        'Quantity': `${Number(quantity || 0).toFixed(2)} ${unit}`
                    });
                }
            }
        }

        const productWiseData = groupByProductForExcel(productWiseFlatData, 'Product', 'Category');

        const sheets = {
            'Summary': summaryData,
            'Invoice Details': invoiceDetailsData,
            'Product Wise Sales': productWiseData
        };

        if (isExport === 'true') {
            const excelBuffer = exportToMultiSheetExcel(sheets, 'sales_report.xlsx');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=sales_report_${new Date().toISOString().split('T')[0]}.xlsx`);
            return res.send(excelBuffer);
        }

        res.status(200).json({
            success: true,
            data: {
                summary,
                sales: salesData,
                exportData: sheets,
                invoiceDetails: invoiceDetailsData,
                productWiseSales: productWiseFlatData
            },
            filters: {
                filter,
                startDate,
                endDate,
                productId,
                inventoryType,
                totalInvoices: invoices.length
            }
        });

    } catch (error) {
        console.error("Error generating sales report:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate sales report",
            error: error.message
        });
    }
});

// ============================================
// ✅ 2. PURCHASE REPORT - WITH PERMISSION CHECK
// ============================================
router.get("/purchase", auth, checkReportPermission, async (req, res) => {
    try {
        const {
            filter = 'today',
            fromDate,
            toDate,
            productId,
            inventoryType = 'all',
            export: isExport = 'false'
        } = req.query;

        console.log(`👤 User: ${req.user.name} (${req.user.email}) accessing Purchase Report`);

        const { startDate, endDate } = getDateRange(filter, fromDate, toDate);

        console.log(`📊 Purchase Report - Filter: ${filter}, From: ${startDate}, To: ${endDate}`);

        const EXCLUDED_REASONS = [
            'Invoice',
            'Invoice Return',
            'Invoice Deletion - Return',
            'Invoice Edit - Return',
            'Invoice Edit - New Reduction'
        ];

        const purchaseData = [];
        const transactionDetailsFlat = [];

        const allXPProducts = await XPInventory.find({}).lean();
        const allDispenserProducts = await DispenserInventory.find({}).lean();
        const allBottlesProducts = await BottlesInventory.find({}).lean();

        const allProductsMap = new Map();

        for (const prod of allXPProducts) {
            const key = `xp|${prod.productName}`;
            allProductsMap.set(key, {
                productName: prod.productName,
                category: 'XP Oil',
                totalQuantity: 0,
                totalCost: 0,
                avgPurchasePrice: 0,
                transactionCount: 0,
                unit: 'KG',
                purchasePrices: []
            });
        }

        for (const prod of allDispenserProducts) {
            const key = `disp|${prod.productName}`;
            allProductsMap.set(key, {
                productName: prod.productName,
                category: 'Dispenser',
                totalQuantity: 0,
                totalCost: 0,
                avgPurchasePrice: 0,
                transactionCount: 0,
                unit: 'KG',
                purchasePrices: []
            });
        }

        for (const prod of allBottlesProducts) {
            const productName = `${prod.mlSize}ml ${prod.itemType}`;
            const key = `btl|${productName}`;
            allProductsMap.set(key, {
                productName: productName,
                category: 'Bottles',
                totalQuantity: 0,
                totalCost: 0,
                avgPurchasePrice: 0,
                transactionCount: 0,
                unit: 'Count',
                purchasePrices: []
            });
        }

        // XP Purchase Transactions
        if (inventoryType === 'all' || inventoryType === 'xp') {
            const xpDocs = await XPTransactions.aggregate([
                { $unwind: '$transactions' },
                {
                    $match: {
                        'transactions.transactionType': 'IN',
                        'transactions.createdAt': { $gte: startDate, $lte: endDate },
                        'transactions.reason': { $nin: EXCLUDED_REASONS }
                    }
                },
                {
                    $project: {
                        productName: 1,
                        quantity: '$transactions.quantity',
                        purchasePrice: '$transactions.purchasePrice',
                        reason: '$transactions.reason',
                        notes: '$transactions.notes',
                        createdAt: '$transactions.createdAt',
                        performedBy: '$transactions.performedBy'
                    }
                }
            ]);

            for (const txn of xpDocs) {
                if (!txn.productName || txn.productName === '') continue;

                const totalCost = (txn.quantity || 0) * (txn.purchasePrice || 0);

                const key = `xp|${txn.productName}`;
                if (allProductsMap.has(key)) {
                    const entry = allProductsMap.get(key);
                    entry.totalQuantity += txn.quantity || 0;
                    entry.totalCost += totalCost;
                    if (txn.purchasePrice) entry.purchasePrices.push(txn.purchasePrice);
                    entry.transactionCount += 1;
                }

                purchaseData.push({
                    productName: txn.productName,
                    category: 'XP Oil',
                    quantity: txn.quantity || 0,
                    purchasePrice: txn.purchasePrice || 0,
                    totalCost: totalCost,
                    reason: txn.reason || 'Purchase',
                    createdAt: txn.createdAt,
                    performedBy: txn.performedBy?.userName || 'System',
                    unit: 'KG'
                });

                transactionDetailsFlat.push({
                    'Product': txn.productName,
                    'Category': 'XP Oil',
                    'Date': new Date(txn.createdAt).toLocaleDateString('en-IN'),
                    'Quantity': `${Number(txn.quantity || 0).toFixed(4)} KG`,
                    'Price/Unit': formatCurrency(txn.purchasePrice || 0),
                    'Total': formatCurrency(totalCost),
                    'Reason': txn.reason || 'Purchase',
                    'By': txn.performedBy?.userName || 'System'
                });
            }
        }

        // Dispenser Purchase Transactions
        if (inventoryType === 'all' || inventoryType === 'dispenser') {
            const dispenserDocs = await DispenserTransactions.aggregate([
                { $unwind: '$transactions' },
                {
                    $match: {
                        'transactions.transactionType': 'IN',
                        'transactions.createdAt': { $gte: startDate, $lte: endDate },
                        'transactions.reason': { $nin: EXCLUDED_REASONS }
                    }
                },
                {
                    $project: {
                        productName: 1,
                        quantity: '$transactions.quantity',
                        purchasePrice: '$transactions.purchasePrice',
                        reason: '$transactions.reason',
                        notes: '$transactions.notes',
                        createdAt: '$transactions.createdAt',
                        performedBy: '$transactions.performedBy'
                    }
                }
            ]);

            for (const txn of dispenserDocs) {
                if (!txn.productName || txn.productName === '') continue;

                const totalCost = (txn.quantity || 0) * (txn.purchasePrice || 0);

                const key = `disp|${txn.productName}`;
                if (allProductsMap.has(key)) {
                    const entry = allProductsMap.get(key);
                    entry.totalQuantity += txn.quantity || 0;
                    entry.totalCost += totalCost;
                    if (txn.purchasePrice) entry.purchasePrices.push(txn.purchasePrice);
                    entry.transactionCount += 1;
                }

                purchaseData.push({
                    productName: txn.productName,
                    category: 'Dispenser',
                    quantity: txn.quantity || 0,
                    purchasePrice: txn.purchasePrice || 0,
                    totalCost: totalCost,
                    reason: txn.reason || 'Purchase',
                    createdAt: txn.createdAt,
                    performedBy: txn.performedBy?.userName || 'System',
                    unit: 'KG'
                });

                transactionDetailsFlat.push({
                    'Product': txn.productName,
                    'Category': 'Dispenser',
                    'Date': new Date(txn.createdAt).toLocaleDateString('en-IN'),
                    'Quantity': `${Number(txn.quantity || 0).toFixed(4)} KG`,
                    'Price/Unit': formatCurrency(txn.purchasePrice || 0),
                    'Total': formatCurrency(totalCost),
                    'Reason': txn.reason || 'Purchase',
                    'By': txn.performedBy?.userName || 'System'
                });
            }
        }

        // Bottles Purchase Transactions
        if (inventoryType === 'all' || inventoryType === 'bottles') {
            const bottlesDocs = await BottlesTransactions.aggregate([
                { $unwind: '$transactions' },
                {
                    $match: {
                        'transactions.transactionType': 'IN',
                        'transactions.createdAt': { $gte: startDate, $lte: endDate },
                        'transactions.reason': { $nin: EXCLUDED_REASONS }
                    }
                },
                {
                    $project: {
                        mlSize: 1,
                        itemType: 1,
                        quantity: '$transactions.quantity',
                        reason: '$transactions.reason',
                        notes: '$transactions.notes',
                        createdAt: '$transactions.createdAt',
                        performedBy: '$transactions.performedBy'
                    }
                }
            ]);

            for (const txn of bottlesDocs) {
                const productName = `${txn.mlSize}ml ${txn.itemType}`;

                const key = `btl|${productName}`;
                if (allProductsMap.has(key)) {
                    const entry = allProductsMap.get(key);
                    entry.totalQuantity += txn.quantity || 0;
                    entry.transactionCount += 1;
                }

                purchaseData.push({
                    productName: productName,
                    category: 'Bottles',
                    quantity: txn.quantity || 0,
                    purchasePrice: 0,
                    totalCost: 0,
                    reason: txn.reason || 'Purchase',
                    createdAt: txn.createdAt,
                    performedBy: txn.performedBy?.userName || 'System',
                    unit: 'Count'
                });

                transactionDetailsFlat.push({
                    'Product': productName,
                    'Category': 'Bottles',
                    'Date': new Date(txn.createdAt).toLocaleDateString('en-IN'),
                    'Quantity': `${Number(txn.quantity || 0).toFixed(0)} Count`,
                    'Price/Unit': 'N/A',
                    'Total': 'N/A',
                    'Reason': txn.reason || 'Purchase',
                    'By': txn.performedBy?.userName || 'System'
                });
            }
        }

        let purchaseSummary = Array.from(allProductsMap.values()).map(entry => {
            const avgPrice = entry.purchasePrices.length > 0
                ? entry.purchasePrices.reduce((a, b) => a + b, 0) / entry.purchasePrices.length
                : 0;
            return {
                _id: entry.productName,
                productName: entry.productName,
                category: entry.category,
                totalQuantity: entry.totalQuantity,
                totalCost: entry.totalCost,
                avgPurchasePrice: avgPrice,
                transactionCount: entry.transactionCount,
                unit: entry.unit
            };
        });

        if (productId) {
            purchaseSummary = purchaseSummary.filter(item =>
                (item._id === productId || item.productName === productId)
            );
        }

        if (inventoryType === 'xp') {
            purchaseSummary = purchaseSummary.filter(item => item.category === 'XP Oil');
        } else if (inventoryType === 'dispenser') {
            purchaseSummary = purchaseSummary.filter(item => item.category === 'Dispenser');
        } else if (inventoryType === 'bottles') {
            purchaseSummary = purchaseSummary.filter(item => item.category === 'Bottles');
        }

        purchaseSummary.sort((a, b) => a.productName.localeCompare(b.productName));

        const summary = {
            totalCost: purchaseSummary.reduce((sum, item) => sum + item.totalCost, 0),
            totalQuantity: purchaseSummary.reduce((sum, item) => sum + item.totalQuantity, 0),
            avgPrice: purchaseSummary.length > 0
                ? purchaseSummary.reduce((sum, item) => sum + item.avgPurchasePrice, 0) / purchaseSummary.length
                : 0,
            totalProducts: purchaseSummary.length
        };

        // EXPORT DATA - 3 TABS
        const productSummaryData = purchaseSummary.map(item => ({
            'Product Name': item.productName,
            'Category': item.category,
            'Total Quantity': `${Number(item.totalQuantity || 0).toFixed(4)} ${item.unit || ''}`,
            'Average Price': item.category === 'Bottles' ? 'N/A' : formatCurrency(item.avgPurchasePrice || 0),
            'Total Cost': item.category === 'Bottles' ? 'N/A' : formatCurrency(item.totalCost || 0),
            'Transactions': item.transactionCount || 0
        }));

        const transactionDetailsData = groupByProductForExcel(transactionDetailsFlat, 'Product', 'Category');

        const productWiseFlatData = [];
        for (const item of purchaseSummary) {
            if (item.transactionCount === 0) {
                productWiseFlatData.push({
                    'Product': item.productName,
                    'Category': item.category,
                    'Date': '-',
                    'Quantity': `0 ${item.unit || ''}`,
                    'Price/Unit': item.category === 'Bottles' ? 'N/A' : '-',
                    'Total': item.category === 'Bottles' ? 'N/A' : '-',
                    'Reason': 'No Purchase'
                });
            } else {
                const productTransactions = purchaseData.filter(p => p.productName === item.productName);
                for (const txn of productTransactions) {
                    productWiseFlatData.push({
                        'Product': txn.productName,
                        'Category': txn.category,
                        'Date': new Date(txn.createdAt).toLocaleDateString('en-IN'),
                        'Quantity': `${Number(txn.quantity || 0).toFixed(4)} ${txn.unit || ''}`,
                        'Price/Unit': txn.category === 'Bottles' ? 'N/A' : formatCurrency(txn.purchasePrice || 0),
                        'Total': txn.category === 'Bottles' ? 'N/A' : formatCurrency(txn.totalCost || 0),
                        'Reason': txn.reason || 'Purchase'
                    });
                }
            }
        }

        const productWiseData = groupByProductForExcel(productWiseFlatData, 'Product', 'Category');

        const sheets = {
            'Product Summary': productSummaryData,
            'Transaction Details': transactionDetailsData,
            'Product Wise Purchase': productWiseData
        };

        if (isExport === 'true') {
            const excelBuffer = exportToMultiSheetExcel(sheets, 'purchase_report.xlsx');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=purchase_report_${new Date().toISOString().split('T')[0]}.xlsx`);
            return res.send(excelBuffer);
        }

        res.status(200).json({
            success: true,
            data: {
                summary,
                purchase: purchaseSummary,
                exportData: sheets,
                transactionDetails: transactionDetailsFlat,
                productWisePurchase: productWiseFlatData
            },
            filters: {
                filter,
                startDate,
                endDate,
                productId,
                inventoryType
            }
        });

    } catch (error) {
        console.error("Error generating purchase report:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate purchase report",
            error: error.message
        });
    }
});

// ============================================
// ✅ 3. INVENTORY REPORT - WITH PERMISSION CHECK
// ============================================
router.get("/inventory", auth, checkReportPermission, async (req, res) => {
    try {
        const {
            inventoryType = 'all',
            status = 'all',
            productId,
            export: isExport = 'false'
        } = req.query;

        console.log(`👤 User: ${req.user.name} (${req.user.email}) accessing Inventory Report`);
        console.log(`📊 Inventory Report - Type: ${inventoryType}, Status: ${status}`);

        const EXCLUDED_REASONS = [
            'Invoice',
            'Invoice Return',
            'Invoice Deletion - Return',
            'Invoice Edit - Return',
            'Invoice Edit - New Reduction'
        ];

        let inventoryData = [];
        let movementHistoryFlat = [];

        // ============================================
        // XP Inventory
        // ============================================
        if (inventoryType === 'all' || inventoryType === 'xp') {
            let query = {};
            if (status === 'low') {
                query.$expr = { $lt: ["$quantity", "$minStock"] };
            } else if (status === 'out-of-stock') {
                query.quantity = 0;
            }

            const xpItems = await XPInventory.find(query).lean();
            console.log(`📦 Found ${xpItems.length} XP products`);

            for (const item of xpItems) {
                inventoryData.push({
                    productId: item.xpId,
                    productName: item.productName,
                    category: 'XP Oil',
                    quantity: item.quantity || 0,
                    minStock: item.minStock || 5,
                    avgPurchasePrice: item.avgPurchasePrice || 0,
                    totalValue: (item.quantity || 0) * (item.avgPurchasePrice || 0),
                    unit: 'KG',
                    status: item.quantity === 0 ? 'Out of Stock' : item.quantity <= (item.minStock || 5) ? 'Low Stock' : 'Healthy'
                });

                const transactions = await XPTransactions.findOne({ xpId: item.xpId }).lean();

                if (transactions && transactions.transactions) {
                    for (const txn of transactions.transactions) {
                        if (txn.transactionType === 'IN' && !EXCLUDED_REASONS.includes(txn.reason)) {
                            movementHistoryFlat.push({
                                'Product': item.productName,
                                'Category': 'XP Oil',
                                '_category': 'XP Oil',
                                '_sortDate': txn.createdAt,
                                'Date': new Date(txn.createdAt).toLocaleDateString('en-IN'),
                                'Type': 'Added',
                                'Quantity': `${Number(txn.quantity || 0).toFixed(4)} KG`,
                                'Price': formatCurrency(txn.purchasePrice || 0),
                                'Balance': `${Number(txn.newStock || 0).toFixed(4)} KG`,
                                'Reason': txn.reason || 'Purchase'
                            });
                        }
                    }
                }
            }
        }

        // ============================================
        // Dispenser Inventory
        // ============================================
        if (inventoryType === 'all' || inventoryType === 'dispenser') {
            let query = {};
            if (status === 'low') {
                query.$expr = { $lt: ["$quantity", "$minStock"] };
            } else if (status === 'out-of-stock') {
                query.quantity = 0;
            }

            const dispenserItems = await DispenserInventory.find(query).lean();
            console.log(`📦 Found ${dispenserItems.length} Dispenser products`);

            for (const item of dispenserItems) {
                inventoryData.push({
                    productId: item.dispenserId,
                    productName: item.productName,
                    category: 'Dispenser',
                    quantity: item.quantity || 0,
                    minStock: item.minStock || 5,
                    avgPurchasePrice: item.avgPurchasePrice || 0,
                    totalValue: (item.quantity || 0) * (item.avgPurchasePrice || 0),
                    unit: 'KG',
                    status: item.quantity === 0 ? 'Out of Stock' : item.quantity <= (item.minStock || 5) ? 'Low Stock' : 'Healthy'
                });

                const transactions = await DispenserTransactions.findOne({ dispenserId: item.dispenserId }).lean();
                if (transactions && transactions.transactions) {
                    for (const txn of transactions.transactions) {
                        if (txn.transactionType === 'IN' && !EXCLUDED_REASONS.includes(txn.reason)) {
                            movementHistoryFlat.push({
                                'Product': item.productName,
                                'Category': 'Dispenser',
                                '_category': 'Dispenser',
                                '_sortDate': txn.createdAt,
                                'Date': new Date(txn.createdAt).toLocaleDateString('en-IN'),
                                'Type': 'Added',
                                'Quantity': `${Number(txn.quantity || 0).toFixed(4)} KG`,
                                'Price': formatCurrency(txn.purchasePrice || 0),
                                'Balance': `${Number(txn.newStock || 0).toFixed(4)} KG`,
                                'Reason': txn.reason || 'Purchase'
                            });
                        }
                    }
                }
            }
        }

        // ============================================
        // Bottles Inventory
        // ============================================
        if (inventoryType === 'all' || inventoryType === 'bottles') {
            let query = {};
            if (status === 'low') {
                query.$expr = { $lt: ["$quantity", "$minStock"] };
            } else if (status === 'out-of-stock') {
                query.quantity = 0;
            }

            const bottlesItems = await BottlesInventory.find(query).lean();
            console.log(`📦 Found ${bottlesItems.length} Bottles products`);

            for (const item of bottlesItems) {
                const productName = `${item.mlSize}ml ${item.itemType}`;
                inventoryData.push({
                    productId: item.bottleItemId,
                    productName: productName,
                    category: 'Bottles',
                    quantity: item.quantity || 0,
                    minStock: item.minStock || 5,
                    avgPurchasePrice: 0,
                    totalValue: 0,
                    unit: 'Count',
                    status: item.quantity === 0 ? 'Out of Stock' : item.quantity <= (item.minStock || 5) ? 'Low Stock' : 'Healthy'
                });

                const transactions = await BottlesTransactions.findOne({ mlSize: item.mlSize, itemType: item.itemType }).lean();
                if (transactions && transactions.transactions) {
                    for (const txn of transactions.transactions) {
                        if (txn.transactionType === 'IN' && !EXCLUDED_REASONS.includes(txn.reason)) {
                            movementHistoryFlat.push({
                                'Product': productName,
                                'Category': 'Bottles',
                                '_category': 'Bottles',
                                '_sortDate': txn.createdAt,
                                'Date': new Date(txn.createdAt).toLocaleDateString('en-IN'),
                                'Type': 'Added',
                                'Quantity': `${Number(txn.quantity || 0).toFixed(0)} Count`,
                                'Price': 'N/A',
                                'Balance': `${Number(txn.newStock || 0).toFixed(0)} Count`,
                                'Reason': txn.reason || 'Purchase'
                            });
                        }
                    }
                }
            }
        }

        // ============================================
        // Filter by product if provided
        // ============================================
        if (productId) {
            inventoryData = inventoryData.filter(item =>
                item.productId === productId ||
                item.productName === productId
            );
        }

        // ============================================
        // Sort inventoryData by category then name
        // ============================================
        inventoryData.sort((a, b) => {
            const catA = a.category || '';
            const catB = b.category || '';
            const nameA = a.productName || '';
            const nameB = b.productName || '';
            if (catA !== catB) return catA.localeCompare(catB);
            return nameA.localeCompare(nameB);
        });

        // ============================================
        // Sort movementHistoryFlat by date DESC
        // ============================================
        movementHistoryFlat.sort((a, b) => {
            const dateA = a._sortDate ? new Date(a._sortDate) : new Date(0);
            const dateB = b._sortDate ? new Date(b._sortDate) : new Date(0);
            return dateB - dateA;
        });

        // ============================================
        // GROUP MOVEMENT HISTORY BY PRODUCT
        // ============================================
        const groupedObj = {};

        for (const row of movementHistoryFlat) {
            const key = (row['Product'] || '').trim();
            if (!groupedObj[key]) {
                groupedObj[key] = [];
            }
            groupedObj[key].push(row);
        }

        // Build final grouped array
        const movementDataClean = [];

        for (const productName in groupedObj) {
            const rows = groupedObj[productName];

            // Sort each product's transactions newest first
            rows.sort((a, b) => {
                const dateA = a._sortDate ? new Date(a._sortDate) : new Date(0);
                const dateB = b._sortDate ? new Date(b._sortDate) : new Date(0);
                return dateB - dateA;
            });

            rows.forEach((row, index) => {
                movementDataClean.push({
                    'Product': index === 0 ? row['Product'] : '',
                    'Category': index === 0 ? row['Category'] : '',
                    '_category': row['_category'],
                    'Date': row['Date'],
                    'Type': row['Type'],
                    'Quantity': row['Quantity'],
                    'Price': row['Price'],
                    'Balance': row['Balance'],
                    'Reason': row['Reason']
                });
            });
        }

        // ============================================
        // FILTER BY CATEGORY using _category
        // ============================================
        const xpMovement = movementDataClean.filter(item => item._category === 'XP Oil');
        const dispenserMovement = movementDataClean.filter(item => item._category === 'Dispenser');
        const bottlesMovement = movementDataClean.filter(item => item._category === 'Bottles');

        // ============================================
        // STRIP hidden fields before writing to Excel
        // ============================================
        const stripHidden = (rows) => rows.map(({ _category, _sortDate, ...rest }) => rest);

        // ============================================
        // Current Stock data
        // ============================================
        const currentStockData = inventoryData.map(item => ({
            'Product Name': item.productName,
            'Category': item.category,
            'Quantity': `${Number(item.quantity || 0).toFixed(4)} ${item.unit || ''}`,
            'Min Stock': item.minStock || 5,
            'Avg Purchase Price': item.category === 'Bottles' ? 'N/A' : formatCurrency(item.avgPurchasePrice || 0),
            'Total Value': item.category === 'Bottles' ? 'N/A' : formatCurrency(item.totalValue || 0),
            'Status': item.status || 'Unknown'
        }));

        const xpStock = currentStockData.filter(item => item['Category'] === 'XP Oil');
        const dispenserStock = currentStockData.filter(item => item['Category'] === 'Dispenser');
        const bottlesStock = currentStockData.filter(item => item['Category'] === 'Bottles');

        // ============================================
        // Build Excel Sheets
        // ============================================
        const sheets = {};

        if (inventoryType === 'all' || inventoryType === 'xp') {
            sheets['XP Oil - Current Stock'] = xpStock.length > 0
                ? xpStock
                : [{ 'Product Name': 'No XP Oil products', 'Category': '-', 'Quantity': '-', 'Min Stock': '-', 'Avg Purchase Price': '-', 'Total Value': '-', 'Status': '-' }];
        }
        if (inventoryType === 'all' || inventoryType === 'dispenser') {
            sheets['Dispenser - Current Stock'] = dispenserStock.length > 0
                ? dispenserStock
                : [{ 'Product Name': 'No Dispenser products', 'Category': '-', 'Quantity': '-', 'Min Stock': '-', 'Avg Purchase Price': '-', 'Total Value': '-', 'Status': '-' }];
        }
        if (inventoryType === 'all' || inventoryType === 'bottles') {
            sheets['Bottles - Current Stock'] = bottlesStock.length > 0
                ? bottlesStock
                : [{ 'Product Name': 'No Bottles products', 'Category': '-', 'Quantity': '-', 'Min Stock': '-', 'Avg Purchase Price': '-', 'Total Value': '-', 'Status': '-' }];
        }

        if (inventoryType === 'all' || inventoryType === 'xp') {
            sheets['XP Oil - Movement'] = xpMovement.length > 0
                ? stripHidden(xpMovement)
                : [{ 'Product': 'No XP Oil movements', 'Category': '-', 'Date': '-', 'Type': '-', 'Quantity': '-', 'Price': '-', 'Balance': '-', 'Reason': '-' }];
        }
        if (inventoryType === 'all' || inventoryType === 'dispenser') {
            sheets['Dispenser - Movement'] = dispenserMovement.length > 0
                ? stripHidden(dispenserMovement)
                : [{ 'Product': 'No Dispenser movements', 'Category': '-', 'Date': '-', 'Type': '-', 'Quantity': '-', 'Price': '-', 'Balance': '-', 'Reason': '-' }];
        }
        if (inventoryType === 'all' || inventoryType === 'bottles') {
            sheets['Bottles - Movement'] = bottlesMovement.length > 0
                ? stripHidden(bottlesMovement)
                : [{ 'Product': 'No Bottles movements', 'Category': '-', 'Date': '-', 'Type': '-', 'Quantity': '-', 'Price': '-', 'Balance': '-', 'Reason': '-' }];
        }

        // ============================================
        // Export or Return JSON
        // ============================================
        if (isExport === 'true') {
            console.log(`📊 Exporting inventory report - Movement rows: ${movementDataClean.length}`);
            const excelBuffer = exportToMultiSheetExcel(sheets, 'inventory_report.xlsx');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=inventory_report_${new Date().toISOString().split('T')[0]}.xlsx`);
            return res.send(excelBuffer);
        }

        // ============================================
        // Calculate Summary
        // ============================================
        const summary = {
            totalItems: inventoryData.length,
            totalValue: inventoryData.reduce((sum, item) => sum + (item.totalValue || 0), 0),
            lowStock: inventoryData.filter(item => item.quantity > 0 && item.quantity <= (item.minStock || 5)).length,
            outOfStock: inventoryData.filter(item => item.quantity === 0).length
        };

        res.status(200).json({
            success: true,
            data: {
                summary,
                inventory: inventoryData,
                movementHistory: movementHistoryFlat.slice(0, 100),
                exportData: sheets
            },
            filters: {
                inventoryType,
                status,
                productId
            }
        });

    } catch (error) {
        console.error("Error generating inventory report:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate inventory report",
            error: error.message
        });
    }
});

// ============================================
// ✅ 4. WORKSHOP REPORT - WITH PERMISSION CHECK
// ============================================
router.get("/workshop", auth, checkReportPermission, async (req, res) => {
    try {
        const {
            filter = 'today',
            fromDate,
            toDate,
            status = 'all',
            export: isExport = 'false'
        } = req.query;

        console.log(`👤 User: ${req.user.name} (${req.user.email}) accessing Workshop Report`);

        const { startDate, endDate } = getDateRange(filter, fromDate, toDate);

        console.log(`📊 Workshop Report - Filter: ${filter}, From: ${startDate}, To: ${endDate}`);

        let query = {
            date: { $gte: startDate, $lte: endDate },
            isDeleted: false
        };

        if (status !== 'all') {
            query.status = status;
        }

        const workshops = await Workshop.find(query)
            .sort({ date: 1, startTime: 1 })
            .lean();

        const workshopData = workshops.map(w => {
            const totalCustomers = w.customers?.length || 0;
            const attended = w.customers?.filter(c => c.attended === true).length || 0;
            const pendingInvoices = w.customers?.filter(c => c.attended === true && c.invoiceCreated !== true).length || 0;

            return {
                workshopId: w.workshopId,
                date: w.date,
                startTime: w.startTime,
                endTime: w.endTime,
                status: w.status,
                totalCustomers,
                attended,
                pendingInvoices,
                customers: w.customers || []
            };
        });

        const summary = {
            totalWorkshops: workshopData.length,
            totalCustomers: workshopData.reduce((sum, w) => sum + w.totalCustomers, 0),
            totalAttended: workshopData.reduce((sum, w) => sum + w.attended, 0),
            totalPendingInvoices: workshopData.reduce((sum, w) => sum + w.pendingInvoices, 0),
            attendanceRate: workshopData.length > 0
                ? (workshopData.reduce((sum, w) => sum + w.attended, 0) / workshopData.reduce((sum, w) => sum + w.totalCustomers, 0)) * 100
                : 0
        };

        const exportData = workshopData.map(w => ({
            'Date': new Date(w.date).toLocaleDateString('en-IN'),
            'Start Time': w.startTime,
            'End Time': w.endTime,
            'Status': w.status,
            'Total Customers': w.totalCustomers,
            'Attended': w.attended,
            'Pending Invoices': w.pendingInvoices
        }));

        if (isExport === 'true') {
            const sheets = {
                'Workshop Report': exportData
            };
            const excelBuffer = exportToMultiSheetExcel(sheets, 'workshop_report.xlsx');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=workshop_report_${new Date().toISOString().split('T')[0]}.xlsx`);
            return res.send(excelBuffer);
        }

        res.status(200).json({
            success: true,
            data: {
                summary,
                workshops: workshopData,
                exportData
            },
            filters: {
                filter,
                startDate,
                endDate,
                status
            }
        });

    } catch (error) {
        console.error("Error generating workshop report:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate workshop report",
            error: error.message
        });
    }
});

// ============================================
// ✅ 5. CUSTOMER REPORT - WITH PERMISSION CHECK
// ============================================
router.get("/customer", auth, checkReportPermission, async (req, res) => {
    try {
        const {
            filter = 'today',
            fromDate,
            toDate,
            search,
            export: isExport = 'false'
        } = req.query;

        console.log(`👤 User: ${req.user.name} (${req.user.email}) accessing Customer Report`);

        const { startDate, endDate } = getDateRange(filter, fromDate, toDate);

        console.log(`📊 Customer Report - Filter: ${filter}, From: ${startDate}, To: ${endDate}`);

        let customerQuery = {};
        if (search) {
            customerQuery = {
                $or: [
                    { customerName: { $regex: search, $options: 'i' } },
                    { contactNumber: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            };
        }

        const customers = await Customer.find(customerQuery).lean();

        const customerData = [];
        for (const customer of customers) {
            const invoices = await Invoice.find({
                'customer.customerId': customer.customerId,
                status: 'Active',
                invoiceDate: { $gte: startDate, $lte: endDate }
            }).lean();

            const totalInvoices = invoices.length;
            const totalSpent = invoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
            const loyaltyEarned = invoices.reduce((sum, inv) => sum + (inv.loyaltyCoinsEarned || 0), 0);
            const loyaltyUsed = invoices.reduce((sum, inv) => sum + (inv.loyaltyCoinsUsed || 0), 0);

            if (totalInvoices > 0 || totalSpent > 0) {
                customerData.push({
                    customerId: customer.customerId,
                    customerName: customer.customerName,
                    contactNumber: customer.contactNumber,
                    email: customer.email || '',
                    loyaltyCoins: customer.loyaltyCoins || 0,
                    totalInvoices,
                    totalSpent,
                    loyaltyEarned,
                    loyaltyUsed,
                    avgInvoiceValue: totalInvoices > 0 ? totalSpent / totalInvoices : 0
                });
            }
        }

        customerData.sort((a, b) => b.totalSpent - a.totalSpent);

        const summary = {
            totalCustomers: customerData.length,
            totalRevenue: customerData.reduce((sum, c) => sum + c.totalSpent, 0),
            totalInvoices: customerData.reduce((sum, c) => sum + c.totalInvoices, 0),
            avgSpent: customerData.length > 0
                ? customerData.reduce((sum, c) => sum + c.totalSpent, 0) / customerData.length
                : 0
        };

        const exportData = customerData.map(c => ({
            'Customer Name': c.customerName,
            'Contact': c.contactNumber,
            'Email': c.email || 'N/A',
            'Loyalty Coins': c.loyaltyCoins,
            'Total Invoices': c.totalInvoices,
            'Total Spent': formatCurrency(c.totalSpent),
            'Avg Invoice': formatCurrency(c.avgInvoiceValue)
        }));

        if (isExport === 'true') {
            const sheets = {
                'Customer Report': exportData
            };
            const excelBuffer = exportToMultiSheetExcel(sheets, 'customer_report.xlsx');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=customer_report_${new Date().toISOString().split('T')[0]}.xlsx`);
            return res.send(excelBuffer);
        }

        res.status(200).json({
            success: true,
            data: {
                summary,
                customers: customerData,
                exportData
            },
            filters: {
                filter,
                startDate,
                endDate,
                search: search || null
            }
        });

    } catch (error) {
        console.error("Error generating customer report:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate customer report",
            error: error.message
        });
    }
});

module.exports = router;