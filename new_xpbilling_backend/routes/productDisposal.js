const express = require("express");
const router = express.Router();
const ProductDisposal = require("../models/productDisposal");
const XPInventory = require("../models/inventory/xp/xpInventory");
const DispenserInventory = require("../models/inventory/dispenser/dispenserInventory");
const BottlesInventory = require("../models/inventory/bottles/bottlesInventory");
const XPTransactions = require("../models/inventory/xp/xpTransactions");
const DispenserTransactions = require("../models/inventory/dispenser/dispenserTransactions");
const BottlesTransactions = require("../models/inventory/bottles/bottlesTransactions");
const User = require("../models/user");
const jwt = require("jsonwebtoken");
const { logSuccess, logFailed } = require("../utils/logHelper");

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
// CHECK DISPOSAL PERMISSION
// ============================================
const checkDisposalPermission = (req, res, next) => {
    const permissions = req.user.permissions || [];
    if (permissions.includes('admin') || permissions.includes('disposal')) {
        next();
    } else {
        return res.status(403).json({
            message: 'Access denied. Disposal permission required.'
        });
    }
};

// ============================================
// HELPER: Get density for XP product
// ============================================
const getDensityForProduct = (productName) => {
    if (productName && productName.toUpperCase().trim() === "FRAGRANCE BASE") {
        return 820;
    }
    return 1000;
};

// ============================================
// HELPER: Convert ML to KG based on density
// ============================================
const convertMLToKG = (ml, density) => {
    return ml / density;
};

// ============================================
// HELPER: Get inventory model and reduce stock
// ============================================
const disposeFromInventory = async (inventoryType, inventoryItemId, quantity, user) => {
    let inventoryModel, transactionModel, idField;

    switch (inventoryType) {
        case 'xp':
            inventoryModel = XPInventory;
            transactionModel = XPTransactions;
            idField = 'xpId';
            break;
        case 'dispenser':
            inventoryModel = DispenserInventory;
            transactionModel = DispenserTransactions;
            idField = 'dispenserId';
            break;
        case 'bottles':
            inventoryModel = BottlesInventory;
            transactionModel = BottlesTransactions;
            idField = 'bottleItemId';
            break;
        default:
            throw new Error('Invalid inventory type');
    }

    // Find inventory item
    const inventory = await inventoryModel.findOne({ [idField]: inventoryItemId });
    if (!inventory) {
        throw new Error('Product not found in inventory');
    }

    // Check if enough stock
    if (inventory.quantity < quantity) {
        throw new Error(`Insufficient stock. Available: ${inventory.quantity}, Requested: ${quantity}`);
    }

    // Get old quantity
    const oldQuantity = inventory.quantity;
    const newQuantity = oldQuantity - quantity;

    // Update inventory
    inventory.quantity = newQuantity;
    inventory.updatedBy = {
        userId: user.userId,
        userName: user.name,
        userEmail: user.email
    };
    await inventory.save();

    // Create OUT transaction
    const transactionData = {
        transactionType: 'OUT',
        quantity: quantity,
        previousStock: oldQuantity,
        newStock: newQuantity,
        reason: 'Disposal',
        notes: 'Product disposed',
        performedBy: {
            userId: user.userId,
            userName: user.name,
            userEmail: user.email
        }
    };

    // Add inventory-specific fields to transaction
    if (inventoryType === 'xp') {
        transactionData.xpId = inventoryItemId;
        await transactionModel.addTransaction(inventoryItemId, transactionData);
    } else if (inventoryType === 'dispenser') {
        transactionData.dispenserId = inventoryItemId;
        await transactionModel.addTransaction(inventoryItemId, transactionData);
    } else if (inventoryType === 'bottles') {
        transactionData.mlSize = inventory.mlSize;
        transactionData.itemType = inventory.itemType;
        await transactionModel.addTransaction(
            inventory.mlSize,
            inventory.itemType,
            inventoryItemId,
            transactionData
        );
    }

    return { inventory, newQuantity, oldQuantity };
};

// ============================================
// GET PRODUCT BY INVENTORY TYPE
// ============================================
router.post("/get-product", auth, async (req, res) => {
    try {
        const { inventoryType, inventoryItemId } = req.body;

        if (!inventoryType || !inventoryItemId) {
            return res.status(400).json({
                message: "Inventory type and item ID are required"
            });
        }

        let product = null;
        let model;
        let idField;

        switch (inventoryType) {
            case 'xp':
                model = XPInventory;
                idField = 'xpId';
                break;
            case 'dispenser':
                model = DispenserInventory;
                idField = 'dispenserId';
                break;
            case 'bottles':
                model = BottlesInventory;
                idField = 'bottleItemId';
                break;
            default:
                return res.status(400).json({
                    message: 'Invalid inventory type'
                });
        }

        product = await model.findOne({ [idField]: inventoryItemId }).lean();

        if (!product) {
            return res.status(404).json({
                message: 'Product not found'
            });
        }

        res.status(200).json({ product });

    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({
            message: "Failed to fetch product",
            error: error.message
        });
    }
});

// ============================================
// DISPOSE PRODUCT
// ============================================
router.post("/dispose", auth, checkDisposalPermission, async (req, res) => {
    try {
        const { inventoryType, inventoryItemId, disposedQuantity, reason, notes } = req.body;

        // Validate required fields
        if (!inventoryType || !inventoryItemId || !disposedQuantity || !reason) {
            await logFailed({
                module: 'Product Disposal',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Dispose',
                heading: 'Disposal Failed',
                description: 'Missing required fields'
            });
            return res.status(400).json({
                message: "Inventory type, item ID, quantity and reason are required"
            });
        }

        // Validate quantity
        if (disposedQuantity <= 0) {
            await logFailed({
                module: 'Product Disposal',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Dispose',
                heading: 'Disposal Failed',
                description: 'Quantity must be greater than 0'
            });
            return res.status(400).json({
                message: "Quantity must be greater than 0"
            });
        }

        // Get product details from inventory
        let productData = null;
        let model;
        let idField;

        switch (inventoryType) {
            case 'xp':
                model = XPInventory;
                idField = 'xpId';
                break;
            case 'dispenser':
                model = DispenserInventory;
                idField = 'dispenserId';
                break;
            case 'bottles':
                model = BottlesInventory;
                idField = 'bottleItemId';
                break;
            default:
                return res.status(400).json({
                    message: 'Invalid inventory type'
                });
        }

        productData = await model.findOne({ [idField]: inventoryItemId }).lean();

        if (!productData) {
            await logFailed({
                module: 'Product Disposal',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Dispose',
                heading: 'Disposal Failed',
                description: 'Product not found in inventory'
            });
            return res.status(404).json({
                message: 'Product not found in inventory'
            });
        }

        // ✅ CALCULATE QUANTITY TO REMOVE BASED ON INVENTORY TYPE
        let quantityToRemove = disposedQuantity;
        let disposedQuantityKG = disposedQuantity;
        let disposedQuantityML = 0;

        // For XP, check density
        if (inventoryType === 'xp') {
            const density = getDensityForProduct(productData.productName);

            // User input is in ML (always)
            const mlInput = disposedQuantity;

            // Convert ML to KG
            quantityToRemove = convertMLToKG(mlInput, density);
            disposedQuantityKG = quantityToRemove;
            disposedQuantityML = mlInput;

            // Validate: Check if enough stock
            if (productData.quantity < quantityToRemove) {
                await logFailed({
                    module: 'Product Disposal',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Dispose',
                    heading: 'Disposal Failed',
                    description: `Insufficient stock. Available: ${productData.quantity} KG, Requested: ${quantityToRemove.toFixed(4)} KG (${mlInput} ML)`
                });
                return res.status(400).json({
                    message: `Insufficient stock. Available: ${productData.quantity} KG, Requested: ${quantityToRemove.toFixed(4)} KG (${mlInput} ML)`
                });
            }
        }
        // For Dispenser, user input is in ML (same as grams)
        else if (inventoryType === 'dispenser') {
            // 1 ML = 1 Gram for dispenser
            const mlInput = disposedQuantity;
            quantityToRemove = mlInput / 1000; // Convert to KG
            disposedQuantityKG = quantityToRemove;
            disposedQuantityML = mlInput;
        }
        // For Bottles, user input is in pieces
        else if (inventoryType === 'bottles') {
            quantityToRemove = disposedQuantity;
            disposedQuantityKG = disposedQuantity;
            disposedQuantityML = 0;
        }

        // Prepare disposal data
        const disposalData = {
            inventoryType,
            inventoryItemId,
            productName: productData.productName || productData.itemType || '',
            disposedQuantity: disposedQuantityKG, // Store in KG
            disposedQuantityML: disposedQuantityML, // Store ML reference
            reason,
            performedBy: {
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email
            },
            notes: notes || ''
        };

        // Add ML/MLSize/ItemType based on inventory type
        if (inventoryType === 'xp' || inventoryType === 'dispenser') {
            if (productData.ml !== undefined && productData.ml !== null) {
                disposalData.ml = productData.ml;
            }
        } else if (inventoryType === 'bottles') {
            disposalData.mlSize = productData.mlSize;
            disposalData.itemType = productData.itemType;
        }

        // Add disposal to ProductDisposal
        const disposalDoc = await ProductDisposal.addDisposal(inventoryItemId, disposalData);

        // Reduce stock from inventory and create transaction
        await disposeFromInventory(inventoryType, inventoryItemId, quantityToRemove, req.user);

        // ✅ LOG SUCCESS
        let logDescription = '';
        if (inventoryType === 'xp') {
            logDescription = `Disposed ${disposedQuantityML} ML (${disposedQuantityKG.toFixed(4)} KG) of ${disposalData.productName}`;
        } else if (inventoryType === 'dispenser') {
            logDescription = `Disposed ${disposedQuantityML} ML (${disposedQuantityKG.toFixed(4)} KG) of ${disposalData.productName}`;
        } else {
            logDescription = `Disposed ${disposedQuantity} pieces of ${disposalData.productName}`;
        }

        await logSuccess({
            module: 'Product Disposal',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Dispose',
            heading: 'Product Disposed Successfully',
            description: logDescription
        });

        res.status(200).json({
            message: "Product disposed successfully",
            disposal: disposalDoc.toObject()
        });

    } catch (error) {
        console.error("Error disposing product:", error);

        await logFailed({
            module: 'Product Disposal',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Dispose',
            heading: 'Disposal Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to dispose product",
            error: error.message
        });
    }
});

// ============================================
// GET ALL DISPOSALS
// ============================================
router.get("/get-all", auth, async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [disposals, total] = await Promise.all([
            ProductDisposal.find({})
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            ProductDisposal.countDocuments({})
        ]);

        res.status(200).json({
            disposals,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error("Error fetching disposals:", error);
        res.status(500).json({
            message: "Failed to fetch disposals",
            error: error.message
        });
    }
});

// ============================================
// GET DISPOSALS BY PRODUCT
// ============================================
router.get("/get-by-product/:inventoryItemId", auth, async (req, res) => {
    try {
        const { inventoryItemId } = req.params;

        const disposal = await ProductDisposal.findOne({ inventoryItemId }).lean();

        if (!disposal) {
            return res.status(200).json({
                success: true,
                message: "No disposals found for this product",
                data: null
            });
        }

        res.status(200).json({
            success: true,
            data: disposal
        });

    } catch (error) {
        console.error("Error fetching product disposals:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch disposals",
            error: error.message
        });
    }
});

// ============================================
// GET DISPOSALS BY INVENTORY TYPE
// ============================================
router.get("/get-by-inventory/:inventoryType", auth, async (req, res) => {
    try {
        const { inventoryType } = req.params;
        const { page = 1, limit = 50 } = req.query;

        if (!['xp', 'dispenser', 'bottles'].includes(inventoryType)) {
            return res.status(400).json({
                message: "Invalid inventory type"
            });
        }

        const result = await ProductDisposal.getByInventoryType(inventoryType, parseInt(limit), parseInt(page));

        res.status(200).json(result);

    } catch (error) {
        console.error("Error fetching disposals by type:", error);
        res.status(500).json({
            message: "Failed to fetch disposals",
            error: error.message
        });
    }
});

// ============================================
// GET SUMMARY
// ============================================
router.get("/get-summary", auth, async (req, res) => {
    try {
        const { inventoryType } = req.query;

        let result;
        if (inventoryType) {
            result = await ProductDisposal.getSummaryByType(inventoryType);
        } else {
            const types = ['xp', 'dispenser', 'bottles'];
            const summaries = await Promise.all(
                types.map(async (type) => {
                    const summary = await ProductDisposal.getSummaryByType(type);
                    return { inventoryType: type, ...summary };
                })
            );
            result = summaries;
        }

        res.status(200).json(result);

    } catch (error) {
        console.error("Error fetching summary:", error);
        res.status(500).json({
            message: "Failed to fetch summary",
            error: error.message
        });
    }
});

module.exports = router;