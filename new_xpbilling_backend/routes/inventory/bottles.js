const express = require("express");
const router = express.Router();
const multer = require("multer");
const BottlesInventory = require("../../models/inventory/bottles/bottlesInventory");
const BottlesTransactions = require("../../models/inventory/bottles/bottlesTransactions");
const User = require("../../models/user");
const jwt = require("jsonwebtoken");
const { logSuccess, logFailed } = require("../../utils/logHelper");
const { parseExcel, downloadTemplate, downloadErrorExcel } = require("../../utils/bottlesExcelHelper");

// ============================================
// MULTER CONFIGURATION
// ============================================
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files (.xlsx, .xls) are allowed'), false);
        }
    }
});

// ============================================
// CONSTANTS
// ============================================
const PREDEFINED_MLS = ["3", "6", "30", "60", "125"];
const PREDEFINED_ITEM_TYPES = ["Bottle", "Cap", "Pump", "Box"];
const MIN_STOCK_ALERT = 5;

// ============================================
// CONSTANTS - Invoice related reasons to exclude
// ============================================
const INVOICE_RELATED_REASONS = [
    'Invoice',
    'Invoice Return',
    'Invoice Deletion - Return',
    'Invoice Edit - Return',
    'Invoice Edit - New Reduction'
];

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
// CHECK INVENTORY PERMISSION
// ============================================
const checkInventoryPermission = (req, res, next) => {
    const permissions = req.user.permissions || [];

    if (permissions.includes('admin') || permissions.includes('inventory')) {
        next();
    } else {
        return res.status(403).json({
            message: 'Access denied. Inventory permission required.'
        });
    }
};

// ============================================
// HELPER: Get or create inventory item
// ============================================
const getOrCreateInventoryItem = async (mlSize, itemType, user) => {
    let inventory = await BottlesInventory.findOne({ mlSize, itemType });

    if (!inventory) {
        inventory = new BottlesInventory({
            mlSize,
            itemType,
            quantity: 0,
            totalCost: 0,
            avgPurchasePrice: 0,
            minStock: MIN_STOCK_ALERT,
            createdBy: {
                userId: user.userId,
                userName: user.name,
                userEmail: user.email
            }
        });
        await inventory.save();
    }

    return inventory;
};

// ============================================
// GET ALL INVENTORY
// ============================================
router.get("/get-all", auth, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            mlSize = '',
            itemType = '',
            sortBy = 'mlSize',
            sortOrder = 'asc'
        } = req.query;

        let query = {};

        if (search && search.trim() !== '') {
            query.$or = [
                { mlSize: { $regex: search.trim(), $options: 'i' } },
                { itemType: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        if (mlSize && mlSize.trim() !== '') {
            query.mlSize = mlSize.trim();
        }

        if (itemType && itemType.trim() !== '') {
            query.itemType = itemType.trim();
        }

        const total = await BottlesInventory.countDocuments(query);

        const sortObj = {};
        sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const inventory = await BottlesInventory.find(query)
            .sort(sortObj)
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .lean();

        const totalPages = Math.ceil(total / parseInt(limit));

        res.status(200).json({
            inventory,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error("Error fetching inventory:", error);
        res.status(500).json({
            message: "Failed to fetch inventory",
            error: error.message
        });
    }
});

// ============================================
// GET BY ML SIZE
// ============================================
router.get("/get-by-ml/:mlSize", auth, async (req, res) => {
    try {
        const { mlSize } = req.params;

        const inventory = await BottlesInventory.find({ mlSize })
            .sort({ itemType: 1 })
            .lean();

        if (inventory.length === 0) {
            return res.status(404).json({
                message: `No inventory found for ML size: ${mlSize}`
            });
        }

        res.status(200).json(inventory);
    } catch (error) {
        console.error("Error fetching inventory by ML:", error);
        res.status(500).json({
            message: "Failed to fetch inventory",
            error: error.message
        });
    }
});

// ============================================
// GET BY ITEM TYPE
// ============================================
router.get("/get-by-item/:itemType", auth, async (req, res) => {
    try {
        const { itemType } = req.params;

        const inventory = await BottlesInventory.find({ itemType })
            .sort({ mlSize: 1 })
            .lean();

        if (inventory.length === 0) {
            return res.status(404).json({
                message: `No inventory found for item type: ${itemType}`
            });
        }

        res.status(200).json(inventory);
    } catch (error) {
        console.error("Error fetching inventory by item type:", error);
        res.status(500).json({
            message: "Failed to fetch inventory",
            error: error.message
        });
    }
});

// ============================================
// GET LOW STOCK ALERTS
// ============================================
router.get("/get-alerts", auth, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            mlSize = '',
            itemType = ''
        } = req.query;

        let query = {
            $expr: { $lt: ["$quantity", "$minStock"] }
        };

        if (mlSize && mlSize.trim() !== '') {
            query.mlSize = mlSize.trim();
        }

        if (itemType && itemType.trim() !== '') {
            query.itemType = itemType.trim();
        }

        const total = await BottlesInventory.countDocuments(query);

        const alerts = await BottlesInventory.find(query)
            .sort({ mlSize: 1, itemType: 1, quantity: 1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .lean();

        const totalPages = Math.ceil(total / parseInt(limit));

        res.status(200).json({
            alerts,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error("Error fetching alerts:", error);
        res.status(500).json({
            message: "Failed to fetch alerts",
            error: error.message
        });
    }
});

// ============================================
// GET TRANSACTIONS - UPDATED WITH hideInvoice FILTER
// ============================================
router.get("/get-transactions", auth, async (req, res) => {
    try {
        const {
            mlSize,
            itemType,
            page = 1,
            limit = 50,
            transactionType,
            startDate,
            endDate,
            hideInvoice = 'false'
        } = req.query;

        let result;

        if (mlSize && itemType) {
            result = await getTransactionsWithFilter(
                mlSize,
                itemType,
                parseInt(limit),
                parseInt(page),
                hideInvoice === 'true'
            );
        } else {
            let matchConditions = {};

            if (mlSize) {
                matchConditions.mlSize = mlSize;
            }

            if (itemType) {
                matchConditions.itemType = itemType;
            }

            let transactionMatch = {};

            if (transactionType) {
                transactionMatch['transactions.transactionType'] = transactionType;
            }

            if (startDate || endDate) {
                transactionMatch['transactions.createdAt'] = {};
                if (startDate) {
                    transactionMatch['transactions.createdAt']['$gte'] = new Date(startDate);
                }
                if (endDate) {
                    transactionMatch['transactions.createdAt']['$lte'] = new Date(endDate);
                }
            }

            if (hideInvoice === 'true') {
                transactionMatch['transactions.reason'] = { $nin: INVOICE_RELATED_REASONS };
                transactionMatch['transactions.transactionType'] = 'IN';
            }

            const pipeline = [];

            if (Object.keys(matchConditions).length > 0) {
                pipeline.push({ $match: matchConditions });
            }

            pipeline.push({ $unwind: "$transactions" });

            if (Object.keys(transactionMatch).length > 0) {
                pipeline.push({ $match: transactionMatch });
            }

            pipeline.push({
                $sort: { "transactions.createdAt": -1 }
            });

            const countPipeline = [...pipeline];
            countPipeline.push({ $count: "total" });

            const countResult = await BottlesTransactions.aggregate(countPipeline);
            const total = countResult[0]?.total || 0;

            pipeline.push({
                $skip: (parseInt(page) - 1) * parseInt(limit)
            });
            pipeline.push({
                $limit: parseInt(limit)
            });

            pipeline.push({
                $project: {
                    transactionId: "$transactions.transactionId",
                    transactionType: "$transactions.transactionType",
                    quantity: "$transactions.quantity",
                    purchasePrice: "$transactions.purchasePrice",
                    previousStock: "$transactions.previousStock",
                    newStock: "$transactions.newStock",
                    previousAvgPrice: "$transactions.previousAvgPrice",
                    newAvgPrice: "$transactions.newAvgPrice",
                    previousTotalCost: "$transactions.previousTotalCost",
                    newTotalCost: "$transactions.newTotalCost",
                    reason: "$transactions.reason",
                    notes: "$transactions.notes",
                    performedBy: "$transactions.performedBy",
                    bulkUploadId: "$transactions.bulkUploadId",
                    createdAt: "$transactions.createdAt",
                    mlSize: 1,
                    itemType: 1,
                    bottleItemId: 1
                }
            });

            const transactions = await BottlesTransactions.aggregate(pipeline);

            const totalPages = Math.ceil(total / parseInt(limit));

            result = {
                transactions,
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            };
        }

        res.status(200).json(result);

    } catch (error) {
        console.error("Error fetching transactions:", error);
        res.status(500).json({
            message: "Failed to fetch transactions",
            error: error.message
        });
    }
});

// ============================================
// ✅ HELPER: Get transactions with filter for single item
// ============================================
const getTransactionsWithFilter = async (mlSize, itemType, limit, page, hideInvoice) => {
    const doc = await BottlesTransactions.findOne({ mlSize, itemType }).lean();
    if (!doc) return { transactions: [], total: 0, page, limit, totalPages: 0 };

    let transactions = doc.transactions || [];

    if (hideInvoice) {
        transactions = transactions.filter(t => {
            if (t.transactionType !== 'IN') return false;
            return !INVOICE_RELATED_REASONS.includes(t.reason);
        });
    }

    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = transactions.length;
    const skip = (page - 1) * limit;
    const paginated = transactions.slice(skip, skip + limit);

    return {
        transactions: paginated,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
};

// ============================================
// GET SUMMARY
// ============================================
router.get("/get-summary", auth, async (req, res) => {
    try {
        const { mlSize } = req.query;

        if (!mlSize) {
            return res.status(400).json({
                message: "ML size is required"
            });
        }

        const summary = await BottlesTransactions.getSummaryByML(mlSize);

        const currentStock = await BottlesInventory.find({ mlSize }).lean();

        res.status(200).json({
            summary,
            currentStock
        });
    } catch (error) {
        console.error("Error fetching summary:", error);
        res.status(500).json({
            message: "Failed to fetch summary",
            error: error.message
        });
    }
});

// ============================================
// ✅ UPDATED: ADD STOCK (SINGLE ITEM) - WITH PURCHASE PRICE
// ============================================
router.post("/add-stock", auth, checkInventoryPermission, async (req, res) => {
    try {
        const { mlSize, itemType, quantity, purchasePrice, reason, notes } = req.body;

        // Validate required fields
        if (!mlSize || !itemType || !quantity) {
            await logFailed({
                module: 'Bottles Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Add Stock',
                heading: 'Add Stock Failed',
                description: 'ML size, item type and quantity are required'
            });
            return res.status(400).json({
                message: "ML size, item type and quantity are required"
            });
        }

        // Validate quantity
        if (quantity <= 0) {
            await logFailed({
                module: 'Bottles Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Add Stock',
                heading: 'Add Stock Failed',
                description: 'Quantity must be greater than 0'
            });
            return res.status(400).json({
                message: "Quantity must be greater than 0"
            });
        }

        // ✅ NEW: Validate purchase price
        if (purchasePrice === undefined || purchasePrice === null || purchasePrice < 0) {
            await logFailed({
                module: 'Bottles Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Add Stock',
                heading: 'Add Stock Failed',
                description: 'Purchase price is required and must be >= 0'
            });
            return res.status(400).json({
                message: "Purchase price is required and must be >= 0"
            });
        }

        // Get or create inventory item
        const inventory = await getOrCreateInventoryItem(mlSize, itemType, req.user);

        const oldQuantity = inventory.quantity;
        const oldTotalCost = inventory.totalCost || 0;
        const oldAvgPrice = inventory.avgPurchasePrice || 0;
        const qty = parseInt(quantity);
        const price = parseFloat(purchasePrice);

        // Calculate new totals
        const newQuantity = oldQuantity + qty;
        const newTotalCost = oldTotalCost + (qty * price);
        const newAvgPrice = newTotalCost / newQuantity;

        // Update inventory
        inventory.quantity = newQuantity;
        inventory.totalCost = newTotalCost;
        inventory.avgPurchasePrice = newAvgPrice;
        inventory.updatedBy = {
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email
        };
        await inventory.save();

        // ✅ Create transaction with purchase price
        const transactionData = {
            transactionType: 'IN',
            quantity: qty,
            purchasePrice: price,
            previousStock: oldQuantity,
            newStock: newQuantity,
            previousAvgPrice: oldAvgPrice,
            newAvgPrice: newAvgPrice,
            previousTotalCost: oldTotalCost,
            newTotalCost: newTotalCost,
            reason: reason || 'Purchase',
            notes: notes || '',
            performedBy: {
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email
            }
        };

        await BottlesTransactions.addTransaction(mlSize, itemType, inventory.bottleItemId, transactionData);

        await logSuccess({
            module: 'Bottles Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Add Stock',
            heading: 'Stock Added Successfully',
            description: `Added ${qty} ${itemType}(s) for ${mlSize} at ₹${price}/item. New stock: ${newQuantity}, Avg Price: ₹${newAvgPrice.toFixed(2)}`
        });

        res.status(200).json({
            message: "Stock added successfully",
            data: {
                inventory: inventory.toObject()
            }
        });

    } catch (error) {
        console.error("Error adding stock:", error);

        await logFailed({
            module: 'Bottles Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Add Stock',
            heading: 'Add Stock Failed',
            description: error.message || 'Unknown error occurred'
        });

        if (error.code === 11000) {
            return res.status(400).json({
                message: "Duplicate entry. Please try again."
            });
        }

        res.status(500).json({
            message: "Failed to add stock",
            error: error.message
        });
    }
});

// ============================================
// ✅ UPDATED: BULK UPLOAD - EXCEL (WITH PURCHASE PRICE)
// ============================================
router.post("/bulk-upload", auth, checkInventoryPermission, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                message: "Excel file is required"
            });
        }

        const file = {
            data: req.file.buffer,
            name: req.file.originalname
        };

        const result = await parseExcel(file);

        if (!result || result.total === 0) {
            return res.status(400).json({
                message: "No valid data found in Excel file"
            });
        }

        const errors = [];
        const success = [];
        const bulkUploadId = `bulk-${Date.now()}`;

        const originalData = result.originalData || [];

        for (let i = 0; i < result.success.length; i++) {
            const row = result.success[i];
            const rowNumber = row.rowNumber;

            try {
                const { mlSize, itemType, quantity, purchasePrice } = row;

                if (!mlSize || mlSize.trim() === '') {
                    errors.push({ row: rowNumber, mlSize, itemType, quantity, purchasePrice, error: 'ML size is required' });
                    continue;
                }

                if (!itemType || itemType.trim() === '') {
                    errors.push({ row: rowNumber, mlSize, itemType, quantity, purchasePrice, error: 'Item type is required' });
                    continue;
                }

                if (!quantity || isNaN(quantity) || parseInt(quantity) <= 0) {
                    errors.push({ row: rowNumber, mlSize, itemType, quantity, purchasePrice, error: 'Quantity must be a positive number' });
                    continue;
                }

                // ✅ NEW: Validate purchase price
                if (purchasePrice === undefined || purchasePrice === null || purchasePrice < 0) {
                    errors.push({ row: rowNumber, mlSize, itemType, quantity, purchasePrice, error: 'Purchase price must be >= 0' });
                    continue;
                }

                const mlSizeTrim = mlSize.trim();
                const itemTypeTrim = itemType.trim();
                const qty = parseInt(quantity);
                const price = parseFloat(purchasePrice);

                const inventory = await getOrCreateInventoryItem(mlSizeTrim, itemTypeTrim, req.user);

                const oldQuantity = inventory.quantity;
                const oldTotalCost = inventory.totalCost || 0;
                const oldAvgPrice = inventory.avgPurchasePrice || 0;
                const newQuantity = oldQuantity + qty;
                const newTotalCost = oldTotalCost + (qty * price);
                const newAvgPrice = newTotalCost / newQuantity;

                inventory.quantity = newQuantity;
                inventory.totalCost = newTotalCost;
                inventory.avgPurchasePrice = newAvgPrice;
                inventory.updatedBy = {
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email
                };
                await inventory.save();

                const transactionData = {
                    transactionType: 'IN',
                    quantity: qty,
                    purchasePrice: price,
                    previousStock: oldQuantity,
                    newStock: newQuantity,
                    previousAvgPrice: oldAvgPrice,
                    newAvgPrice: newAvgPrice,
                    previousTotalCost: oldTotalCost,
                    newTotalCost: newTotalCost,
                    reason: 'Purchase',
                    notes: 'Bulk upload',
                    performedBy: {
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email
                    },
                    bulkUploadId: bulkUploadId
                };

                await BottlesTransactions.addTransaction(mlSizeTrim, itemTypeTrim, inventory.bottleItemId, transactionData);

                success.push({
                    row: rowNumber,
                    mlSize: mlSizeTrim,
                    itemType: itemTypeTrim,
                    quantity: qty,
                    purchasePrice: price,
                    newStock: newQuantity,
                    newAvgPrice: newAvgPrice
                });

            } catch (error) {
                errors.push({
                    row: rowNumber,
                    mlSize: row.mlSize,
                    itemType: row.itemType,
                    quantity: row.quantity,
                    purchasePrice: row.purchasePrice,
                    error: error.message || 'Unknown error'
                });
            }
        }

        if (result.errors && result.errors.length > 0) {
            result.errors.forEach(err => {
                errors.push(err);
            });
        }

        // ============================================
        // ✅ CREATE AUDIT FILE
        // ============================================
        const { createAuditFile } = require("../../utils/auditHelper");

        const successData = success.map(item => ({
            'Row': item.row || 'N/A',
            'ML Size': item.mlSize || 'N/A',
            'Item Type': item.itemType || 'N/A',
            'Quantity': item.quantity || 0,
            'Purchase Price': item.purchasePrice || 0,
            'New Stock': item.newStock || 0,
            'New Avg Price': item.newAvgPrice || 0,
            'Status': '✅ Added'
        }));

        const failedData = errors.map(item => ({
            'Row': item.row || 'N/A',
            'ML Size': item.mlSize || 'N/A',
            'Item Type': item.itemType || 'N/A',
            'Quantity': item.quantity || 'N/A',
            'Purchase Price': item.purchasePrice || 'N/A',
            'Error Reason': item.error || 'Unknown error'
        }));

        const summary = {
            uploadDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            category: 'Bottles',
            uploadedBy: req.user.name || req.user.userName || 'Unknown',
            fileName: req.file.originalname,
            totalRows: result.total || originalData.length,
            successCount: success.length,
            failedCount: errors.length
        };

        const auditResult = await createAuditFile('bottles', {
            originalData: originalData.length > 0 ? originalData : [{ 'Message': 'No original data available' }],
            successData: successData.length > 0 ? successData : [{ 'Message': 'No successful records' }],
            failedData: failedData.length > 0 ? failedData : [{ 'Message': 'No failed records' }],
            summary: summary,
            fileName: req.file.originalname,
            uploadedBy: req.user.name || req.user.userName
        });

        if (auditResult.success) {
            console.log(`✅ Bottles Audit file created: ${auditResult.auditFileName}`);
        } else {
            console.log(`⚠️ Bottles Audit file creation failed: ${auditResult.error}`);
        }

        if (success.length > 0) {
            await logSuccess({
                module: 'Bottles Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Bulk Upload',
                heading: 'Bulk Upload Completed',
                description: `${success.length} items added successfully, ${errors.length} failed. Audit: ${auditResult.success ? auditResult.auditFileName : 'Failed'}`
            });
        }

        if (errors.length > 0) {
            await logFailed({
                module: 'Bottles Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Bulk Upload',
                heading: 'Bulk Upload Partial Failure',
                description: `${errors.length} rows failed out of ${result.total}`
            });
        }

        res.status(200).json({
            message: `Bulk upload completed. ${success.length} added, ${errors.length} failed.`,
            success: {
                count: success.length,
                details: success
            },
            errors: {
                count: errors.length,
                details: errors
            },
            bulkUploadId: bulkUploadId,
            audit: {
                created: auditResult.success,
                fileName: auditResult.auditFileName || null,
                filePath: auditResult.auditFilePath || null
            }
        });

    } catch (error) {
        console.error("Error in bulk upload:", error);

        await logFailed({
            module: 'Bottles Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Bulk Upload',
            heading: 'Bulk Upload Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Bulk upload failed",
            error: error.message
        });
    }
});

// ============================================
// ADD NEW ML SIZE
// ============================================
router.post("/add-ml", auth, checkInventoryPermission, async (req, res) => {
    try {
        const { mlSize } = req.body;

        if (!mlSize || mlSize.trim() === '') {
            return res.status(400).json({
                message: "ML size is required"
            });
        }

        const mlSizeTrim = mlSize.trim();

        const existing = await BottlesInventory.findOne({ mlSize: mlSizeTrim });
        if (existing) {
            return res.status(400).json({
                message: `ML size "${mlSizeTrim}" already exists`
            });
        }

        const existingItemTypes = await BottlesInventory.distinct('itemType');
        const itemTypes = existingItemTypes.length > 0 ? existingItemTypes : PREDEFINED_ITEM_TYPES;

        const entries = itemTypes.map(itemType => ({
            mlSize: mlSizeTrim,
            itemType: itemType,
            quantity: 0,
            totalCost: 0,
            avgPurchasePrice: 0,
            minStock: MIN_STOCK_ALERT,
            createdBy: {
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email
            },
            updatedBy: {
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email
            }
        }));

        await BottlesInventory.insertMany(entries);

        await logSuccess({
            module: 'Bottles Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Add ML',
            heading: 'ML Size Added Successfully',
            description: `New ML size "${mlSizeTrim}" added with ${entries.length} item types`
        });

        res.status(201).json({
            message: `ML size "${mlSizeTrim}" added successfully`,
            mlSize: mlSizeTrim,
            itemTypes: itemTypes
        });

    } catch (error) {
        console.error("Error adding ML:", error);

        await logFailed({
            module: 'Bottles Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Add ML',
            heading: 'Add ML Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to add ML size",
            error: error.message
        });
    }
});

// ============================================
// ADD NEW ITEM TYPE
// ============================================
router.post("/add-item-type", auth, checkInventoryPermission, async (req, res) => {
    try {
        const { itemType } = req.body;

        if (!itemType || itemType.trim() === '') {
            return res.status(400).json({
                message: "Item type is required"
            });
        }

        const itemTypeTrim = itemType.trim();

        const existing = await BottlesInventory.findOne({ itemType: itemTypeTrim });
        if (existing) {
            return res.status(400).json({
                message: `Item type "${itemTypeTrim}" already exists`
            });
        }

        const existingMLs = await BottlesInventory.distinct('mlSize');
        const mlSizes = existingMLs.length > 0 ? existingMLs : PREDEFINED_MLS;

        const entries = mlSizes.map(ml => ({
            mlSize: ml,
            itemType: itemTypeTrim,
            quantity: 0,
            totalCost: 0,
            avgPurchasePrice: 0,
            minStock: MIN_STOCK_ALERT,
            createdBy: {
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email
            },
            updatedBy: {
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email
            }
        }));

        await BottlesInventory.insertMany(entries);

        await logSuccess({
            module: 'Bottles Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Add Item Type',
            heading: 'Item Type Added Successfully',
            description: `New item type "${itemTypeTrim}" added with ${entries.length} ML sizes`
        });

        res.status(201).json({
            message: `Item type "${itemTypeTrim}" added successfully`,
            itemType: itemTypeTrim,
            mlSizes: mlSizes
        });

    } catch (error) {
        console.error("Error adding item type:", error);

        await logFailed({
            module: 'Bottles Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Add Item Type',
            heading: 'Add Item Type Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to add item type",
            error: error.message
        });
    }
});

// ============================================
// GET ALL ML SIZES
// ============================================
router.get("/get-ml-sizes", auth, async (req, res) => {
    try {
        const mlSizes = await BottlesInventory.distinct('mlSize').sort();
        res.status(200).json(mlSizes);
    } catch (error) {
        console.error("Error fetching ML sizes:", error);
        res.status(500).json({
            message: "Failed to fetch ML sizes",
            error: error.message
        });
    }
});

// ============================================
// GET ALL ITEM TYPES
// ============================================
router.get("/get-item-types", auth, async (req, res) => {
    try {
        const itemTypes = await BottlesInventory.distinct('itemType').sort();
        res.status(200).json(itemTypes);
    } catch (error) {
        console.error("Error fetching item types:", error);
        res.status(500).json({
            message: "Failed to fetch item types",
            error: error.message
        });
    }
});

// ============================================
// DOWNLOAD EXCEL TEMPLATE
// ============================================
router.get("/download-template", auth, async (req, res) => {
    try {
        downloadTemplate(res);
    } catch (error) {
        console.error("Error downloading template:", error);
        res.status(500).json({
            message: "Failed to download template",
            error: error.message
        });
    }
});

// ============================================
// DOWNLOAD ERROR EXCEL
// ============================================
router.get("/download-error-excel/:bulkUploadId", auth, async (req, res) => {
    try {
        const { bulkUploadId } = req.params;

        const docs = await BottlesTransactions.find({
            "transactions.bulkUploadId": bulkUploadId
        });

        if (!docs || docs.length === 0) {
            return res.status(404).json({
                message: "No errors found for this bulk upload"
            });
        }

        const errors = [];
        docs.forEach(doc => {
            doc.transactions.forEach(t => {
                if (t.bulkUploadId === bulkUploadId && t.notes === 'Bulk upload error') {
                    errors.push({
                        mlSize: doc.mlSize,
                        itemType: doc.itemType,
                        quantity: t.quantity,
                        purchasePrice: t.purchasePrice || 0,
                        error: t.notes || 'Unknown error'
                    });
                }
            });
        });

        if (errors.length === 0) {
            return res.status(404).json({
                message: "No errors found for this bulk upload"
            });
        }

        downloadErrorExcel(errors, res);
    } catch (error) {
        console.error("Error downloading error excel:", error);
        res.status(500).json({
            message: "Failed to download error report",
            error: error.message
        });
    }
});

// ============================================
// EXPORT INVENTORY TO EXCEL
// ============================================
router.get("/export", auth, async (req, res) => {
    try {
        const {
            status = 'all',
            search = '',
            mlSize = '',
            itemType = ''
        } = req.query;

        console.log(`📊 Export Bottles Inventory - Status: ${status}, Search: ${search}, ML: ${mlSize}, ItemType: ${itemType}`);

        let query = {};

        if (search && search.trim() !== '') {
            query.$or = [
                { mlSize: { $regex: search.trim(), $options: 'i' } },
                { itemType: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        if (mlSize && mlSize.trim() !== '') {
            query.mlSize = mlSize.trim();
        }

        if (itemType && itemType.trim() !== '') {
            query.itemType = itemType.trim();
        }

        const inventory = await BottlesInventory.find(query).lean();

        if (inventory.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No inventory found to export"
            });
        }

        let filteredInventory = inventory;
        if (status === 'low') {
            filteredInventory = inventory.filter(item =>
                item.quantity > 0 && item.quantity <= (item.minStock || 5)
            );
        } else if (status === 'out-of-stock') {
            filteredInventory = inventory.filter(item => item.quantity === 0);
        }

        filteredInventory.sort((a, b) => {
            if (a.mlSize !== b.mlSize) return a.mlSize.localeCompare(b.mlSize);
            return a.itemType.localeCompare(b.itemType);
        });

        const itemData = [];

        for (const item of filteredInventory) {
            const transactionDoc = await BottlesTransactions.findOne({
                mlSize: item.mlSize,
                itemType: item.itemType
            }).lean();

            let inTransactions = [];
            if (transactionDoc && transactionDoc.transactions) {
                inTransactions = transactionDoc.transactions.filter(t =>
                    t.transactionType === 'IN' &&
                    !INVOICE_RELATED_REASONS.includes(t.reason)
                );
                inTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            }

            const totalQuantity = item.quantity || 0;
            const minStock = item.minStock || 5;
            const avgPrice = item.avgPurchasePrice || 0;
            const totalCost = item.totalCost || 0;

            let stockStatus = 'Healthy';
            if (totalQuantity === 0) {
                stockStatus = 'Out of Stock';
            } else if (totalQuantity <= minStock) {
                stockStatus = 'Low Stock';
            }

            itemData.push({
                item: item,
                transactions: inTransactions,
                totalQuantity: totalQuantity,
                stockStatus: stockStatus,
                avgPrice: avgPrice,
                totalCost: totalCost
            });
        }

        const XLSX = require('xlsx');

        // ============================================
        // SHEET 1: Current Stock Summary
        // ============================================
        const summaryData = itemData.map(item => ({
            'ML Size': item.item.mlSize,
            'Item Type': item.item.itemType,
            'Quantity': Number(item.totalQuantity).toFixed(0),
            'Avg Purchase Price': `₹${Number(item.avgPrice).toFixed(2)}`,
            'Total Cost': `₹${Number(item.totalCost).toFixed(2)}`,
            'Min Stock': item.item.minStock || 5,
            'Status': item.stockStatus
        }));

        // ============================================
        // SHEET 2: Transaction History (Grouped by Item)
        // ============================================
        const transactionData = [];

        for (const item of itemData) {
            transactionData.push({
                'ML Size': item.item.mlSize,
                'Item Type': item.item.itemType,
                'Date': '',
                'Quantity': '',
                'Purchase Price': '',
                'Reason': '',
                'Added By': '',
                'Current Stock': `${Number(item.totalQuantity).toFixed(0)}`,
                'Avg Price': `₹${Number(item.avgPrice).toFixed(2)}`
            });

            if (item.transactions.length === 0) {
                transactionData.push({
                    'ML Size': '',
                    'Item Type': '',
                    'Date': 'No stock added transactions',
                    'Quantity': '',
                    'Purchase Price': '',
                    'Reason': '',
                    'Added By': '',
                    'Current Stock': '',
                    'Avg Price': ''
                });
            } else {
                for (const txn of item.transactions) {
                    const date = new Date(txn.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric'
                    });
                    const isBulk = txn.bulkUploadId && txn.bulkUploadId !== '';
                    const reasonLabel = isBulk ? 'Bulk Upload' : txn.reason || 'Manual Add';
                    const addedBy = txn.performedBy?.userName || txn.performedBy?.userEmail || 'Unknown';

                    transactionData.push({
                        'ML Size': '',
                        'Item Type': '',
                        'Date': date,
                        'Quantity': `${Number(txn.quantity || 0).toFixed(0)}`,
                        'Purchase Price': `₹${Number(txn.purchasePrice || 0).toFixed(2)}`,
                        'Reason': reasonLabel,
                        'Added By': addedBy,
                        'Current Stock': '',
                        'Avg Price': ''
                    });
                }
            }

            transactionData.push({
                'ML Size': '',
                'Item Type': '',
                'Date': '',
                'Quantity': '',
                'Purchase Price': '',
                'Reason': '',
                'Added By': '',
                'Current Stock': '',
                'Avg Price': ''
            });
        }

        // ============================================
        // CREATE EXCEL
        // ============================================
        const wb = XLSX.utils.book_new();

        const ws1 = XLSX.utils.json_to_sheet(summaryData);
        ws1['!cols'] = [
            { wch: 12 },
            { wch: 15 },
            { wch: 12 },
            { wch: 20 },
            { wch: 20 },
            { wch: 12 },
            { wch: 15 }
        ];
        XLSX.utils.book_append_sheet(wb, ws1, 'Current Stock');

        const ws2 = XLSX.utils.json_to_sheet(transactionData);
        ws2['!cols'] = [
            { wch: 12 },
            { wch: 15 },
            { wch: 14 },
            { wch: 12 },
            { wch: 18 },
            { wch: 15 },
            { wch: 20 },
            { wch: 15 },
            { wch: 18 }
        ];
        XLSX.utils.book_append_sheet(wb, ws2, 'Transaction History');

        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        const filename = `bottles_inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(buffer);

        console.log(`✅ Bottles Inventory exported: ${itemData.length} items, ${filename}`);

    } catch (error) {
        console.error("Error exporting Bottles inventory:", error);
        res.status(500).json({
            success: false,
            message: "Failed to export inventory",
            error: error.message
        });
    }
});

module.exports = router;