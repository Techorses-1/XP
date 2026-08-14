const express = require("express");
const router = express.Router();
const Invoice = require("../models/invoice");
const DeletedInvoice = require("../models/deletedInvoice");
const Customer = require("../models/customer");
const Workshop = require("../models/workshop");
const Package = require("../models/package");
const PromoCode = require("../models/promoCode");
const XPInventory = require("../models/inventory/xp/xpInventory");
const XPTransactions = require("../models/inventory/xp/xpTransactions");
const DispenserInventory = require("../models/inventory/dispenser/dispenserInventory");
const DispenserTransactions = require("../models/inventory/dispenser/dispenserTransactions");
const BottlesInventory = require("../models/inventory/bottles/bottlesInventory");
const BottlesTransactions = require("../models/inventory/bottles/bottlesTransactions");
const User = require("../models/user");
const jwt = require("jsonwebtoken");
const { logSuccess, logFailed } = require("../utils/logHelper");

// ============================================
// CONSTANTS
// ============================================
const GST_RATE = 18;

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
// CHECK INVOICE PERMISSION
// ============================================
const checkInvoicePermission = (req, res, next) => {
    const permissions = req.user.permissions || [];
    if (permissions.includes('admin') || permissions.includes('invoice')) {
        next();
    } else {
        return res.status(403).json({
            message: 'Access denied. Invoice permission required.'
        });
    }
};

// ============================================
// HELPER: Reduce Bottles Inventory
// ============================================
const reduceBottlesInventory = async (mlSize, quantity, user, transactionReason, notes = '') => {
    const itemTypes = ['Bottle', 'Cap', 'Pump', 'Box'];
    const results = [];

    for (const itemType of itemTypes) {
        const inventory = await BottlesInventory.findOne({ mlSize, itemType });

        if (!inventory) {
            throw new Error(`No stock found for ${mlSize} ${itemType}`);
        }

        if (inventory.quantity < quantity) {
            throw new Error(`Insufficient stock for ${mlSize} ${itemType}. Available: ${inventory.quantity}, Required: ${quantity}`);
        }

        const oldQuantity = inventory.quantity;
        const newQuantity = oldQuantity - quantity;

        inventory.quantity = newQuantity;
        inventory.updatedBy = {
            userId: user.userId,
            userName: user.name,
            userEmail: user.email
        };

        await inventory.save();

        const transactionData = {
            transactionType: 'OUT',
            quantity: quantity,
            previousStock: oldQuantity,
            newStock: newQuantity,
            reason: transactionReason || 'Invoice',
            notes: notes || `Reduced for invoice`,
            performedBy: {
                userId: user.userId,
                userName: user.name,
                userEmail: user.email
            }
        };

        await BottlesTransactions.addTransaction(
            mlSize,
            itemType,
            inventory.bottleItemId,
            transactionData
        );

        results.push({
            mlSize,
            itemType,
            oldQuantity,
            newQuantity,
            reduced: quantity
        });
    }

    return results;
};

// ============================================
// HELPER: Return Bottles Inventory (IN)
// ============================================
const returnBottlesInventory = async (mlSize, quantity, user, transactionReason, notes = '') => {
    const itemTypes = ['Bottle', 'Cap', 'Pump', 'Box'];
    const results = [];

    for (const itemType of itemTypes) {
        const inventory = await BottlesInventory.findOne({ mlSize, itemType });

        if (!inventory) {
            throw new Error(`No stock found for ${mlSize} ${itemType}`);
        }

        const oldQuantity = inventory.quantity;
        const newQuantity = oldQuantity + quantity;

        inventory.quantity = newQuantity;
        inventory.updatedBy = {
            userId: user.userId,
            userName: user.name,
            userEmail: user.email
        };

        await inventory.save();

        const transactionData = {
            transactionType: 'IN',
            quantity: quantity,
            previousStock: oldQuantity,
            newStock: newQuantity,
            reason: transactionReason || 'Invoice Return',
            notes: notes || `Returned for invoice`,
            performedBy: {
                userId: user.userId,
                userName: user.name,
                userEmail: user.email
            }
        };

        await BottlesTransactions.addTransaction(
            mlSize,
            itemType,
            inventory.bottleItemId,
            transactionData
        );

        results.push({
            mlSize,
            itemType,
            oldQuantity,
            newQuantity,
            returned: quantity
        });
    }

    return results;
};

// ============================================
// HELPER: Reduce XP Oil Inventory
// ============================================
const reduceXPOil = async (xpId, quantityInGrams, user, transactionReason, notes = '') => {
    const inventory = await XPInventory.findOne({ xpId });

    if (!inventory) {
        throw new Error(`XP Oil not found`);
    }

    const quantityInKG = quantityInGrams / 1000;

    if (inventory.quantity < quantityInKG) {
        throw new Error(
            `Insufficient XP Oil stock. Available: ${inventory.quantity} KG, Required: ${quantityInKG} KG (${quantityInGrams} g)`
        );
    }

    const oldQuantity = inventory.quantity;
    const newQuantity = oldQuantity - quantityInKG;

    inventory.quantity = newQuantity;
    inventory.updatedBy = {
        userId: user.userId,
        userName: user.name,
        userEmail: user.email
    };

    await inventory.save();

    const transactionData = {
        transactionType: 'OUT',
        quantity: quantityInKG,
        purchasePrice: inventory.avgPurchasePrice || 0,
        density: inventory.density || 1000,
        previousStock: oldQuantity,
        newStock: newQuantity,
        previousTotalQuantityAdded: inventory.totalQuantityAdded,
        newTotalQuantityAdded: inventory.totalQuantityAdded,
        previousTotalCost: inventory.totalCost,
        newTotalCost: inventory.totalCost,
        previousAvgPrice: inventory.avgPurchasePrice,
        newAvgPrice: inventory.avgPurchasePrice,
        reason: transactionReason || 'Invoice',
        notes: notes || `Reduced ${quantityInGrams} grams for invoice`,
        performedBy: {
            userId: user.userId,
            userName: user.name,
            userEmail: user.email
        }
    };

    await XPTransactions.addTransaction(inventory.xpId, transactionData);

    return {
        xpId: inventory.xpId,
        productName: inventory.productName,
        oldQuantity,
        newQuantity,
        reducedInKG: quantityInKG,
        reducedInGrams: quantityInGrams
    };
};

// ============================================
// HELPER: Return XP Oil Inventory (IN)
// ============================================
const returnXPOil = async (xpId, quantityInGrams, user, transactionReason, notes = '') => {
    const inventory = await XPInventory.findOne({ xpId });

    if (!inventory) {
        throw new Error(`XP Oil not found`);
    }

    const quantityInKG = quantityInGrams / 1000;

    const oldQuantity = inventory.quantity;
    const newQuantity = oldQuantity + quantityInKG;

    inventory.quantity = newQuantity;
    inventory.updatedBy = {
        userId: user.userId,
        userName: user.name,
        userEmail: user.email
    };

    await inventory.save();

    const transactionData = {
        transactionType: 'IN',
        quantity: quantityInKG,
        purchasePrice: inventory.avgPurchasePrice || 0,
        density: inventory.density || 1000,
        previousStock: oldQuantity,
        newStock: newQuantity,
        previousTotalQuantityAdded: inventory.totalQuantityAdded,
        newTotalQuantityAdded: inventory.totalQuantityAdded,
        previousTotalCost: inventory.totalCost,
        newTotalCost: inventory.totalCost,
        previousAvgPrice: inventory.avgPurchasePrice,
        newAvgPrice: inventory.avgPurchasePrice,
        reason: transactionReason || 'Invoice Return',
        notes: notes || `Returned ${quantityInGrams} grams for invoice`,
        performedBy: {
            userId: user.userId,
            userName: user.name,
            userEmail: user.email
        }
    };

    await XPTransactions.addTransaction(inventory.xpId, transactionData);

    return {
        xpId: inventory.xpId,
        productName: inventory.productName,
        oldQuantity,
        newQuantity,
        returnedInKG: quantityInKG,
        returnedInGrams: quantityInGrams
    };
};

// ============================================
// HELPER: Reduce Alcohol
// ============================================
const reduceAlcohol = async (alcoholML, user, transactionReason, notes = '') => {
    const productName = "FRAGRANCE BASE";
    const inventory = await XPInventory.findOne({ productName });

    if (!inventory) {
        throw new Error(`FRAGRANCE BASE  not found in XP Inventory`);
    }

    const density = inventory.density || 820;
    const quantityInKG = alcoholML / density;

    if (inventory.quantity < quantityInKG) {
        throw new Error(
            `Insufficient Alcohol stock. Available: ${inventory.quantity} KG, Required: ${quantityInKG} KG (${alcoholML} ML)`
        );
    }

    const oldQuantity = inventory.quantity;
    const newQuantity = oldQuantity - quantityInKG;

    inventory.quantity = newQuantity;
    inventory.updatedBy = {
        userId: user.userId,
        userName: user.name,
        userEmail: user.email
    };

    await inventory.save();

    const transactionData = {
        transactionType: 'OUT',
        quantity: quantityInKG,
        purchasePrice: inventory.avgPurchasePrice || 0,
        density,
        previousStock: oldQuantity,
        newStock: newQuantity,
        previousTotalQuantityAdded: inventory.totalQuantityAdded,
        newTotalQuantityAdded: inventory.totalQuantityAdded,
        previousTotalCost: inventory.totalCost,
        newTotalCost: inventory.totalCost,
        previousAvgPrice: inventory.avgPurchasePrice,
        newAvgPrice: inventory.avgPurchasePrice,
        reason: transactionReason || 'Invoice',
        notes: notes || `Reduced ${alcoholML} ML for invoice`,
        performedBy: {
            userId: user.userId,
            userName: user.name,
            userEmail: user.email
        }
    };

    await XPTransactions.addTransaction(inventory.xpId, transactionData);

    return {
        xpId: inventory.xpId,
        productName: inventory.productName,
        oldQuantity,
        newQuantity,
        reducedInKG: quantityInKG,
        reducedInML: alcoholML,
        density
    };
};

// ============================================
// HELPER: Return Alcohol (IN)
// ============================================
const returnAlcohol = async (alcoholML, user, transactionReason, notes = '') => {
    const productName = "FRAGRANCE BASE";
    const inventory = await XPInventory.findOne({ productName });

    if (!inventory) {
        throw new Error(`FRAGRANCE BASE not found in XP Inventory`);
    }

    const density = inventory.density || 820;
    const quantityInKG = alcoholML / density;

    const oldQuantity = inventory.quantity;
    const newQuantity = oldQuantity + quantityInKG;

    inventory.quantity = newQuantity;
    inventory.updatedBy = {
        userId: user.userId,
        userName: user.name,
        userEmail: user.email
    };

    await inventory.save();

    const transactionData = {
        transactionType: 'IN',
        quantity: quantityInKG,
        purchasePrice: inventory.avgPurchasePrice || 0,
        density,
        previousStock: oldQuantity,
        newStock: newQuantity,
        previousTotalQuantityAdded: inventory.totalQuantityAdded,
        newTotalQuantityAdded: inventory.totalQuantityAdded,
        previousTotalCost: inventory.totalCost,
        newTotalCost: inventory.totalCost,
        previousAvgPrice: inventory.avgPurchasePrice,
        newAvgPrice: inventory.avgPurchasePrice,
        reason: transactionReason || 'Invoice Return',
        notes: notes || `Returned ${alcoholML} ML for invoice`,
        performedBy: {
            userId: user.userId,
            userName: user.name,
            userEmail: user.email
        }
    };

    await XPTransactions.addTransaction(inventory.xpId, transactionData);

    return {
        xpId: inventory.xpId,
        productName: inventory.productName,
        oldQuantity,
        newQuantity,
        returnedInKG: quantityInKG,
        returnedInML: alcoholML,
        density
    };
};

// ============================================
// HELPER: Reduce Dispenser Oil
// ============================================
const reduceDispenserOil = async (dispenserId, ml, quantity, user, transactionReason, notes = '') => {
    const inventory = await DispenserInventory.findOne({ dispenserId });

    if (!inventory) {
        throw new Error(`Dispenser oil not found`);
    }

    const totalML = ml * quantity;
    const quantityInKG = totalML / 1000;

    if (inventory.quantity < quantityInKG) {
        throw new Error(
            `Insufficient dispenser oil stock. Available: ${inventory.quantity} KG, Required: ${quantityInKG} KG (${totalML} ML)`
        );
    }

    const oldQuantity = inventory.quantity;
    const newQuantity = oldQuantity - quantityInKG;

    inventory.quantity = newQuantity;
    inventory.updatedBy = {
        userId: user.userId,
        userName: user.name,
        userEmail: user.email
    };

    await inventory.save();

    const transactionData = {
        transactionType: 'OUT',
        quantity: quantityInKG,
        purchasePrice: inventory.avgPurchasePrice || 0,
        sellingPrice3ml: inventory.sellingPrice3ml || 0,
        sellingPrice6ml: inventory.sellingPrice6ml || 0,
        discount: inventory.discount || 0,
        previousStock: oldQuantity,
        newStock: newQuantity,
        previousTotalQuantityAdded: inventory.totalQuantityAdded,
        newTotalQuantityAdded: inventory.totalQuantityAdded,
        previousTotalPurchaseCost: inventory.totalPurchaseCost,
        newTotalPurchaseCost: inventory.totalPurchaseCost,
        previousAvgPurchasePrice: inventory.avgPurchasePrice,
        newAvgPurchasePrice: inventory.avgPurchasePrice,
        reason: transactionReason || 'Invoice',
        notes: notes || `Reduced ${totalML} ML (${ml}ml × ${quantity}) for invoice`,
        performedBy: {
            userId: user.userId,
            userName: user.name,
            userEmail: user.email
        }
    };

    await DispenserTransactions.addTransaction(inventory.dispenserId, transactionData);

    return {
        dispenserId: inventory.dispenserId,
        productName: inventory.productName,
        oldQuantity,
        newQuantity,
        reducedInKG: quantityInKG,
        reducedInML: totalML,
        ml: ml,
        quantity: quantity
    };
};

// ============================================
// HELPER: Return Dispenser Oil (IN)
// ============================================
const returnDispenserOil = async (dispenserId, ml, quantity, user, transactionReason, notes = '') => {
    const inventory = await DispenserInventory.findOne({ dispenserId });

    if (!inventory) {
        throw new Error(`Dispenser oil not found`);
    }

    const totalML = ml * quantity;
    const quantityInKG = totalML / 1000;

    const oldQuantity = inventory.quantity;
    const newQuantity = oldQuantity + quantityInKG;

    inventory.quantity = newQuantity;
    inventory.updatedBy = {
        userId: user.userId,
        userName: user.name,
        userEmail: user.email
    };

    await inventory.save();

    const transactionData = {
        transactionType: 'IN',
        quantity: quantityInKG,
        purchasePrice: inventory.avgPurchasePrice || 0,
        sellingPrice3ml: inventory.sellingPrice3ml || 0,
        sellingPrice6ml: inventory.sellingPrice6ml || 0,
        discount: inventory.discount || 0,
        previousStock: oldQuantity,
        newStock: newQuantity,
        previousTotalQuantityAdded: inventory.totalQuantityAdded,
        newTotalQuantityAdded: inventory.totalQuantityAdded,
        previousTotalPurchaseCost: inventory.totalPurchaseCost,
        newTotalPurchaseCost: inventory.totalPurchaseCost,
        previousAvgPurchasePrice: inventory.avgPurchasePrice,
        newAvgPurchasePrice: inventory.avgPurchasePrice,
        reason: transactionReason || 'Invoice Return',
        notes: notes || `Returned ${totalML} ML (${ml}ml × ${quantity}) for invoice`,
        performedBy: {
            userId: user.userId,
            userName: user.name,
            userEmail: user.email
        }
    };

    await DispenserTransactions.addTransaction(inventory.dispenserId, transactionData);

    return {
        dispenserId: inventory.dispenserId,
        productName: inventory.productName,
        oldQuantity,
        newQuantity,
        returnedInKG: quantityInKG,
        returnedInML: totalML,
        ml: ml,
        quantity: quantity
    };
};


// ============================================
// GET DELETED INVOICES (Audit)
// ============================================
router.get("/deleted/get-all", auth, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            startDate,
            endDate,
            customerId
        } = req.query;

        let query = {};

        if (startDate && endDate) {
            query.deletedAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        if (customerId) {
            query['customerInfo.customerId'] = customerId;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [invoices, total] = await Promise.all([
            DeletedInvoice.find(query)
                .sort({ deletedAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            DeletedInvoice.countDocuments(query)
        ]);

        const totalPages = Math.ceil(total / parseInt(limit));

        res.status(200).json({
            invoices,
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
        console.error("Error fetching deleted invoices:", error);
        res.status(500).json({
            message: "Failed to fetch deleted invoices",
            error: error.message
        });
    }
});

// ============================================
// GET DELETED INVOICE BY ID
// ============================================
router.get("/deleted/:invoiceId", auth, async (req, res) => {
    try {
        const { invoiceId } = req.params;

        const deletedInvoice = await DeletedInvoice.findOne({
            originalInvoiceId: invoiceId
        }).lean();

        if (!deletedInvoice) {
            return res.status(404).json({
                message: "Deleted invoice not found"
            });
        }

        res.status(200).json(deletedInvoice);

    } catch (error) {
        console.error("Error fetching deleted invoice:", error);
        res.status(500).json({
            message: "Failed to fetch deleted invoice",
            error: error.message
        });
    }
});

// ============================================
// RESTORE DELETED INVOICE (Move back to main)
// ============================================
router.post("/deleted/restore/:invoiceId", auth, checkInvoicePermission, async (req, res) => {
    try {
        const { invoiceId } = req.params;

        const deletedDoc = await DeletedInvoice.findOne({
            originalInvoiceId: invoiceId,
            isRestored: false
        });

        if (!deletedDoc) {
            return res.status(404).json({
                message: "Deleted invoice not found or already restored"
            });
        }

        // Create new invoice from deleted data
        const invoiceData = deletedDoc.invoiceData;
        delete invoiceData._id;
        delete invoiceData.createdAt;
        delete invoiceData.updatedAt;
        delete invoiceData.__v;

        const restoredInvoice = new Invoice(invoiceData);
        await restoredInvoice.save();

        // Mark as restored
        deletedDoc.isRestored = true;
        deletedDoc.restoredAt = new Date();
        deletedDoc.restoredBy = {
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email
        };
        await deletedDoc.save();

        // Update workshop marking
        if (restoredInvoice.hasWorkshop && restoredInvoice.workshop) {
            const workshop = await Workshop.findOne({
                workshopId: restoredInvoice.workshop.workshopId,
                isDeleted: false
            });

            if (workshop) {
                const customerIndex = workshop.customers.findIndex(
                    c => c.customerId === restoredInvoice.customer.customerId
                );

                if (customerIndex !== -1) {
                    workshop.customers[customerIndex].invoiceCreated = true;
                    workshop.customers[customerIndex].invoiceId = restoredInvoice.invoiceId;
                    await workshop.save();
                }
            }
        }

        await logSuccess({
            module: 'Invoice',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Restore',
            heading: 'Invoice Restored Successfully',
            description: `Invoice ${restoredInvoice.invoiceNumber} restored from deleted records.`
        });

        res.status(200).json({
            message: "Invoice restored successfully",
            invoice: restoredInvoice.toObject(),
            deletedRecord: deletedDoc.toObject()
        });

    } catch (error) {
        console.error("Error restoring invoice:", error);

        await logFailed({
            module: 'Invoice',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Restore',
            heading: 'Invoice Restore Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to restore invoice",
            error: error.message
        });
    }
});

// ============================================
// GET INVOICE SUMMARY
// ============================================
router.get("/summary", auth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                message: "Start date and end date are required"
            });
        }

        const summary = await Invoice.getSummary(startDate, endDate);

        const paymentBreakdown = await Invoice.aggregate([
            {
                $match: {
                    invoiceDate: {
                        $gte: new Date(startDate),
                        $lte: new Date(endDate)
                    },
                    status: 'Active'
                }
            },
            {
                $group: {
                    _id: '$paymentStatus',
                    count: { $sum: 1 },
                    total: { $sum: '$grandTotal' }
                }
            }
        ]);

        res.status(200).json({
            summary,
            paymentBreakdown
        });

    } catch (error) {
        console.error("Error fetching invoice summary:", error);
        res.status(500).json({
            message: "Failed to fetch invoice summary",
            error: error.message
        });
    }
});

// ============================================
// GET INVOICES BY CUSTOMER
// ============================================
router.get("/customer/:customerId", auth, async (req, res) => {
    try {
        const { customerId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        const result = await Invoice.getByCustomer(customerId, parseInt(limit), parseInt(page));

        res.status(200).json(result);

    } catch (error) {
        console.error("Error fetching customer invoices:", error);
        res.status(500).json({
            message: "Failed to fetch customer invoices",
            error: error.message
        });
    }
});

// ============================================
// CANCEL INVOICE (Soft cancel - keeps invoice)
// ============================================
router.patch("/cancel/:invoiceId", auth, checkInvoicePermission, async (req, res) => {
    try {
        const { invoiceId } = req.params;

        const invoice = await Invoice.findOne({
            invoiceId: invoiceId,
            status: 'Active'
        });

        if (!invoice) {
            await logFailed({
                module: 'Invoice',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Cancel',
                heading: 'Invoice Cancellation Failed',
                description: 'Invoice not found'
            });
            return res.status(404).json({
                message: "Invoice not found"
            });
        }

        invoice.status = 'Cancelled';
        await invoice.save();

        await logSuccess({
            module: 'Invoice',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Cancel',
            heading: 'Invoice Cancelled Successfully',
            description: `Invoice ${invoice.invoiceNumber} cancelled`
        });

        res.status(200).json({
            message: "Invoice cancelled successfully",
            invoice: invoice.toObject()
        });

    } catch (error) {
        console.error("Error cancelling invoice:", error);

        await logFailed({
            module: 'Invoice',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Cancel',
            heading: 'Invoice Cancellation Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to cancel invoice",
            error: error.message
        });
    }
});


module.exports = router;