const express = require("express");
const router = express.Router();
const multer = require("multer");
const DispenserInventory = require("../../models/inventory/dispenser/dispenserInventory");
const DispenserTransactions = require("../../models/inventory/dispenser/dispenserTransactions");
const User = require("../../models/user");
const jwt = require("jsonwebtoken");
const { logSuccess, logFailed } = require("../../utils/logHelper");
const { parseExcel, downloadTemplate, downloadErrorExcel } = require("../../utils/dispenserExcelHelper");

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
            sortOrder = 'asc'
        } = req.query;

        let query = {};
        if (search && search.trim() !== '') {
            query.productName = { $regex: search.trim(), $options: 'i' };
        }

        const total = await DispenserInventory.countDocuments(query);
        const sortObj = {};
        sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const products = await DispenserInventory.find(query)
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
        const total = await DispenserInventory.countDocuments(query);
        const alerts = await DispenserInventory.find(query)
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
            dispenserId,
            productName,
            page = 1,
            limit = 50,
            transactionType,
            startDate,
            endDate,
            hideInvoice = 'false'  // ✅ NEW: Filter out invoice transactions
        } = req.query;

        let result;

        if (dispenserId) {
            // ✅ For single product - fetch with filter
            result = await getTransactionsWithFilter(
                dispenserId,
                parseInt(limit),
                parseInt(page),
                hideInvoice === 'true'
            );
        } else {
            // ✅ For all products - fetch with filter
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

            // ✅ If hideInvoice is true, exclude invoice related transactions
            if (hideInvoice === 'true') {
                transactionMatch['transactions.reason'] = { $nin: INVOICE_RELATED_REASONS };
                // ✅ Also only show IN transactions
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
            const countResult = await DispenserTransactions.aggregate(countPipeline);
            const total = countResult[0]?.total || 0;

            pipeline.push({ $skip: (parseInt(page) - 1) * parseInt(limit) });
            pipeline.push({ $limit: parseInt(limit) });
            pipeline.push({
                $project: {
                    transactionId: "$transactions.transactionId",
                    transactionType: "$transactions.transactionType",
                    quantity: "$transactions.quantity",
                    purchasePrice: "$transactions.purchasePrice",
                    sellingPrice3ml: "$transactions.sellingPrice3ml",
                    sellingPrice6ml: "$transactions.sellingPrice6ml",
                    discount: "$transactions.discount",
                    previousStock: "$transactions.previousStock",
                    newStock: "$transactions.newStock",
                    previousTotalQuantityAdded: "$transactions.previousTotalQuantityAdded",
                    newTotalQuantityAdded: "$transactions.newTotalQuantityAdded",
                    previousTotalPurchaseCost: "$transactions.previousTotalPurchaseCost",
                    newTotalPurchaseCost: "$transactions.newTotalPurchaseCost",
                    previousAvgPurchasePrice: "$transactions.previousAvgPurchasePrice",
                    newAvgPurchasePrice: "$transactions.newAvgPurchasePrice",
                    reason: "$transactions.reason",
                    notes: "$transactions.notes",
                    performedBy: "$transactions.performedBy",
                    bulkUploadId: "$transactions.bulkUploadId",
                    createdAt: "$transactions.createdAt",
                    dispenserId: 1,
                    productName: 1
                }
            });

            const transactions = await DispenserTransactions.aggregate(pipeline);
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
// ✅ HELPER: Get transactions with filter for single product
// ============================================
const getTransactionsWithFilter = async (dispenserId, limit, page, hideInvoice) => {
    const doc = await DispenserTransactions.findOne({ dispenserId }).lean();
    if (!doc) return { transactions: [], total: 0, page, limit, totalPages: 0 };

    let transactions = doc.transactions || [];

    // ✅ Apply filters
    if (hideInvoice) {
        transactions = transactions.filter(t => {
            // Only IN transactions
            if (t.transactionType !== 'IN') return false;
            // Exclude invoice related reasons
            return !INVOICE_RELATED_REASONS.includes(t.reason);
        });
    }

    // Sort by createdAt descending
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
// CREATE PRODUCT (Name + Selling Prices + Discount)
// ============================================
router.post("/create-product", auth, checkInventoryPermission, async (req, res) => {
    try {
        const { productName, sellingPrice3ml, sellingPrice6ml, discount } = req.body;

        if (!productName || productName.trim() === '') {
            await logFailed({
                module: 'Dispenser Inventory',
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

        if (!sellingPrice3ml || parseFloat(sellingPrice3ml) < 0) {
            await logFailed({
                module: 'Dispenser Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create Product',
                heading: 'Product Creation Failed',
                description: '3ml selling price is required'
            });
            return res.status(400).json({
                message: "3ml selling price is required"
            });
        }

        if (!sellingPrice6ml || parseFloat(sellingPrice6ml) < 0) {
            await logFailed({
                module: 'Dispenser Inventory',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create Product',
                heading: 'Product Creation Failed',
                description: '6ml selling price is required'
            });
            return res.status(400).json({
                message: "6ml selling price is required"
            });
        }

        let discountValue = 0;
        if (discount !== undefined) {
            discountValue = parseFloat(discount);
            if (discountValue < 0 || discountValue > 100) {
                await logFailed({
                    module: 'Dispenser Inventory',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create Product',
                    heading: 'Product Creation Failed',
                    description: 'Discount must be between 0 and 100'
                });
                return res.status(400).json({
                    message: "Discount must be between 0 and 100"
                });
            }
        }

        const nameTrim = productName.trim();
        const price3ml = parseFloat(sellingPrice3ml);
        const price6ml = parseFloat(sellingPrice6ml);

        const exists = await DispenserInventory.productExists(nameTrim);
        if (exists) {
            await logFailed({
                module: 'Dispenser Inventory',
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

        const product = new DispenserInventory({
            productName: nameTrim,
            quantity: 0,
            totalQuantityAdded: 0,
            totalPurchaseCost: 0,
            avgPurchasePrice: 0,
            sellingPrice3ml: price3ml,
            sellingPrice6ml: price6ml,
            discount: discountValue,
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
        });

        await product.save();

        await DispenserTransactions.create({
            dispenserId: product.dispenserId,
            productName: nameTrim,
            sellingPrice3ml: price3ml,
            sellingPrice6ml: price6ml,
            discount: discountValue,
            transactions: []
        });

        await logSuccess({
            module: 'Dispenser Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Create Product',
            heading: 'Product Created Successfully',
            description: `Product "${nameTrim}" created with 3ml price ₹${price3ml}/KG and 6ml price ₹${price6ml}/KG`
        });

        res.status(201).json({
            message: "Product created successfully",
            product: product.toObject()
        });

    } catch (error) {
        console.error("Error creating product:", error);
        await logFailed({
            module: 'Dispenser Inventory',
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
// ADD STOCK
// ============================================
router.post("/add-stock", auth, checkInventoryPermission, async (req, res) => {
    try {
        const { productName, quantity, purchasePrice, notes } = req.body;

        if (!productName || productName.trim() === '') {
            await logFailed({
                module: 'Dispenser Inventory',
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
                module: 'Dispenser Inventory',
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
                module: 'Dispenser Inventory',
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

        const product = await DispenserInventory.getProduct(nameTrim);
        if (!product) {
            await logFailed({
                module: 'Dispenser Inventory',
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

        const oldQuantity = product.quantity;
        const oldTotalQuantityAdded = product.totalQuantityAdded;
        const oldTotalPurchaseCost = product.totalPurchaseCost;
        const oldAvgPurchasePrice = product.avgPurchasePrice;
        const sellingPrice3ml = product.sellingPrice3ml;
        const sellingPrice6ml = product.sellingPrice6ml;
        const discount = product.discount;

        const newTotalQuantityAdded = oldTotalQuantityAdded + qty;
        const newTotalPurchaseCost = oldTotalPurchaseCost + (qty * price);
        const newAvgPurchasePrice = newTotalPurchaseCost / newTotalQuantityAdded;
        const newQuantity = oldQuantity + qty;

        product.quantity = newQuantity;
        product.totalQuantityAdded = newTotalQuantityAdded;
        product.totalPurchaseCost = newTotalPurchaseCost;
        product.avgPurchasePrice = newAvgPurchasePrice;
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
            sellingPrice3ml: sellingPrice3ml,
            sellingPrice6ml: sellingPrice6ml,
            discount: discount,
            previousStock: oldQuantity,
            newStock: newQuantity,
            previousTotalQuantityAdded: oldTotalQuantityAdded,
            newTotalQuantityAdded: newTotalQuantityAdded,
            previousTotalPurchaseCost: oldTotalPurchaseCost,
            newTotalPurchaseCost: newTotalPurchaseCost,
            previousAvgPurchasePrice: oldAvgPurchasePrice,
            newAvgPurchasePrice: newAvgPurchasePrice,
            reason: 'Purchase',
            notes: notes || '',
            performedBy: {
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email
            }
        };

        await DispenserTransactions.addTransaction(product.dispenserId, transactionData);

        await logSuccess({
            module: 'Dispenser Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Add Stock',
            heading: 'Stock Added Successfully',
            description: `Added ${qty} KG of "${nameTrim}" at ₹${price}/KG`
        });

        res.status(200).json({
            message: "Stock added successfully",
            product: product.toObject()
        });

    } catch (error) {
        console.error("Error adding stock:", error);
        await logFailed({
            module: 'Dispenser Inventory',
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
// UPDATE PRODUCT
// ============================================
router.put("/update/:dispenserId", auth, checkInventoryPermission, async (req, res) => {
    try {
        const { dispenserId } = req.params;
        const { productName, sellingPrice3ml, sellingPrice6ml, discount } = req.body;

        const product = await DispenserInventory.findOne({ dispenserId });
        if (!product) {
            await logFailed({
                module: 'Dispenser Inventory',
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

        const updateData = {};
        let updateDescription = '';

        if (productName && productName.trim() !== '') {
            const nameTrim = productName.trim();
            const exists = await DispenserInventory.findOne({
                productName: nameTrim,
                dispenserId: { $ne: dispenserId }
            });
            if (exists) {
                await logFailed({
                    module: 'Dispenser Inventory',
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
            updateData.productName = nameTrim;
            updateDescription += `Name changed to "${nameTrim}"`;
        }

        if (sellingPrice3ml !== undefined) {
            if (parseFloat(sellingPrice3ml) < 0) {
                await logFailed({
                    module: 'Dispenser Inventory',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update Product',
                    heading: 'Product Update Failed',
                    description: '3ml selling price cannot be negative'
                });
                return res.status(400).json({
                    message: "3ml selling price cannot be negative"
                });
            }
            updateData.sellingPrice3ml = parseFloat(sellingPrice3ml);
            updateDescription += updateDescription ? `, 3ml price updated to ₹${parseFloat(sellingPrice3ml)}` : `3ml price updated to ₹${parseFloat(sellingPrice3ml)}`;
        }

        if (sellingPrice6ml !== undefined) {
            if (parseFloat(sellingPrice6ml) < 0) {
                await logFailed({
                    module: 'Dispenser Inventory',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update Product',
                    heading: 'Product Update Failed',
                    description: '6ml selling price cannot be negative'
                });
                return res.status(400).json({
                    message: "6ml selling price cannot be negative"
                });
            }
            updateData.sellingPrice6ml = parseFloat(sellingPrice6ml);
            updateDescription += updateDescription ? `, 6ml price updated to ₹${parseFloat(sellingPrice6ml)}` : `6ml price updated to ₹${parseFloat(sellingPrice6ml)}`;
        }

        if (discount !== undefined) {
            const discountValue = parseFloat(discount);
            if (discountValue < 0 || discountValue > 100) {
                await logFailed({
                    module: 'Dispenser Inventory',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update Product',
                    heading: 'Product Update Failed',
                    description: 'Discount must be between 0 and 100'
                });
                return res.status(400).json({
                    message: "Discount must be between 0 and 100"
                });
            }
            updateData.discount = discountValue;
            updateDescription += updateDescription ? `, Discount updated to ${discountValue}%` : `Discount updated to ${discountValue}%`;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                message: "No changes provided"
            });
        }

        updateData.updatedBy = {
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email
        };

        const updatedProduct = await DispenserInventory.findOneAndUpdate(
            { dispenserId },
            updateData,
            { new: true, runValidators: true }
        );

        const transUpdateData = {};
        if (sellingPrice3ml !== undefined) transUpdateData.sellingPrice3ml = parseFloat(sellingPrice3ml);
        if (sellingPrice6ml !== undefined) transUpdateData.sellingPrice6ml = parseFloat(sellingPrice6ml);
        if (discount !== undefined) transUpdateData.discount = parseFloat(discount);

        if (Object.keys(transUpdateData).length > 0) {
            await DispenserTransactions.updateProductDetails(
                dispenserId,
                transUpdateData.sellingPrice3ml,
                transUpdateData.sellingPrice6ml,
                transUpdateData.discount
            );
        }

        await logSuccess({
            module: 'Dispenser Inventory',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Update Product',
            heading: 'Product Updated Successfully',
            description: updateDescription
        });

        res.status(200).json({
            message: "Product updated successfully",
            product: updatedProduct.toObject()
        });

    } catch (error) {
        console.error("Error updating product:", error);
        await logFailed({
            module: 'Dispenser Inventory',
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
router.delete("/delete/:dispenserId", auth, checkInventoryPermission, async (req, res) => {
    try {
        const { dispenserId } = req.params;
        const product = await DispenserInventory.findOne({ dispenserId });
        if (!product) {
            await logFailed({
                module: 'Dispenser Inventory',
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

        await DispenserTransactions.findOneAndDelete({ dispenserId });
        await DispenserInventory.findOneAndDelete({ dispenserId });

        await logSuccess({
            module: 'Dispenser Inventory',
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
            module: 'Dispenser Inventory',
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
// BULK UPLOAD - PRODUCTS (WITH AUDIT)
// ============================================
router.post("/bulk-upload-products", auth, checkInventoryPermission, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                message: "Excel file is required"
            });
        }

        const file = { data: req.file.buffer, name: req.file.originalname };
        const result = await parseExcel(file, 'products');

        if (!result || result.total === 0) {
            return res.status(400).json({
                message: "No valid data found in Excel file"
            });
        }

        const errors = [];
        const success = [];
        const bulkUploadId = `bulk-${Date.now()}`;

        // ✅ Store original data for audit
        const originalData = result.originalData || [];

        for (let i = 0; i < result.success.length; i++) {
            const row = result.success[i];
            const rowNumber = row.rowNumber;

            try {
                const { productName, sellingPrice3ml, sellingPrice6ml, discount } = row;

                if (!productName || productName.trim() === '') {
                    errors.push({ row: rowNumber, productName, sellingPrice3ml, sellingPrice6ml, discount, error: 'Product name is required' });
                    continue;
                }

                if (!sellingPrice3ml || parseFloat(sellingPrice3ml) <= 0) {
                    errors.push({ row: rowNumber, productName, sellingPrice3ml, sellingPrice6ml, discount, error: '3ml selling price must be greater than 0' });
                    continue;
                }

                if (!sellingPrice6ml || parseFloat(sellingPrice6ml) <= 0) {
                    errors.push({ row: rowNumber, productName, sellingPrice3ml, sellingPrice6ml, discount, error: '6ml selling price must be greater than 0' });
                    continue;
                }

                const nameTrim = productName.trim();
                const price3ml = parseFloat(sellingPrice3ml);
                const price6ml = parseFloat(sellingPrice6ml);
                const discountValue = discount !== undefined ? parseFloat(discount) : 0;

                const exists = await DispenserInventory.productExists(nameTrim);
                if (exists) {
                    errors.push({ row: rowNumber, productName: nameTrim, sellingPrice3ml: price3ml, sellingPrice6ml: price6ml, discount: discountValue, error: 'Product already exists' });
                    continue;
                }

                const product = new DispenserInventory({
                    productName: nameTrim,
                    quantity: 0,
                    totalQuantityAdded: 0,
                    totalPurchaseCost: 0,
                    avgPurchasePrice: 0,
                    sellingPrice3ml: price3ml,
                    sellingPrice6ml: price6ml,
                    discount: discountValue,
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
                });

                await product.save();

                await DispenserTransactions.create({
                    dispenserId: product.dispenserId,
                    productName: nameTrim,
                    sellingPrice3ml: price3ml,
                    sellingPrice6ml: price6ml,
                    discount: discountValue,
                    transactions: []
                });

                success.push({
                    row: rowNumber,
                    productName: nameTrim,
                    sellingPrice3ml: price3ml,
                    sellingPrice6ml: price6ml,
                    discount: discountValue
                });

            } catch (error) {
                errors.push({
                    row: rowNumber,
                    productName: row.productName,
                    sellingPrice3ml: row.sellingPrice3ml,
                    sellingPrice6ml: row.sellingPrice6ml,
                    discount: row.discount || 0,
                    error: error.message || 'Unknown error'
                });
            }
        }

        if (result.errors && result.errors.length > 0) {
            result.errors.forEach(err => errors.push(err));
        }

        // ============================================
        // ✅ CREATE AUDIT FILE
        // ============================================
        const { createAuditFile } = require("../../utils/auditHelper");

        const successData = success.map(item => ({
            'Row': item.row || 'N/A',
            'Product Name': item.productName || 'N/A',
            'Selling Price 3ml': item.sellingPrice3ml || 0,
            'Selling Price 6ml': item.sellingPrice6ml || 0,
            'Discount (%)': item.discount || 0,
            'Status': '✅ Added'
        }));

        const failedData = errors.map(item => ({
            'Row': item.row || 'N/A',
            'Product Name': item.productName || 'N/A',
            'Selling Price 3ml': item.sellingPrice3ml || 'N/A',
            'Selling Price 6ml': item.sellingPrice6ml || 'N/A',
            'Discount (%)': item.discount || 'N/A',
            'Error Reason': item.error || 'Unknown error'
        }));

        const summary = {
            uploadDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            category: 'Dispenser - Products',
            uploadedBy: req.user.name || req.user.userName || 'Unknown',
            fileName: req.file.originalname,
            totalRows: result.total || originalData.length,
            successCount: success.length,
            failedCount: errors.length
        };

        const auditResult = await createAuditFile('dispenser', {
            originalData: originalData.length > 0 ? originalData : [{ 'Message': 'No original data available' }],
            successData: successData.length > 0 ? successData : [{ 'Message': 'No successful records' }],
            failedData: failedData.length > 0 ? failedData : [{ 'Message': 'No failed records' }],
            summary: summary,
            fileName: req.file.originalname,
            uploadedBy: req.user.name || req.user.userName
        });

        if (auditResult.success) {
            console.log(`✅ Dispenser Product Audit file created: ${auditResult.auditFileName}`);
        }

        if (success.length > 0) {
            await logSuccess({
                module: 'Dispenser Inventory',
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
                module: 'Dispenser Inventory',
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
            module: 'Dispenser Inventory',
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
// BULK UPLOAD - INVENTORY (WITH AUDIT)
// ============================================
router.post("/bulk-upload-inventory", auth, checkInventoryPermission, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                message: "Excel file is required"
            });
        }

        const file = { data: req.file.buffer, name: req.file.originalname };
        const result = await parseExcel(file, 'inventory');

        if (!result || result.total === 0) {
            return res.status(400).json({
                message: "No valid data found in Excel file"
            });
        }

        const errors = [];
        const success = [];
        const bulkUploadId = `bulk-${Date.now()}`;

        // ✅ Store original data for audit
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

                if (!purchasePrice || parseFloat(purchasePrice) <= 0) {
                    errors.push({ row: rowNumber, productName, quantity, purchasePrice, error: 'Purchase price must be greater than 0' });
                    continue;
                }

                const nameTrim = productName.trim();
                const qty = parseFloat(quantity);
                const price = parseFloat(purchasePrice);

                const product = await DispenserInventory.getProduct(nameTrim);
                if (!product) {
                    errors.push({ row: rowNumber, productName: nameTrim, quantity: qty, purchasePrice: price, error: 'Product not found' });
                    continue;
                }

                const oldQuantity = product.quantity;
                const oldTotalQuantityAdded = product.totalQuantityAdded;
                const oldTotalPurchaseCost = product.totalPurchaseCost;
                const oldAvgPurchasePrice = product.avgPurchasePrice;
                const sellingPrice3ml = product.sellingPrice3ml;
                const sellingPrice6ml = product.sellingPrice6ml;
                const discount = product.discount;

                const newTotalQuantityAdded = oldTotalQuantityAdded + qty;
                const newTotalPurchaseCost = oldTotalPurchaseCost + (qty * price);
                const newAvgPurchasePrice = newTotalPurchaseCost / newTotalQuantityAdded;
                const newQuantity = oldQuantity + qty;

                product.quantity = newQuantity;
                product.totalQuantityAdded = newTotalQuantityAdded;
                product.totalPurchaseCost = newTotalPurchaseCost;
                product.avgPurchasePrice = newAvgPurchasePrice;
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
                    sellingPrice3ml: sellingPrice3ml,
                    sellingPrice6ml: sellingPrice6ml,
                    discount: discount,
                    previousStock: oldQuantity,
                    newStock: newQuantity,
                    previousTotalQuantityAdded: oldTotalQuantityAdded,
                    newTotalQuantityAdded: newTotalQuantityAdded,
                    previousTotalPurchaseCost: oldTotalPurchaseCost,
                    newTotalPurchaseCost: newTotalPurchaseCost,
                    previousAvgPurchasePrice: oldAvgPurchasePrice,
                    newAvgPurchasePrice: newAvgPurchasePrice,
                    reason: 'Purchase',
                    notes: 'Bulk upload',
                    performedBy: {
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email
                    },
                    bulkUploadId: bulkUploadId
                };

                await DispenserTransactions.addTransaction(product.dispenserId, transactionData);

                success.push({
                    row: rowNumber,
                    productName: nameTrim,
                    quantity: qty,
                    purchasePrice: price,
                    newStock: newQuantity
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
            result.errors.forEach(err => errors.push(err));
        }

        // ============================================
        // ✅ CREATE AUDIT FILE
        // ============================================
        const { createAuditFile } = require("../../utils/auditHelper");

        const successData = success.map(item => ({
            'Row': item.row || 'N/A',
            'Product Name': item.productName || 'N/A',
            'Quantity': item.quantity || 0,
            'Purchase Price': item.purchasePrice || 0,
            'New Stock': item.newStock || 0,
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
            category: 'Dispenser - Inventory',
            uploadedBy: req.user.name || req.user.userName || 'Unknown',
            fileName: req.file.originalname,
            totalRows: result.total || originalData.length,
            successCount: success.length,
            failedCount: errors.length
        };

        const auditResult = await createAuditFile('dispenser', {
            originalData: originalData.length > 0 ? originalData : [{ 'Message': 'No original data available' }],
            successData: successData.length > 0 ? successData : [{ 'Message': 'No successful records' }],
            failedData: failedData.length > 0 ? failedData : [{ 'Message': 'No failed records' }],
            summary: summary,
            fileName: req.file.originalname,
            uploadedBy: req.user.name || req.user.userName
        });

        if (auditResult.success) {
            console.log(`✅ Dispenser Inventory Audit file created: ${auditResult.auditFileName}`);
        }

        if (success.length > 0) {
            await logSuccess({
                module: 'Dispenser Inventory',
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
                module: 'Dispenser Inventory',
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
            bulkUploadId,
            audit: {
                created: auditResult.success,
                fileName: auditResult.auditFileName || null,
                filePath: auditResult.auditFilePath || null
            }
        });

    } catch (error) {
        console.error("Error in bulk inventory upload:", error);
        await logFailed({
            module: 'Dispenser Inventory',
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
        const transactionDoc = await DispenserTransactions.findOne({
            "transactions.bulkUploadId": bulkUploadId
        });

        if (!transactionDoc) {
            return res.status(404).json({
                message: "No errors found for this bulk upload"
            });
        }

        const errors = transactionDoc.transactions
            .filter(t => t.bulkUploadId === bulkUploadId && t.notes === 'Bulk upload error')
            .map(t => ({
                productName: t.productName || '',
                quantity: t.quantity || '',
                purchasePrice: t.purchasePrice || '',
                error: t.notes || 'Unknown error'
            }));

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
            search = ''
        } = req.query;

        console.log(`📊 Export Dispenser Inventory - Status: ${status}, Search: ${search}`);

        let query = {};
        if (search && search.trim() !== '') {
            query.productName = { $regex: search.trim(), $options: 'i' };
        }

        const products = await DispenserInventory.find(query).lean();

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

        const INVOICE_RELATED_REASONS = [
            'Invoice', 'Invoice Return', 'Invoice Deletion - Return',
            'Invoice Edit - Return', 'Invoice Edit - New Reduction'
        ];

        const productData = [];

        for (const product of filteredProducts) {
            const transactionDoc = await DispenserTransactions.findOne({ dispenserId: product.dispenserId }).lean();

            let inTransactions = [];
            if (transactionDoc && transactionDoc.transactions) {
                inTransactions = transactionDoc.transactions.filter(t =>
                    t.transactionType === 'IN' &&
                    !INVOICE_RELATED_REASONS.includes(t.reason)
                );
                inTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            }

            const totalQuantity = product.quantity || 0;
            const totalCost = product.totalPurchaseCost || 0;
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
                stockStatus: stockStatus
            });
        }

        productData.sort((a, b) => a.product.productName.localeCompare(b.product.productName));

        const XLSX = require('xlsx');

        // Sheet 1: Product Summary
        const summaryData = productData.map(item => ({
            'Product Name': item.product.productName,
            'Category': 'Dispenser',
            'Quantity (KG)': Number(item.totalQuantity).toFixed(4),
            'Selling Price 3ml': `₹${Number(item.product.sellingPrice3ml || 0).toFixed(2)}`,
            'Selling Price 6ml': `₹${Number(item.product.sellingPrice6ml || 0).toFixed(2)}`,
            'Discount (%)': item.product.discount || 0,
            'Total Purchase Cost': `₹${Number(item.totalCost).toFixed(2)}`,
            'Avg Purchase Price': `₹${Number(item.avgPrice).toFixed(2)}`,
            'Min Stock': item.product.minStock || 5,
            'Status': item.stockStatus
        }));

        // Sheet 2: Transaction History
        const transactionData = [];

        for (const item of productData) {
            transactionData.push({
                'Product': item.product.productName,
                'Category': 'Dispenser',
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
                        day: '2-digit', month: 'short', year: 'numeric'
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
                'Product': '', 'Category': '', 'Date': '', 'Quantity': '',
                'Price/Unit': '', 'Total Cost': '', 'Reason': '', 'Added By': '', 'Current Stock': ''
            });
        }

        const wb = XLSX.utils.book_new();

        const ws1 = XLSX.utils.json_to_sheet(summaryData);
        ws1['!cols'] = [
            { wch: 35 }, { wch: 12 }, { wch: 15 }, { wch: 18 },
            { wch: 18 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 15 }
        ];
        XLSX.utils.book_append_sheet(wb, ws1, 'Product Summary');

        const ws2 = XLSX.utils.json_to_sheet(transactionData);
        ws2['!cols'] = [
            { wch: 35 }, { wch: 12 }, { wch: 14 }, { wch: 15 },
            { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 20 }, { wch: 18 }
        ];
        XLSX.utils.book_append_sheet(wb, ws2, 'Transaction History');

        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        const filename = `dispenser_inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(buffer);

    } catch (error) {
        console.error("Error exporting Dispenser inventory:", error);
        res.status(500).json({
            success: false,
            message: "Failed to export inventory",
            error: error.message
        });
    }
});

module.exports = router;