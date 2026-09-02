const express = require("express");
const router = express.Router();
const multer = require("multer");
const XPInventory = require("../../models/inventory/xp/xpInventory");
const XPTransactions = require("../../models/inventory/xp/xpTransactions");
const User = require("../../models/user");
const jwt = require("jsonwebtoken");
const { logSuccess, logFailed } = require("../../utils/logHelper");
const { parseExcel, downloadTemplate, downloadErrorExcel } = require("../../utils/xpExcelHelper");

// ============================================
// MULTER CONFIGURATION
// ============================================
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024
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
const MIN_STOCK_ALERT = 5;

// ✅ Invoice related reasons to exclude
const INVOICE_RELATED_REASONS = [
    'Invoice',
    'Invoice Return',
    'Invoice Deletion - Return',
    'Invoice Edit - Return',
    'Invoice Edit - New Reduction'
];

// ============================================
// HELPER: Get density based on product name
// ============================================
const getDensityForProduct = (productName) => {
    // FRAGRANCE BASE = Alcohol = 1 KG = 820 Grams/ML
    if (productName && productName.toUpperCase().trim() === "FRAGRANCE BASE") {
        return 820;
    }
    // Default for all other products: 1 KG = 1000 Grams/ML
    return 1000;
};

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
// GET ALL PRODUCTS
// ============================================
router.get("/get-all", auth, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            sortBy = 'productName',
            sortOrder = 'asc',
            status = 'all'
        } = req.query;

        let query = {};
        if (search && search.trim() !== '') {
            query.productName = { $regex: search.trim(), $options: 'i' };
        }

        // ✅ ADD STATUS FILTER
        if (status === 'low') {
            query.$expr = { $lt: ["$quantity", "$minStock"] };
            query.quantity = { $gt: 0 };
        } else if (status === 'out-of-stock') {
            query.quantity = 0;
        }

        const total = await XPInventory.countDocuments(query);
        const sortObj = {};
        sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const products = await XPInventory.find(query)
            .sort(sortObj)
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .lean();

        const totalPages = Math.ceil(total / parseInt(limit));

        res.status(200).json({
            products,
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
        console.error("Error fetching products:", error);
        res.status(500).json({
            message: "Failed to fetch products",
            error: error.message
        });
    }
});

// ============================================
// GET LOW STOCK ALERTS
// ============================================
router.get("/get-alerts", auth, async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const query = { $expr: { $lt: ["$quantity", "$minStock"] } };
        const total = await XPInventory.countDocuments(query);
        const alerts = await XPInventory.find(query)
            .sort({ quantity: 1, productName: 1 })
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
            xpId,
            productName,
            page = 1,
            limit = 50,
            transactionType,
            startDate,
            endDate,
            hideInvoice = 'false'
        } = req.query;

        let result;

        if (xpId) {
            result = await getTransactionsWithFilter(
                xpId,
                parseInt(limit),
                parseInt(page),
                hideInvoice === 'true'
            );
        } else {
            let matchConditions = {};
            if (productName) matchConditions.productName = productName;

            let transactionMatch = {};
            if (transactionType) {
                transactionMatch['transactions.transactionType'] = transactionType;
            }
            if (startDate || endDate) {
                transactionMatch['transactions.createdAt'] = {};
                if (startDate) transactionMatch['transactions.createdAt']['$gte'] = new Date(startDate);
                if (endDate) transactionMatch['transactions.createdAt']['$lte'] = new Date(endDate);
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
            pipeline.push({ $sort: { "transactions.createdAt": -1 } });

            const countPipeline = [...pipeline];
            countPipeline.push({ $count: "total" });
            const countResult = await XPTransactions.aggregate(countPipeline);
            const total = countResult[0]?.total || 0;

            pipeline.push({ $skip: (parseInt(page) - 1) * parseInt(limit) });
            pipeline.push({ $limit: parseInt(limit) });
            pipeline.push({
                $project: {
                    transactionId: "$transactions.transactionId",
                    transactionType: "$transactions.transactionType",
                    quantity: "$transactions.quantity",
                    purchasePrice: "$transactions.purchasePrice",
                    density: "$transactions.density",
                    previousStock: "$transactions.previousStock",
                    newStock: "$transactions.newStock",
                    previousTotalQuantityAdded: "$transactions.previousTotalQuantityAdded",
                    newTotalQuantityAdded: "$transactions.newTotalQuantityAdded",
                    previousTotalCost: "$transactions.previousTotalCost",
                    newTotalCost: "$transactions.newTotalCost",
                    previousAvgPrice: "$transactions.previousAvgPrice",
                    newAvgPrice: "$transactions.newAvgPrice",
                    reason: "$transactions.reason",
                    notes: "$transactions.notes",
                    performedBy: "$transactions.performedBy",
                    bulkUploadId: "$transactions.bulkUploadId",
                    createdAt: "$transactions.createdAt",
                    xpId: 1,
                    productName: 1
                }
            });

            const transactions = await XPTransactions.aggregate(pipeline);
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
// HELPER: Get transactions with filter for single product
// ============================================
const getTransactionsWithFilter = async (xpId, limit, page, hideInvoice) => {
    const doc = await XPTransactions.findOne({ xpId }).lean();
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
// CREATE PRODUCT - UPDATED WITH SELLING PRICES
// ============================================
router.post("/create-product", auth, checkInventoryPermission, async (req, res) => {
    try {
        const { productName, sellingPrice3ml, sellingPrice6ml } = req.body;

        if (!productName || productName.trim() === '') {
            await logFailed({
                module: 'XP Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create Product',
                heading: 'Product Creation Failed',
                description: 'Product name is required'
            });
            return res.status(400).json({
                message: "Product name is required"
            });
        }

        const nameTrim = productName.trim();

        const exists = await XPInventory.productExists(nameTrim);
        if (exists) {
            await logFailed({
                module: 'XP Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create Product',
                heading: 'Product Creation Failed',
                description: `Product "${nameTrim}" already exists`
            });
            return res.status(400).json({
                message: `Product "${nameTrim}" already exists`
            });
        }

        const density = getDensityForProduct(nameTrim);

        const product = new XPInventory({
            productName: nameTrim,
            quantity: 0,
            totalQuantityAdded: 0,
            totalCost: 0,
            avgPurchasePrice: 0,
            minStock: MIN_STOCK_ALERT,
            density: density,
            // ✅ NEW: Selling prices
            sellingPrice3ml: sellingPrice3ml !== undefined ? parseFloat(sellingPrice3ml) : 0,
            sellingPrice6ml: sellingPrice6ml !== undefined ? parseFloat(sellingPrice6ml) : 0,
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
        });

        await product.save();

        await XPTransactions.create({
            xpId: product.xpId,
            productName: nameTrim,
            transactions: []
        });

        await logSuccess({
            module: 'XP Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Create Product',
            heading: 'Product Created Successfully',
            description: `Product "${nameTrim}" created with density ${density}, sellingPrice3ml: ${product.sellingPrice3ml}, sellingPrice6ml: ${product.sellingPrice6ml}`
        });

        res.status(201).json({
            message: "Product created successfully",
            product: product.toObject()
        });

    } catch (error) {
        console.error("Error creating product:", error);
        await logFailed({
            module: 'XP Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Create Product',
            heading: 'Product Creation Failed',
            description: error.message || 'Unknown error occurred'
        });
        if (error.code === 11000) {
            return res.status(400).json({
                message: "Product with this name already exists"
            });
        }
        res.status(500).json({
            message: "Failed to create product",
            error: error.message
        });
    }
});

// ============================================
// ADD STOCK (Qty + Price)
// ============================================
router.post("/add-stock", auth, checkInventoryPermission, async (req, res) => {
    try {
        const { productName, quantity, purchasePrice, notes } = req.body;

        if (!productName || productName.trim() === '') {
            await logFailed({
                module: 'XP Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Add Stock',
                heading: 'Add Stock Failed',
                description: 'Product name is required'
            });
            return res.status(400).json({
                message: "Product name is required"
            });
        }

        if (!quantity || parseFloat(quantity) <= 0) {
            await logFailed({
                module: 'XP Inventory',
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

        if (!purchasePrice || parseFloat(purchasePrice) < 0) {
            await logFailed({
                module: 'XP Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Add Stock',
                heading: 'Add Stock Failed',
                description: 'Purchase price is required'
            });
            return res.status(400).json({
                message: "Purchase price is required"
            });
        }

        const nameTrim = productName.trim();
        const qty = parseFloat(quantity);
        const price = parseFloat(purchasePrice);

        const product = await XPInventory.getProduct(nameTrim);
        if (!product) {
            await logFailed({
                module: 'XP Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Add Stock',
                heading: 'Add Stock Failed',
                description: `Product "${nameTrim}" not found`
            });
            return res.status(404).json({
                message: `Product "${nameTrim}" not found`
            });
        }

        const density = product.density || 1000;

        const oldQuantity = product.quantity;
        const oldTotalQuantityAdded = product.totalQuantityAdded;
        const oldTotalCost = product.totalCost;
        const oldAvgPrice = product.avgPurchasePrice;

        const newTotalQuantityAdded = oldTotalQuantityAdded + qty;
        const newTotalCost = oldTotalCost + (qty * price);
        const newAvgPrice = newTotalCost / newTotalQuantityAdded;
        const newQuantity = oldQuantity + qty;

        product.quantity = newQuantity;
        product.totalQuantityAdded = newTotalQuantityAdded;
        product.totalCost = newTotalCost;
        product.avgPurchasePrice = newAvgPrice;
        product.updatedBy = {
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email
        };

        await product.save();

        const transactionData = {
            transactionType: 'IN',
            quantity: qty,
            purchasePrice: price,
            density: density,
            previousStock: oldQuantity,
            newStock: newQuantity,
            previousTotalQuantityAdded: oldTotalQuantityAdded,
            newTotalQuantityAdded: newTotalQuantityAdded,
            previousTotalCost: oldTotalCost,
            newTotalCost: newTotalCost,
            previousAvgPrice: oldAvgPrice,
            newAvgPrice: newAvgPrice,
            reason: 'Purchase',
            notes: notes || '',
            performedBy: {
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email
            }
        };

        let xpTransactionDoc = await XPTransactions.findOne({ xpId: product.xpId });

        if (!xpTransactionDoc) {
            xpTransactionDoc = await XPTransactions.create({
                xpId: product.xpId,
                productName: nameTrim,
                transactions: []
            });
        }

        await XPTransactions.addTransaction(product.xpId, transactionData);

        await logSuccess({
            module: 'XP Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Add Stock',
            heading: 'Stock Added Successfully',
            description: `Added ${qty} KG of "${nameTrim}" at ₹${price}/KG (density: ${density})`
        });

        res.status(200).json({
            message: "Stock added successfully",
            product: product.toObject()
        });

    } catch (error) {
        console.error("Error adding stock:", error);
        await logFailed({
            module: 'XP Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Add Stock',
            heading: 'Add Stock Failed',
            description: error.message || 'Unknown error occurred'
        });
        res.status(500).json({
            message: "Failed to add stock",
            error: error.message
        });
    }
});

// ============================================
// UPDATE PRODUCT - UPDATED WITH SELLING PRICES
// ============================================
router.put("/update/:xpId", auth, checkInventoryPermission, async (req, res) => {
    try {
        const { xpId } = req.params;
        const { productName, sellingPrice3ml, sellingPrice6ml } = req.body;

        const product = await XPInventory.findOne({ xpId });
        if (!product) {
            await logFailed({
                module: 'XP Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Update Product',
                heading: 'Product Update Failed',
                description: 'Product not found'
            });
            return res.status(404).json({
                message: "Product not found"
            });
        }

        if (!productName || productName.trim() === '') {
            await logFailed({
                module: 'XP Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Update Product',
                heading: 'Product Update Failed',
                description: 'Product name is required'
            });
            return res.status(400).json({
                message: "Product name is required"
            });
        }

        const nameTrim = productName.trim();

        const exists = await XPInventory.findOne({
            productName: nameTrim,
            xpId: { $ne: xpId }
        });
        if (exists) {
            await logFailed({
                module: 'XP Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Update Product',
                heading: 'Product Update Failed',
                description: `Product "${nameTrim}" already exists`
            });
            return res.status(400).json({
                message: `Product "${nameTrim}" already exists`
            });
        }

        const density = getDensityForProduct(nameTrim);

        const updateData = {
            productName: nameTrim,
            density: density,
            updatedBy: {
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email
            }
        };

        // ✅ NEW: Update selling prices if provided
        if (sellingPrice3ml !== undefined) {
            updateData.sellingPrice3ml = parseFloat(sellingPrice3ml);
        }
        if (sellingPrice6ml !== undefined) {
            updateData.sellingPrice6ml = parseFloat(sellingPrice6ml);
        }

        const updatedProduct = await XPInventory.findOneAndUpdate(
            { xpId },
            updateData,
            { new: true, runValidators: true }
        );

        await logSuccess({
            module: 'XP Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Update Product',
            heading: 'Product Updated Successfully',
            description: `Name changed to "${nameTrim}" with density ${density}, sellingPrice3ml: ${updatedProduct.sellingPrice3ml}, sellingPrice6ml: ${updatedProduct.sellingPrice6ml}`
        });

        res.status(200).json({
            message: "Product updated successfully",
            product: updatedProduct.toObject()
        });

    } catch (error) {
        console.error("Error updating product:", error);
        await logFailed({
            module: 'XP Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Update Product',
            heading: 'Product Update Failed',
            description: error.message || 'Unknown error occurred'
        });
        if (error.code === 11000) {
            return res.status(400).json({
                message: "Product with this name already exists"
            });
        }
        res.status(500).json({
            message: "Failed to update product",
            error: error.message
        });
    }
});

// ============================================
// DELETE PRODUCT
// ============================================
router.delete("/delete/:xpId", auth, checkInventoryPermission, async (req, res) => {
    try {
        const { xpId } = req.params;

        const product = await XPInventory.findOne({ xpId });
        if (!product) {
            await logFailed({
                module: 'XP Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Delete Product',
                heading: 'Product Deletion Failed',
                description: 'Product not found'
            });
            return res.status(404).json({
                message: "Product not found"
            });
        }

        await XPTransactions.findOneAndDelete({ xpId });
        await XPInventory.findOneAndDelete({ xpId });

        await logSuccess({
            module: 'XP Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Delete Product',
            heading: 'Product Deleted Successfully',
            description: `Product "${product.productName}" deleted along with all transactions`
        });

        res.status(200).json({
            message: "Product deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting product:", error);
        await logFailed({
            module: 'XP Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Delete Product',
            heading: 'Product Deletion Failed',
            description: error.message || 'Unknown error occurred'
        });
        res.status(500).json({
            message: "Failed to delete product",
            error: error.message
        });
    }
});

// ============================================
// BULK UPLOAD - PRODUCTS (Name + Selling Prices) - WITH AUDIT
// ============================================
router.post("/bulk-upload-products", auth, checkInventoryPermission, upload.single('file'), async (req, res) => {
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

        const result = await parseExcel(file, 'products');

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
                const { productName, sellingPrice3ml, sellingPrice6ml } = row;

                if (!productName || productName.trim() === '') {
                    errors.push({ row: rowNumber, productName, error: 'Product name is required' });
                    continue;
                }

                const nameTrim = productName.trim();

                const exists = await XPInventory.productExists(nameTrim);
                if (exists) {
                    errors.push({ row: rowNumber, productName: nameTrim, error: 'Product already exists' });
                    continue;
                }

                const density = getDensityForProduct(nameTrim);

                const product = new XPInventory({
                    productName: nameTrim,
                    quantity: 0,
                    totalQuantityAdded: 0,
                    totalCost: 0,
                    avgPurchasePrice: 0,
                    minStock: MIN_STOCK_ALERT,
                    density: density,
                    // ✅ NEW: Selling prices from Excel
                    sellingPrice3ml: sellingPrice3ml !== undefined && sellingPrice3ml !== '' ? parseFloat(sellingPrice3ml) : 0,
                    sellingPrice6ml: sellingPrice6ml !== undefined && sellingPrice6ml !== '' ? parseFloat(sellingPrice6ml) : 0,
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
                });

                await product.save();

                await XPTransactions.create({
                    xpId: product.xpId,
                    productName: nameTrim,
                    transactions: []
                });

                success.push({
                    row: rowNumber,
                    productName: nameTrim,
                    density: density,
                    sellingPrice3ml: product.sellingPrice3ml,
                    sellingPrice6ml: product.sellingPrice6ml
                });

            } catch (error) {
                errors.push({
                    row: rowNumber,
                    productName: row.productName,
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
        // CREATE AUDIT FILE
        // ============================================
        const { createAuditFile } = require("../../utils/auditHelper");

        const successData = success.map(item => ({
            'Row': item.row || 'N/A',
            'Product Name': item.productName || 'N/A',
            'Density': item.density || 1000,
            'Selling Price 3ml': item.sellingPrice3ml || 0,
            'Selling Price 6ml': item.sellingPrice6ml || 0,
            'Status': '✅ Added'
        }));

        const failedData = errors.map(item => ({
            'Row': item.row || 'N/A',
            'Product Name': item.productName || 'N/A',
            'Error Reason': item.error || 'Unknown error'
        }));

        const summary = {
            uploadDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            category: 'XP Oil - Products',
            uploadedBy: req.user.name || req.user.userName || 'Unknown',
            fileName: req.file.originalname,
            totalRows: result.total || originalData.length,
            successCount: success.length,
            failedCount: errors.length
        };

        const auditResult = await createAuditFile('xp', {
            originalData: originalData.length > 0 ? originalData : [{ 'Message': 'No original data available' }],
            successData: successData.length > 0 ? successData : [{ 'Message': 'No successful records' }],
            failedData: failedData.length > 0 ? failedData : [{ 'Message': 'No failed records' }],
            summary: summary,
            fileName: req.file.originalname,
            uploadedBy: req.user.name || req.user.userName
        });

        if (auditResult.success) {
            console.log(`✅ Product Audit file created: ${auditResult.auditFileName}`);
        } else {
            console.log(`⚠️ Product Audit file creation failed: ${auditResult.error}`);
        }

        if (success.length > 0) {
            await logSuccess({
                module: 'XP Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Bulk Upload Products',
                heading: 'Bulk Product Upload Completed',
                description: `${success.length} products added successfully, ${errors.length} failed. Audit: ${auditResult.success ? auditResult.auditFileName : 'Failed'}`
            });
        }

        if (errors.length > 0) {
            await logFailed({
                module: 'XP Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Bulk Upload Products',
                heading: 'Bulk Product Upload Partial Failure',
                description: `${errors.length} rows failed out of ${result.total}`
            });
        }

        res.status(200).json({
            message: `Bulk product upload completed. ${success.length} added, ${errors.length} failed.`,
            success: { count: success.length, details: success },
            errors: { count: errors.length, details: errors },
            bulkUploadId,
            audit: {
                created: auditResult.success,
                fileName: auditResult.auditFileName || null,
                filePath: auditResult.auditFilePath || null
            }
        });

    } catch (error) {
        console.error("Error in bulk product upload:", error);
        await logFailed({
            module: 'XP Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Bulk Upload Products',
            heading: 'Bulk Product Upload Failed',
            description: error.message || 'Unknown error occurred'
        });
        res.status(500).json({
            message: "Bulk product upload failed",
            error: error.message
        });
    }
});

// ============================================
// BULK UPLOAD - INVENTORY (Name + Qty + Price) - WITH AUDIT
// FIXED: Changed parseInt to parseFloat for decimal support
// ============================================
router.post("/bulk-upload-inventory", auth, checkInventoryPermission, upload.single('file'), async (req, res) => {
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

        const result = await parseExcel(file, 'inventory');

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
                const { productName, quantity, purchasePrice } = row;

                if (!productName || productName.trim() === '') {
                    errors.push({ row: rowNumber, productName, quantity, purchasePrice, error: 'Product name is required' });
                    continue;
                }

                if (!quantity || parseFloat(quantity) <= 0) {
                    errors.push({ row: rowNumber, productName, quantity, purchasePrice, error: 'Quantity must be greater than 0' });
                    continue;
                }

                if (!purchasePrice || parseFloat(purchasePrice) < 0) {
                    errors.push({ row: rowNumber, productName, quantity, purchasePrice, error: 'Purchase price must be greater than 0' });
                    continue;
                }

                const nameTrim = productName.trim();
                const qty = parseFloat(quantity);
                const price = parseFloat(purchasePrice);

                const product = await XPInventory.getProduct(nameTrim);
                if (!product) {
                    errors.push({ row: rowNumber, productName: nameTrim, quantity: qty, purchasePrice: price, error: 'Product not found' });
                    continue;
                }

                const density = product.density || 1000;

                const oldQuantity = product.quantity;
                const oldTotalQuantityAdded = product.totalQuantityAdded;
                const oldTotalCost = product.totalCost;
                const oldAvgPrice = product.avgPurchasePrice;

                const newTotalQuantityAdded = oldTotalQuantityAdded + qty;
                const newTotalCost = oldTotalCost + (qty * price);
                const newAvgPrice = newTotalCost / newTotalQuantityAdded;
                const newQuantity = oldQuantity + qty;

                product.quantity = newQuantity;
                product.totalQuantityAdded = newTotalQuantityAdded;
                product.totalCost = newTotalCost;
                product.avgPurchasePrice = newAvgPrice;
                product.updatedBy = {
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email
                };

                await product.save();

                const transactionData = {
                    transactionType: 'IN',
                    quantity: qty,
                    purchasePrice: price,
                    density: density,
                    previousStock: oldQuantity,
                    newStock: newQuantity,
                    previousTotalQuantityAdded: oldTotalQuantityAdded,
                    newTotalQuantityAdded: newTotalQuantityAdded,
                    previousTotalCost: oldTotalCost,
                    newTotalCost: newTotalCost,
                    previousAvgPrice: oldAvgPrice,
                    newAvgPrice: newAvgPrice,
                    reason: 'Purchase',
                    notes: 'Bulk upload',
                    performedBy: {
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email
                    },
                    bulkUploadId: bulkUploadId
                };

                let xpTransactionDoc = await XPTransactions.findOne({ xpId: product.xpId });

                if (!xpTransactionDoc) {
                    xpTransactionDoc = await XPTransactions.create({
                        xpId: product.xpId,
                        productName: nameTrim,
                        transactions: []
                    });
                }

                await XPTransactions.addTransaction(product.xpId, transactionData);

                success.push({
                    row: rowNumber,
                    productName: nameTrim,
                    quantity: qty,
                    purchasePrice: price,
                    newStock: newQuantity,
                    newAvgPrice: newAvgPrice
                });

            } catch (error) {
                errors.push({
                    row: rowNumber,
                    productName: row.productName,
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
        // CREATE AUDIT FILE
        // ============================================
        const { createAuditFile } = require("../../utils/auditHelper");

        const successData = success.map(item => ({
            'Row': item.row || 'N/A',
            'Product Name': item.productName || 'N/A',
            'Quantity': item.quantity || 0,
            'Purchase Price': item.purchasePrice || 0,
            'New Stock': item.newStock || 0,
            'New Avg Price': item.newAvgPrice || 0,
            'Status': '✅ Added'
        }));

        const failedData = errors.map(item => ({
            'Row': item.row || 'N/A',
            'Product Name': item.productName || 'N/A',
            'Quantity': item.quantity || 'N/A',
            'Purchase Price': item.purchasePrice || 'N/A',
            'Error Reason': item.error || 'Unknown error'
        }));

        const summary = {
            uploadDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            category: 'XP Oil',
            uploadedBy: req.user.name || req.user.userName || 'Unknown',
            fileName: req.file.originalname,
            totalRows: result.total || originalData.length,
            successCount: success.length,
            failedCount: errors.length
        };

        const auditResult = await createAuditFile('xp', {
            originalData: originalData.length > 0 ? originalData : [{ 'Message': 'No original data available' }],
            successData: successData.length > 0 ? successData : [{ 'Message': 'No successful records' }],
            failedData: failedData.length > 0 ? failedData : [{ 'Message': 'No failed records' }],
            summary: summary,
            fileName: req.file.originalname,
            uploadedBy: req.user.name || req.user.userName
        });

        if (auditResult.success) {
            console.log(`✅ Audit file created: ${auditResult.auditFileName}`);
        } else {
            console.log(`⚠️ Audit file creation failed: ${auditResult.error}`);
        }

        if (success.length > 0) {
            await logSuccess({
                module: 'XP Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Bulk Upload Inventory',
                heading: 'Bulk Inventory Upload Completed',
                description: `${success.length} inventory items added successfully, ${errors.length} failed. Audit: ${auditResult.success ? auditResult.auditFileName : 'Failed'}`
            });
        }

        if (errors.length > 0) {
            await logFailed({
                module: 'XP Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Bulk Upload Inventory',
                heading: 'Bulk Inventory Upload Partial Failure',
                description: `${errors.length} rows failed out of ${result.total}`
            });
        }

        res.status(200).json({
            message: `Bulk inventory upload completed. ${success.length} added, ${errors.length} failed.`,
            success: { count: success.length, details: success },
            errors: { count: errors.length, details: errors },
            bulkUploadId: bulkUploadId,
            audit: {
                created: auditResult.success,
                fileName: auditResult.auditFileName || null,
                filePath: auditResult.auditFilePath || null
            }
        });

    } catch (error) {
        console.error("Error in bulk inventory upload:", error);
        await logFailed({
            module: 'XP Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Bulk Upload Inventory',
            heading: 'Bulk Inventory Upload Failed',
            description: error.message || 'Unknown error occurred'
        });
        res.status(500).json({
            message: "Bulk inventory upload failed",
            error: error.message
        });
    }
});

// ============================================
// DOWNLOAD EXCEL TEMPLATE
// ============================================
router.get("/download-template/:type", auth, async (req, res) => {
    try {
        downloadTemplate(res, req.params.type);
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
        const transactions = await XPTransactions.find({ bulkUploadId });

        if (transactions.length === 0) {
            return res.status(404).json({
                message: "No errors found for this bulk upload"
            });
        }

        downloadErrorExcel(transactions, res);
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
            search = ''
        } = req.query;

        console.log(`📊 Export XP Inventory - Status: ${status}, Search: ${search}`);

        let query = {};

        if (search && search.trim() !== '') {
            query.productName = { $regex: search.trim(), $options: 'i' };
        }

        const products = await XPInventory.find(query).lean();
        console.log(`📦 Found ${products.length} products`);

        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No products found to export"
            });
        }

        let filteredProducts = products;

        if (status === 'low') {
            filteredProducts = products.filter(p =>
                p.quantity > 0 && p.quantity <= (p.minStock || 5)
            );
        } else if (status === 'out-of-stock') {
            filteredProducts = products.filter(p => p.quantity === 0);
        }

        console.log(`📊 After status filter: ${filteredProducts.length} products`);

        const productData = [];

        for (const product of filteredProducts) {
            const transactionDoc = await XPTransactions.findOne({ xpId: product.xpId }).lean();

            let inTransactions = [];
            if (transactionDoc && transactionDoc.transactions) {
                inTransactions = transactionDoc.transactions.filter(t =>
                    t.transactionType === 'IN' &&
                    !INVOICE_RELATED_REASONS.includes(t.reason)
                );
                inTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            }

            const totalQuantity = product.quantity || 0;
            const totalCost = product.totalCost || 0;
            const avgPrice = product.avgPurchasePrice || 0;
            const minStock = product.minStock || 5;

            let stockStatus = 'Healthy';
            if (totalQuantity === 0) {
                stockStatus = 'Out of Stock';
            } else if (totalQuantity <= minStock) {
                stockStatus = 'Low Stock';
            }

            productData.push({
                product: product,
                transactions: inTransactions,
                totalQuantity: totalQuantity,
                totalCost: totalCost,
                avgPrice: avgPrice,
                stockStatus: stockStatus,
                density: product.density || 1000
            });
        }

        productData.sort((a, b) => a.product.productName.localeCompare(b.product.productName));

        const XLSX = require('xlsx');

        // ============================================
        // SHEET 1: Product Summary - WITH SELLING PRICES
        // ============================================
        const summaryData = productData.map(item => ({
            'Product Name': item.product.productName,
            'Category': 'XP Oil',
            'Total Quantity (KG)': Number(item.totalQuantity).toFixed(4),
            'Total Purchase Cost': `₹${Number(item.totalCost).toFixed(2)}`,
            'Avg Purchase Price': `₹${Number(item.avgPrice).toFixed(2)}`,
            'Selling Price 3ml': `₹${Number(item.product.sellingPrice3ml || 0).toFixed(2)}`,
            'Selling Price 6ml': `₹${Number(item.product.sellingPrice6ml || 0).toFixed(2)}`,
            'Min Stock': item.product.minStock || 5,
            'Status': item.stockStatus,
            'Density': item.density || 1000
        }));

        // ============================================
        // SHEET 2: Transaction History (Grouped by Product)
        // ============================================
        const transactionData = [];

        for (const item of productData) {
            transactionData.push({
                'Product': item.product.productName,
                'Category': 'XP Oil',
                'Date': '',
                'Quantity': '',
                'Price/Unit': '',
                'Total Cost': '',
                'Reason': '',
                'Added By': '',
                'Current Stock': `${Number(item.totalQuantity).toFixed(4)} KG`
            });

            if (item.transactions.length === 0) {
                transactionData.push({
                    'Product': '',
                    'Category': '',
                    'Date': 'No stock added transactions',
                    'Quantity': '',
                    'Price/Unit': '',
                    'Total Cost': '',
                    'Reason': '',
                    'Added By': '',
                    'Current Stock': ''
                });
            } else {
                for (const txn of item.transactions) {
                    const date = new Date(txn.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                    });
                    const totalCost = (txn.quantity || 0) * (txn.purchasePrice || 0);
                    const isBulk = txn.bulkUploadId && txn.bulkUploadId !== '';
                    const reasonLabel = isBulk ? 'Bulk Upload' : txn.reason || 'Manual Add';
                    const addedBy = txn.performedBy?.userName || txn.performedBy?.userEmail || 'Unknown';

                    transactionData.push({
                        'Product': '',
                        'Category': '',
                        'Date': date,
                        'Quantity': `${Number(txn.quantity || 0).toFixed(4)} KG`,
                        'Price/Unit': `₹${Number(txn.purchasePrice || 0).toFixed(2)}`,
                        'Total Cost': `₹${Number(totalCost).toFixed(2)}`,
                        'Reason': reasonLabel,
                        'Added By': addedBy,
                        'Current Stock': ''
                    });
                }
            }

            transactionData.push({
                'Product': '',
                'Category': '',
                'Date': '',
                'Quantity': '',
                'Price/Unit': '',
                'Total Cost': '',
                'Reason': '',
                'Added By': '',
                'Current Stock': ''
            });
        }

        // ============================================
        // STEP 5: Generate Excel
        // ============================================
        const wb = XLSX.utils.book_new();

        const ws1 = XLSX.utils.json_to_sheet(summaryData);
        ws1['!cols'] = [
            { wch: 40 },
            { wch: 12 },
            { wch: 18 },
            { wch: 20 },
            { wch: 20 },
            { wch: 20 },
            { wch: 20 },
            { wch: 12 },
            { wch: 15 },
            { wch: 12 }
        ];
        XLSX.utils.book_append_sheet(wb, ws1, 'Product Summary');

        const ws2 = XLSX.utils.json_to_sheet(transactionData);
        ws2['!cols'] = [
            { wch: 35 },
            { wch: 12 },
            { wch: 14 },
            { wch: 15 },
            { wch: 15 },
            { wch: 18 },
            { wch: 15 },
            { wch: 20 },
            { wch: 18 }
        ];
        XLSX.utils.book_append_sheet(wb, ws2, 'Transaction History');

        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

        const filename = `xp_inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(buffer);

        console.log(`✅ XP Inventory exported: ${productData.length} products, ${filename}`);

    } catch (error) {
        console.error("Error exporting XP inventory:", error);
        res.status(500).json({
            success: false,
            message: "Failed to export inventory",
            error: error.message
        });
    }
});

module.exports = router;