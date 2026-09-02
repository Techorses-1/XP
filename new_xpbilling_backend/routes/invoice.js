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
// HELPER: Reduce Multiple XP Oils
// ============================================
const reduceMultipleXPOils = async (xpOilItems, user, invoiceNumber) => {
    const results = [];
    let totalML = 0;

    for (const item of xpOilItems) {
        const { xpId, ml } = item;

        const xpOil = await XPInventory.findOne({ xpId });
        if (!xpOil) {
            throw new Error(`XP Oil not found: ${xpId}`);
        }

        const density = xpOil.density || 1000;
        const quantityInKG = ml / density;

        if (xpOil.quantity < quantityInKG) {
            throw new Error(
                `Insufficient stock for ${xpOil.productName}. Available: ${xpOil.quantity} KG, Required: ${quantityInKG} KG (${ml} ml)`
            );
        }

        const oldQuantity = xpOil.quantity;
        const newQuantity = oldQuantity - quantityInKG;

        xpOil.quantity = newQuantity;
        xpOil.updatedBy = {
            userId: user.userId,
            userName: user.name,
            userEmail: user.email
        };
        await xpOil.save();

        const transactionData = {
            transactionType: 'OUT',
            quantity: quantityInKG,
            purchasePrice: xpOil.avgPurchasePrice || 0,
            density: density,
            previousStock: oldQuantity,
            newStock: newQuantity,
            previousTotalQuantityAdded: xpOil.totalQuantityAdded,
            newTotalQuantityAdded: xpOil.totalQuantityAdded,
            previousTotalCost: xpOil.totalCost,
            newTotalCost: xpOil.totalCost,
            previousAvgPrice: xpOil.avgPurchasePrice,
            newAvgPrice: xpOil.avgPurchasePrice,
            reason: 'Invoice',
            notes: `Reduced ${ml} ml for invoice ${invoiceNumber}`,
            performedBy: {
                userId: user.userId,
                userName: user.name,
                userEmail: user.email
            }
        };

        await XPTransactions.addTransaction(xpOil.xpId, transactionData);

        results.push({
            xpId: xpOil.xpId,
            productName: xpOil.productName,
            ml: ml,
            quantityInKG: quantityInKG,
            oldQuantity,
            newQuantity
        });

        totalML += ml;
    }

    return { results, totalML };
};

// ============================================
// HELPER: Return Multiple XP Oils (IN)
// ============================================
const returnMultipleXPOils = async (xpOilItems, user, invoiceNumber) => {
    const results = [];
    let totalML = 0;

    for (const item of xpOilItems) {
        const { xpId, ml } = item;

        const xpOil = await XPInventory.findOne({ xpId });
        if (!xpOil) {
            throw new Error(`XP Oil not found: ${xpId}`);
        }

        const density = xpOil.density || 1000;
        const quantityInKG = ml / density;

        const oldQuantity = xpOil.quantity;
        const newQuantity = oldQuantity + quantityInKG;

        xpOil.quantity = newQuantity;
        xpOil.updatedBy = {
            userId: user.userId,
            userName: user.name,
            userEmail: user.email
        };
        await xpOil.save();

        const transactionData = {
            transactionType: 'IN',
            quantity: quantityInKG,
            purchasePrice: xpOil.avgPurchasePrice || 0,
            density: density,
            previousStock: oldQuantity,
            newStock: newQuantity,
            previousTotalQuantityAdded: xpOil.totalQuantityAdded,
            newTotalQuantityAdded: xpOil.totalQuantityAdded,
            previousTotalCost: xpOil.totalCost,
            newTotalCost: xpOil.totalCost,
            previousAvgPrice: xpOil.avgPurchasePrice,
            newAvgPrice: xpOil.avgPurchasePrice,
            reason: 'Invoice Return',
            notes: `Returned ${ml} ml for invoice ${invoiceNumber}`,
            performedBy: {
                userId: user.userId,
                userName: user.name,
                userEmail: user.email
            }
        };

        await XPTransactions.addTransaction(xpOil.xpId, transactionData);

        results.push({
            xpId: xpOil.xpId,
            productName: xpOil.productName,
            ml: ml,
            quantityInKG: quantityInKG,
            oldQuantity,
            newQuantity
        });

        totalML += ml;
    }

    return { results, totalML };
};

// ============================================
// HELPER: Reduce XP Oil (Single - Backward Compatible)
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
// HELPER: Return XP Oil (Single - Backward Compatible)
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
        throw new Error(`FRAGRANCE BASE not found in XP Inventory`);
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

router.post("/create", auth, checkInvoicePermission, async (req, res) => {
    console.log("\n========== 🚀 INVOICE CREATION STARTED ==========");
    console.log("📝 Request Body:", JSON.stringify(req.body, null, 2));

    try {
        // ============================================
        // ✅ GENERATE INVOICE NUMBER AT THE START
        // ============================================
        const now = new Date();
        const year = now.getFullYear();
        const random = Math.floor(1000 + Math.random() * 9000);
        const invoiceNumber = `INV${year}${random}`;
        console.log("📄 Generated Invoice Number:", invoiceNumber);

        const {
            customerId,
            workshopId,
            packageId,
            xpOilItems,
            dispenserItems,
            packageDiscount,
            promoCode,
            paymentStatus,
            invoiceDate,
            notes,
            loyaltyCoinsUsed = 0
        } = req.body;

        console.log("\n📋 Request Data:");
        console.log("  👤 Customer ID:", customerId);
        console.log("  🏭 Workshop ID:", workshopId);
        console.log("  📦 Package ID:", packageId);
        console.log("  🧪 XP Oil Items:", xpOilItems?.length || 0);
        console.log("  💧 Dispenser Items:", dispenserItems?.length || 0);
        console.log("  🏷️ Promo Code:", promoCode);
        console.log("  💳 Payment:", paymentStatus);
        console.log("  🪙 Loyalty Coins Used:", loyaltyCoinsUsed);

        // ============================================
        // 1. VALIDATE CUSTOMER
        // ============================================
        console.log("\n🔍 Step 1: Validating Customer...");

        if (!customerId) {
            console.log("❌ Customer ID missing");
            await logFailed({
                module: 'Invoice',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create',
                heading: 'Invoice Creation Failed',
                description: 'Customer is required'
            });
            return res.status(400).json({
                message: "Customer is required"
            });
        }

        const customer = await Customer.findOne({ customerId });
        if (!customer) {
            console.log("❌ Customer not found:", customerId);
            await logFailed({
                module: 'Invoice',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Create',
                heading: 'Invoice Creation Failed',
                description: 'Customer not found'
            });
            return res.status(404).json({
                message: "Customer not found"
            });
        }
        console.log("✅ Customer found:", customer.customerName, "|", customer.contactNumber);
        console.log("  🪙 Customer Loyalty Coins:", customer.loyaltyCoins || 0);

        // ============================================
        // 1a. VALIDATE LOYALTY COINS USAGE
        // ============================================
        if (loyaltyCoinsUsed > 0) {
            const availableCoins = customer.loyaltyCoins || 0;
            const usableCoins = Math.max(0, availableCoins - 50);

            if (loyaltyCoinsUsed > usableCoins) {
                console.log(`❌ Insufficient loyalty coins. Available: ${availableCoins}, Usable: ${usableCoins}, Requested: ${loyaltyCoinsUsed}`);
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: `Insufficient loyalty coins. Available: ${availableCoins}, Usable: ${usableCoins}`
                });
                return res.status(400).json({
                    message: `Insufficient loyalty coins. Available: ${availableCoins}, You need to keep minimum 50 coins. Usable: ${usableCoins}`
                });
            }
            console.log(`  ✅ Loyalty coins validation passed. Using: ${loyaltyCoinsUsed} coins`);
        }

        // ============================================
        // 2. GET WORKSHOP (if provided)
        // ============================================
        console.log("\n🔍 Step 2: Checking Workshop...");
        let workshopData = null;
        let hasWorkshop = false;
        let selectedWorkshop = null;

        if (workshopId) {
            console.log("  🏭 Workshop ID provided:", workshopId);
            selectedWorkshop = await Workshop.findOne({
                workshopId: workshopId,
                isDeleted: false
            });
            if (!selectedWorkshop) {
                console.log("❌ Workshop not found:", workshopId);
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: 'Workshop not found'
                });
                return res.status(404).json({
                    message: "Workshop not found"
                });
            }

            const customerInWorkshop = selectedWorkshop.customers.find(
                c => c.customerId === customerId
            );

            if (!customerInWorkshop) {
                console.log("❌ Customer not in workshop:", customerId);
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: 'Customer not found in this workshop'
                });
                return res.status(400).json({
                    message: "Customer not found in this workshop"
                });
            }
            console.log("✅ Customer found in workshop");
            console.log("  📅 Workshop Date:", selectedWorkshop.date);
            console.log("  🕐 Workshop Time:", selectedWorkshop.startTime, "-", selectedWorkshop.endTime);

            workshopData = {
                workshopId: selectedWorkshop.workshopId,
                date: selectedWorkshop.date,
                startTime: selectedWorkshop.startTime,
                endTime: selectedWorkshop.endTime
            };
            hasWorkshop = true;
        } else {
            console.log("  ℹ️ No workshop provided");
        }

        // ============================================
        // 3. GET PACKAGE & VALIDATE MULTIPLE XP OILS
        // ============================================
        console.log("\n🔍 Step 3: Checking Package & XP Oils...");
        let packageData = null;
        let hasPackage = false;
        let selectedPackage = null;
        let packageFinalPrice = 0;
        let packageDiscountAmount = 0;
        let validatedXPOils = [];

        if (packageId) {
            console.log("  📦 Package ID provided:", packageId);
            selectedPackage = await Package.findOne({ packageId, isActive: true });
            if (!selectedPackage) {
                console.log("❌ Package not found or inactive:", packageId);
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: 'Package not found or inactive'
                });
                return res.status(404).json({
                    message: "Package not found or inactive"
                });
            }

            const xpOilItemsFromRequest = xpOilItems || [];

            if (!xpOilItemsFromRequest || xpOilItemsFromRequest.length === 0) {
                console.log("❌ No XP Oil items provided");
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: 'At least one XP Oil is required when package is selected'
                });
                return res.status(400).json({
                    message: "At least one XP Oil is required when package is selected"
                });
            }

            let totalXPMl = 0;

            for (const xpItem of xpOilItemsFromRequest) {
                const { xpId, ml } = xpItem;

                if (!xpId) {
                    console.log("❌ XP Oil ID missing for an item");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: 'XP Oil ID is required for each oil'
                    });
                    return res.status(400).json({
                        message: "XP Oil ID is required for each oil"
                    });
                }

                if (!ml || parseFloat(ml) <= 0) {
                    console.log("❌ Invalid ML for XP Oil:", ml);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: 'ML must be greater than 0 for each XP Oil'
                    });
                    return res.status(400).json({
                        message: "ML must be greater than 0 for each XP Oil"
                    });
                }

                const xpOil = await XPInventory.findOne({ xpId });
                if (!xpOil) {
                    console.log("❌ XP Oil not found:", xpId);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: `XP Oil not found: ${xpId}`
                    });
                    return res.status(404).json({
                        message: `XP Oil not found: ${xpId}`
                    });
                }

                const mlValue = parseFloat(ml);
                totalXPMl += mlValue;

                validatedXPOils.push({
                    xpId: xpOil.xpId,
                    productName: xpOil.productName,
                    ml: mlValue,
                    quantityInKG: mlValue / (xpOil.density || 1000),
                    density: xpOil.density || 1000,
                    pricePerKG: xpOil.avgPurchasePrice || 0
                });

                console.log(`  ✅ XP Oil: ${xpOil.productName}, ML: ${mlValue}ml`);
            }

            console.log(`  📊 Total XP ML: ${totalXPMl}ml`);
            console.log(`  📦 Package Fragrance Qty: ${selectedPackage.fragranceQty}ml`);

            const packageFragranceML = selectedPackage.fragranceQty;
            const tolerance = 0.01;

            if (Math.abs(totalXPMl - packageFragranceML) > tolerance) {
                console.log(`❌ XP Oil total (${totalXPMl}ml) does not match package fragrance (${packageFragranceML}ml)`);
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: `Total XP Oil (${totalXPMl}ml) does not match package fragrance (${packageFragranceML}ml)`
                });
                return res.status(400).json({
                    message: `Total XP Oil (${totalXPMl}ml) does not match package fragrance (${packageFragranceML}ml). Please adjust the ML quantities.`
                });
            }

            console.log("  ✅ XP Oil total matches package fragrance quantity");

            // Check Alcohol stock
            const alcoholKG = selectedPackage.alcoholQty / 820;
            console.log("  🍷 Fragrance Base Required:", selectedPackage.alcoholQty, "ml (", alcoholKG, "KG)");
            const alcoholProduct = await XPInventory.findOne({
                productName: "FRAGRANCE BASE"
            });

            if (!alcoholProduct) {
                console.log("❌ FRAGRANCE BASE not found");
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: 'FRAGRANCE BASE not found in inventory'
                });
                return res.status(404).json({
                    message: "FRAGRANCE BASE not found in inventory"
                });
            }

            if (alcoholProduct.quantity < alcoholKG) {
                console.log("❌ Insufficient Fragrance Base stock. Available:", alcoholProduct.quantity, "KG, Required:", alcoholKG, "KG");
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: `Insufficient Alcohol stock. Available: ${alcoholProduct.quantity} KG, Required: ${alcoholKG} KG (${selectedPackage.alcoholQty} ML)`
                });
                return res.status(400).json({
                    message: `Insufficient Alcohol stock. Available: ${alcoholProduct.quantity} KG, Required: ${alcoholKG} KG (${selectedPackage.alcoholQty} ML)`
                });
            }
            console.log("  ✅ Alcohol stock sufficient");

            // Check Bottles Inventory for package
            const mlSize = selectedPackage.bottleML.toString();
            console.log("  🧴 Bottle ML:", mlSize, "ml");
            const bottleItems = ['Bottle', 'Cap', 'Pump', 'Box'];
            for (const itemType of bottleItems) {
                const bottleStock = await BottlesInventory.findOne({ mlSize, itemType });
                if (!bottleStock || bottleStock.quantity < 1) {
                    console.log(`❌ Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}`);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: `Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}`
                    });
                    return res.status(400).json({
                        message: `Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}`
                    });
                }
                console.log(`  ✅ ${itemType}: ${bottleStock.quantity} available`);
            }

            const packageDiscountPercent = packageDiscount !== undefined ? packageDiscount : selectedPackage.discount || 0;
            packageDiscountAmount = (selectedPackage.pricing * packageDiscountPercent) / 100;
            packageFinalPrice = selectedPackage.pricing - packageDiscountAmount;
            console.log("  💰 Package Original Price:", selectedPackage.pricing);
            console.log("  💰 Package Discount:", packageDiscountPercent, "% (₹", packageDiscountAmount, ")");
            console.log("  💰 Package Final Price:", packageFinalPrice);

            packageData = {
                packageId: selectedPackage.packageId,
                packageName: selectedPackage.packageName,
                pricing: selectedPackage.pricing,
                oilCount: selectedPackage.oilCount,
                discount: packageDiscountPercent,
                discountAmount: packageDiscountAmount,
                finalPrice: packageFinalPrice,
                bottleML: selectedPackage.bottleML,
                fillingLevel: selectedPackage.fillingLevel,
                fragranceQty: selectedPackage.fragranceQty,
                alcoholQty: selectedPackage.alcoholQty,
                xpOilItems: validatedXPOils,
                xpOil: validatedXPOils.length > 0 ? {
                    xpId: validatedXPOils[0].xpId,
                    productName: validatedXPOils[0].productName,
                    quantity: validatedXPOils[0].quantityInKG,
                    density: validatedXPOils[0].density
                } : null
            };
            hasPackage = true;
            console.log("  ✅ Package data prepared with", validatedXPOils.length, "XP Oils");
        } else {
            console.log("  ℹ️ No package provided");
        }

        // ============================================
        // 4. VALIDATE DISPENSER ITEMS - WITH XP ID
        // ============================================
        console.log("\n🔍 Step 4: Validating Dispenser Items...");
        let dispenserItemsData = [];
        let hasDispenser = false;
        let dispenserSubtotal = 0;
        let totalDispenserDiscount = 0;

        if (dispenserItems && dispenserItems.length > 0) {
            console.log("  💧 Dispenser Items Count:", dispenserItems.length);
            for (const item of dispenserItems) {
                const { xpId, ml, quantity, unitPrice, discount } = item;
                console.log(`  📦 Item: XP ID: ${xpId} | ML: ${ml} | Qty: ${quantity} | Unit Price: ${unitPrice} | Discount: ${discount}%`);

                if (!xpId || !ml || !quantity) {
                    console.log("❌ Missing dispenser item fields");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: 'XP ID, ML, and quantity are required for each dispenser item'
                    });
                    return res.status(400).json({
                        message: "XP ID, ML, and quantity are required for each dispenser item"
                    });
                }

                if (![3, 6].includes(ml)) {
                    console.log("❌ Invalid ML:", ml, "Must be 3 or 6");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: 'ML must be 3 or 6'
                    });
                    return res.status(400).json({
                        message: "ML must be 3 or 6"
                    });
                }

                if (quantity < 1) {
                    console.log("❌ Invalid quantity:", quantity, "Must be at least 1");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: 'Quantity must be at least 1'
                    });
                    return res.status(400).json({
                        message: "Quantity must be at least 1"
                    });
                }

                // ✅ CHANGED: Find XPInventory using xpId (not dispenserId)
                const xpOil = await XPInventory.findOne({ xpId });
                if (!xpOil) {
                    console.log("❌ XP Oil not found:", xpId);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: `XP Oil not found: ${xpId}`
                    });
                    return res.status(404).json({
                        message: `XP Oil not found: ${xpId}`
                    });
                }
                console.log(`  ✅ XP Oil found: ${xpOil.productName}`);

                const totalML = ml * quantity;
                const requiredKG = totalML / 1000;
                console.log(`  📊 Total ML: ${totalML}ml | Required KG: ${requiredKG}KG`);
                console.log(`  📦 Current Stock: ${xpOil.quantity}KG`);

                if (xpOil.quantity < requiredKG) {
                    console.log(`❌ Insufficient stock. Available: ${xpOil.quantity}KG, Required: ${requiredKG}KG`);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: `Insufficient stock for ${xpOil.productName}. Available: ${xpOil.quantity} KG, Required: ${requiredKG} KG (${totalML} ML)`
                    });
                    return res.status(400).json({
                        message: `Insufficient stock for ${xpOil.productName}. Available: ${xpOil.quantity} KG, Required: ${requiredKG} KG (${totalML} ML)`
                    });
                }
                console.log(`  ✅ Stock sufficient`);

                // Check Bottles Inventory for dispenser
                const mlSize = ml.toString();
                const bottleItems = ['Bottle', 'Cap', 'Pump', 'Box'];
                for (const itemType of bottleItems) {
                    const bottleStock = await BottlesInventory.findOne({ mlSize, itemType });
                    if (!bottleStock || bottleStock.quantity < quantity) {
                        console.log(`❌ Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}, Required: ${quantity}`);
                        await logFailed({
                            module: 'Invoice',
                            userId: req.user.userId,
                            userName: req.user.name,
                            userEmail: req.user.email,
                            action: 'Create',
                            heading: 'Invoice Creation Failed',
                            description: `Insufficient ${mlSize}ml ${itemType} stock for dispenser. Available: ${bottleStock?.quantity || 0}, Required: ${quantity}`
                        });
                        return res.status(400).json({
                            message: `Insufficient ${mlSize}ml ${itemType} stock for dispenser. Available: ${bottleStock?.quantity || 0}, Required: ${quantity}`
                        });
                    }
                    console.log(`  ✅ ${itemType}: ${bottleStock.quantity} available`);
                }

                // ✅ Get selling prices from XPInventory
                const dbPrice = ml === 3 ? xpOil.sellingPrice3ml : xpOil.sellingPrice6ml;
                const baseUnitPrice = unitPrice !== undefined && unitPrice > 0 ? unitPrice : dbPrice;

                // ✅ Calculate using existing schema fields
                const itemDiscountPercent = discount !== undefined ? discount : 0;
                const originalTotal = baseUnitPrice * quantity;
                const discountAmount = (originalTotal * itemDiscountPercent) / 100;
                const finalPrice = originalTotal - discountAmount;

                console.log(`  💰 DB Price: ₹${dbPrice}/ml`);
                console.log(`  💰 Using Unit Price: ₹${baseUnitPrice}/ml`);
                console.log(`  💰 Original Total: ₹${originalTotal}`);
                console.log(`  💰 Discount: ${itemDiscountPercent}% (₹${discountAmount})`);
                console.log(`  💰 Final Price: ₹${finalPrice}`);

                dispenserItemsData.push({
                    // ✅ CHANGED: Store xpId (not dispenserId)
                    xpId: xpOil.xpId,
                    productName: xpOil.productName,
                    ml: ml,
                    quantity: quantity,
                    unitPrice: baseUnitPrice,
                    sellingPrice3ml: xpOil.sellingPrice3ml || 0,
                    sellingPrice6ml: xpOil.sellingPrice6ml || 0,
                    discount: itemDiscountPercent,
                    discountAmount: discountAmount,
                    originalPrice: originalTotal,
                    finalPrice: finalPrice,
                    totalML: totalML
                });

                dispenserSubtotal += finalPrice;
                totalDispenserDiscount += discountAmount;
                hasDispenser = true;

                // ✅ REDUCE XP Inventory - USING invoiceNumber (defined at the start)
                await reduceXPOil(
                    xpOil.xpId,
                    totalML, // quantity in ml
                    req.user,
                    'Invoice - Dispenser',
                    `Reduced for invoice ${invoiceNumber} (${xpOil.productName}: ${ml}ml × ${quantity})`
                );

            }
            console.log("  ✅ All dispenser items validated and inventory reduced");
        } else {
            console.log("  ℹ️ No dispenser items provided");
        }

        // ============================================
        // 5. CALCULATE SUBTOTAL
        // ============================================
        const subtotal = packageFinalPrice + dispenserSubtotal;
        console.log("\n💰 SUBTOTAL CALCULATION:");
        console.log("  📦 Package Final: ₹", packageFinalPrice);
        console.log("  💧 Dispenser Final: ₹", dispenserSubtotal);
        console.log("  💰 Subtotal (incl. GST): ₹", subtotal);

        // ============================================
        // 6. VALIDATE PROMO CODE
        // ============================================
        console.log("\n🔍 Step 6: Validating Promo Code...");
        let promoData = null;
        let hasPromo = false;
        let promoDiscountAmount = 0;

        if (promoCode) {
            console.log("  🏷️ Promo Code:", promoCode);
            const promo = await PromoCode.findOne({
                code: promoCode.toUpperCase(),
                isActive: true,
                isExpired: false
            });

            if (!promo) {
                console.log("❌ Invalid or expired promo code:", promoCode);
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: 'Invalid or expired promo code'
                });
                return res.status(400).json({
                    message: "Invalid or expired promo code"
                });
            }

            const now = new Date();
            if (promo.startDate > now || promo.endDate < now) {
                console.log("❌ Promo code not active for current date");
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: 'Promo code not active for current date'
                });
                return res.status(400).json({
                    message: "Promo code not active for current date"
                });
            }

            const subtotalWithoutGST = subtotal / (1 + GST_RATE / 100);
            promoDiscountAmount = (subtotalWithoutGST * promo.discount) / 100;
            console.log(`  ✅ Promo valid: ${promo.code} | ${promo.discount}% discount`);
            console.log(`  💰 Promo Discount Amount: ₹${promoDiscountAmount}`);

            promoData = {
                promoId: promo.promoId,
                code: promo.code,
                discount: promo.discount,
                discountAmount: promoDiscountAmount
            };
            hasPromo = true;
        } else {
            console.log("  ℹ️ No promo code provided");
        }

        // ============================================
        // 7. CALCULATE FINAL TOTALS WITH LOYALTY COINS
        // ============================================
        console.log("\n💰 FINAL CALCULATIONS:");

        const subtotalWithoutGST = subtotal / (1 + GST_RATE / 100);
        console.log("  💰 Subtotal WITHOUT GST: ₹", subtotalWithoutGST);

        let afterPromo = subtotalWithoutGST;
        if (hasPromo) {
            afterPromo = subtotalWithoutGST - promoDiscountAmount;
            console.log("  💰 After Promo: ₹", afterPromo);
        }

        let loyaltyDiscountAmount = 0;
        let actualLoyaltyCoinsUsed = 0;

        if (loyaltyCoinsUsed > 0) {
            loyaltyDiscountAmount = Math.min(loyaltyCoinsUsed, afterPromo);
            actualLoyaltyCoinsUsed = Math.floor(loyaltyDiscountAmount);
            afterPromo = afterPromo - loyaltyDiscountAmount;
            console.log(`  🪙 Loyalty Coins Used: ${actualLoyaltyCoinsUsed} coins (₹${loyaltyDiscountAmount})`);
            console.log("  💰 After Loyalty: ₹", afterPromo);
        }

        const gstAmount = afterPromo * (GST_RATE / 100);
        console.log("  💰 GST (", GST_RATE, "% ): ₹", gstAmount);

        const grandTotal = afterPromo + gstAmount;
        console.log("  💰 GRAND TOTAL: ₹", grandTotal);

        const loyaltyCoinsEarned = Math.floor(afterPromo / 100);
        console.log("  🪙 Loyalty Coins EARNED:", loyaltyCoinsEarned);

        const totalDiscountAmount = packageDiscountAmount + totalDispenserDiscount + promoDiscountAmount + loyaltyDiscountAmount;
        console.log("  💰 Total Discount: ₹", totalDiscountAmount);

        // ============================================
        // 8. UPDATE CUSTOMER LOYALTY COINS
        // ============================================
        console.log("\n🔍 Step 8: Updating Customer Loyalty Coins...");
        let currentCoins = customer.loyaltyCoins || 0;
        const previousBalance = currentCoins;

        if (actualLoyaltyCoinsUsed > 0) {
            currentCoins = Math.max(0, currentCoins - actualLoyaltyCoinsUsed);
            console.log(`  🔻 Deducted ${actualLoyaltyCoinsUsed} coins used`);
        }

        if (loyaltyCoinsEarned > 0) {
            currentCoins = currentCoins + loyaltyCoinsEarned;
            console.log(`  🔺 Added ${loyaltyCoinsEarned} coins earned`);
        }

        customer.loyaltyCoins = currentCoins;
        await customer.save();
        console.log(`  ✅ Customer loyalty coins updated: ${previousBalance} → ${currentCoins}`);

        // ============================================
        // 9. CREATE INVOICE
        // ============================================
        console.log("\n📝 Step 9: Creating Invoice...");
        const invoice = new Invoice({
            customer: {
                customerId: customer.customerId,
                customerName: customer.customerName,
                email: customer.email || '',
                contactNumber: customer.contactNumber,
                loyaltyCoins: currentCoins
            },
            workshop: workshopData,
            hasWorkshop: hasWorkshop,
            packageItem: packageData,
            hasPackage: hasPackage,
            dispenserItems: dispenserItemsData,
            hasDispenser: hasDispenser,
            promoApplied: promoData,
            hasPromo: hasPromo,
            loyaltyCoinsEarned: loyaltyCoinsEarned,
            loyaltyCoinsUsed: actualLoyaltyCoinsUsed,
            loyaltyDiscountAmount: loyaltyDiscountAmount,
            subtotal: subtotal,
            subtotalWithoutGST: subtotalWithoutGST,
            gstRate: GST_RATE,
            gstAmount: gstAmount,
            packageDiscountAmount: packageDiscountAmount,
            dispenserDiscountAmount: totalDispenserDiscount,
            promoDiscount: promoDiscountAmount,
            totalDiscountAmount: totalDiscountAmount,
            grandTotal: grandTotal,
            paymentStatus: paymentStatus || 'Cash',
            invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
            notes: notes || '',
            createdBy: {
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email
            },
            status: 'Active'
        });

        await invoice.save();
        console.log("✅ Invoice created with ID:", invoice.invoiceId);
        console.log("✅ Invoice Number:", invoice.invoiceNumber);

        // ============================================
        // 10. UPDATE WORKSHOP
        // ============================================
        console.log("\n🔍 Step 10: Updating Workshop...");
        if (hasWorkshop && selectedWorkshop) {
            const customerIndex = selectedWorkshop.customers.findIndex(
                c => c.customerId === customerId
            );

            if (customerIndex !== -1) {
                if (selectedWorkshop.customers[customerIndex].invoiceCreated === true) {
                    console.log("❌ Customer already invoiced for this workshop");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: 'Customer already invoiced for this workshop'
                    });
                    return res.status(400).json({
                        message: "Customer already has an invoice for this workshop"
                    });
                }

                selectedWorkshop.customers[customerIndex].invoiceCreated = true;
                selectedWorkshop.customers[customerIndex].invoiceId = invoice.invoiceId;

                await selectedWorkshop.save();
                console.log(`✅ Customer ${customer.customerName} marked as invoiced in workshop ${selectedWorkshop.workshopId}`);
            }
        } else {
            console.log("  ℹ️ No workshop to update");
        }

        // ============================================
        // 11. REDUCE PACKAGE INVENTORIES (XP Oils, Alcohol, Bottles)
        // ============================================
        console.log("\n🔍 Step 11: Reducing Package Inventories...");
        const inventoryUpdates = [];

        if (hasPackage) {
            console.log("  📦 Reducing Package Inventories...");

            const xpResult = await reduceMultipleXPOils(
                validatedXPOils,
                req.user,
                invoice.invoiceNumber
            );
            inventoryUpdates.push({ type: 'XP Oils - Multiple', details: xpResult.results });
            console.log(`  ✅ ${xpResult.results.length} XP Oils reduced: ${xpResult.totalML}ml total`);

            const alcoholResult = await reduceAlcohol(
                selectedPackage.alcoholQty,
                req.user,
                'Invoice - Fragrance Base',
                `Reduced for invoice ${invoice.invoiceNumber} (Fragrance Base: ${selectedPackage.alcoholQty}ml)`
            );
            inventoryUpdates.push({ type: 'FRAGRANCE BASE', details: alcoholResult });
            console.log(`  ✅ Fragrance Base reduced: ${selectedPackage.alcoholQty}ml`);

            const mlSize = selectedPackage.bottleML.toString();
            const bottleResult = await reduceBottlesInventory(
                mlSize,
                1,
                req.user,
                'Invoice - Package',
                `Reduced for invoice ${invoice.invoiceNumber} (Package: ${selectedPackage.packageName})`
            );
            inventoryUpdates.push({ type: 'Bottles - Package', details: bottleResult });
            console.log(`  ✅ Bottles reduced: ${mlSize}ml`);
        }

        // ============================================
        // 12. LOG SUCCESS
        // ============================================
        console.log("\n✅ INVOICE CREATION COMPLETED SUCCESSFULLY");
        console.log(`📄 Invoice: ${invoice.invoiceNumber} | Total: ₹${grandTotal.toFixed(2)}`);
        console.log(`🪙 Loyalty: ${loyaltyCoinsEarned} earned | ${actualLoyaltyCoinsUsed} used`);
        console.log("==========================================\n");

        await logSuccess({
            module: 'Invoice',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Create',
            heading: 'Invoice Created Successfully',
            description: `Invoice ${invoice.invoiceNumber} created for ${customer.customerName}. Total: ₹${grandTotal.toFixed(2)}`
        });

        res.status(201).json({
            message: "Invoice created successfully",
            invoice: invoice.toObject(),
            inventoryUpdates: inventoryUpdates,
            loyaltyCoins: {
                earned: loyaltyCoinsEarned,
                used: actualLoyaltyCoinsUsed,
                newBalance: currentCoins,
                previousBalance: previousBalance
            },
            calculations: {
                packageOriginal: hasPackage ? selectedPackage.pricing : 0,
                packageDiscountPercent: hasPackage ? selectedPackage.discount : 0,
                packageDiscountAmount: packageDiscountAmount,
                packageFinal: packageFinalPrice,
                dispenserSubtotal: dispenserSubtotal,
                dispenserDiscountTotal: totalDispenserDiscount,
                subtotal: subtotal,
                subtotalWithoutGST: subtotalWithoutGST,
                promoDiscount: promoDiscountAmount,
                loyaltyDiscount: loyaltyDiscountAmount,
                gstAmount: gstAmount,
                totalDiscount: totalDiscountAmount,
                grandTotal: grandTotal
            }
        });

    } catch (error) {
        console.error("\n❌ INVOICE CREATION FAILED:");
        console.error("Error:", error);
        console.error("Stack:", error.stack);
        console.log("==========================================\n");

        await logFailed({
            module: 'Invoice',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Create',
            heading: 'Invoice Creation Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to create invoice",
            error: error.message
        });
    }
});

// ============================================
// UPDATE INVOICE - WITH EDITABLE DISPENSER PRICE
// ============================================

router.put("/update/:invoiceId", auth, checkInvoicePermission, async (req, res) => {
    console.log("\n========== 🔄 INVOICE UPDATE STARTED ==========");
    console.log("📝 Invoice ID:", req.params.invoiceId);
    console.log("📝 Request Body:", JSON.stringify(req.body, null, 2));

    try {
        const { invoiceId } = req.params;
        const {
            packageId,
            xpOilItems,
            packageDiscount,
            dispenserItems,
            promoCode,
            paymentStatus,
            invoiceDate,
            notes
        } = req.body;

        console.log("\n📋 Update Data:");
        console.log("  📦 Package ID:", packageId);
        console.log("  🧪 XP Oil Items:", xpOilItems?.length || 0);
        console.log("  💰 Package Discount:", packageDiscount);
        console.log("  💧 Dispenser Items:", dispenserItems?.length || 0);
        console.log("  🏷️ Promo Code:", promoCode);
        console.log("  💳 Payment:", paymentStatus);

        // ============================================
        // 1. GET ORIGINAL INVOICE
        // ============================================
        console.log("\n🔍 Step 1: Fetching Original Invoice...");
        const originalInvoice = await Invoice.findOne({
            invoiceId: invoiceId,
            status: 'Active'
        });

        if (!originalInvoice) {
            console.log("❌ Invoice not found:", invoiceId);
            await logFailed({
                module: 'Invoice',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Update',
                heading: 'Invoice Update Failed',
                description: 'Invoice not found'
            });
            return res.status(404).json({
                message: "Invoice not found"
            });
        }

        console.log("✅ Original Invoice found:", originalInvoice.invoiceNumber);
        console.log("  👤 Customer:", originalInvoice.customer.customerName);
        console.log("  💰 Original Total: ₹", originalInvoice.grandTotal);
        console.log("  🪙 Original Loyalty - Earned:", originalInvoice.loyaltyCoinsEarned || 0);
        console.log("  🪙 Original Loyalty - Used:", originalInvoice.loyaltyCoinsUsed || 0);

        const invoiceNumber = originalInvoice.invoiceNumber;
        const customer = await Customer.findOne({ customerId: originalInvoice.customer.customerId });

        const originalLoyaltyEarned = originalInvoice.loyaltyCoinsEarned || 0;
        const originalLoyaltyUsed = originalInvoice.loyaltyCoinsUsed || 0;

        // ============================================
        // 2. TRACK CHANGES
        // ============================================
        console.log("\n🔍 Step 2: Tracking Changes...");
        const changes = {
            package: { old: originalInvoice.packageItem, new: null },
            xpOilItems: { old: originalInvoice.packageItem?.xpOilItems || [], new: [] },
            dispenser: { old: originalInvoice.dispenserItems, new: [] }
        };

        console.log("  📦 Original Package:", originalInvoice.hasPackage ? originalInvoice.packageItem?.packageName : "None");
        console.log("  🧪 Original XP Oils:", originalInvoice.packageItem?.xpOilItems?.length || 0);
        console.log("  💧 Original Dispensers:", originalInvoice.dispenserItems?.length || 0);

        // ============================================
        // 3. HANDLE PACKAGE CHANGES
        // ============================================
        console.log("\n🔍 Step 3: Handling Package Changes...");
        let newPackageData = null;
        let hasPackage = false;
        let selectedPackage = null;
        let packageFinalPrice = 0;
        let packageDiscountAmount = 0;
        let validatedXPOils = [];

        if (packageId) {
            console.log("  📦 New Package ID:", packageId);
            selectedPackage = await Package.findOne({ packageId, isActive: true });
            if (!selectedPackage) {
                console.log("❌ Package not found or inactive:", packageId);
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Invoice Update Failed',
                    description: 'Package not found or inactive'
                });
                return res.status(404).json({
                    message: "Package not found or inactive"
                });
            }
            console.log("  ✅ New Package found:", selectedPackage.packageName);

            const xpOilItemsFromRequest = xpOilItems || [];

            if (!xpOilItemsFromRequest || xpOilItemsFromRequest.length === 0) {
                console.log("❌ No XP Oil items provided");
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Invoice Update Failed',
                    description: 'At least one XP Oil is required when package is selected'
                });
                return res.status(400).json({
                    message: "At least one XP Oil is required when package is selected"
                });
            }

            let totalXPMl = 0;

            for (const xpItem of xpOilItemsFromRequest) {
                const { xpId, ml } = xpItem;

                if (!xpId) {
                    console.log("❌ XP Oil ID missing for an item");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: 'XP Oil ID is required for each oil'
                    });
                    return res.status(400).json({
                        message: "XP Oil ID is required for each oil"
                    });
                }

                if (!ml || parseFloat(ml) <= 0) {
                    console.log("❌ Invalid ML for XP Oil:", ml);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: 'ML must be greater than 0 for each XP Oil'
                    });
                    return res.status(400).json({
                        message: "ML must be greater than 0 for each XP Oil"
                    });
                }

                const xpOil = await XPInventory.findOne({ xpId });
                if (!xpOil) {
                    console.log("❌ XP Oil not found:", xpId);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: `XP Oil not found: ${xpId}`
                    });
                    return res.status(404).json({
                        message: `XP Oil not found: ${xpId}`
                    });
                }

                const mlValue = parseFloat(ml);
                totalXPMl += mlValue;

                validatedXPOils.push({
                    xpId: xpOil.xpId,
                    productName: xpOil.productName,
                    ml: mlValue,
                    quantityInKG: mlValue / (xpOil.density || 1000),
                    density: xpOil.density || 1000,
                    pricePerKG: xpOil.avgPurchasePrice || 0
                });

                console.log(`  ✅ XP Oil: ${xpOil.productName}, ML: ${mlValue}ml`);
            }

            console.log(`  📊 Total XP ML: ${totalXPMl}ml`);
            console.log(`  📦 Package Fragrance Qty: ${selectedPackage.fragranceQty}ml`);

            const packageFragranceML = selectedPackage.fragranceQty;
            const tolerance = 0.01;

            if (Math.abs(totalXPMl - packageFragranceML) > tolerance) {
                console.log(`❌ XP Oil total (${totalXPMl}ml) does not match package fragrance (${packageFragranceML}ml)`);
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Invoice Update Failed',
                    description: `Total XP Oil (${totalXPMl}ml) does not match package fragrance (${packageFragranceML}ml)`
                });
                return res.status(400).json({
                    message: `Total XP Oil (${totalXPMl}ml) does not match package fragrance (${packageFragranceML}ml). Please adjust the ML quantities.`
                });
            }

            console.log("  ✅ XP Oil total matches package fragrance quantity");

            const alcoholKG = selectedPackage.alcoholQty / 820;
            console.log("  🍷 Fragrance Base Required:", selectedPackage.alcoholQty, "ml (", alcoholKG, "KG)");
            const alcoholProduct = await XPInventory.findOne({
                productName: "FRAGRANCE BASE"
            });

            if (!alcoholProduct) {
                console.log("❌ FRAGRANCE BASE not found");
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Invoice Update Failed',
                    description: 'FRAGRANCE BASE not found in inventory'
                });
                return res.status(404).json({
                    message: "FRAGRANCE BASE not found in inventory"
                });
            }

            if (alcoholProduct.quantity < alcoholKG) {
                console.log("❌ Insufficient Fragrance Base stock. Available:", alcoholProduct.quantity, "KG, Required:", alcoholKG, "KG");
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Invoice Update Failed',
                    description: `Insufficient Alcohol stock. Available: ${alcoholProduct.quantity} KG, Required: ${alcoholKG} KG (${selectedPackage.alcoholQty} ML)`
                });
                return res.status(400).json({
                    message: `Insufficient Alcohol stock. Available: ${alcoholProduct.quantity} KG, Required: ${alcoholKG} KG (${selectedPackage.alcoholQty} ML)`
                });
            }
            console.log("  ✅ Alcohol stock sufficient");

            const mlSize = selectedPackage.bottleML.toString();
            console.log("  🧴 Bottle ML:", mlSize, "ml");
            const bottleItems = ['Bottle', 'Cap', 'Pump', 'Box'];
            for (const itemType of bottleItems) {
                const bottleStock = await BottlesInventory.findOne({ mlSize, itemType });
                if (!bottleStock || bottleStock.quantity < 1) {
                    console.log(`❌ Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}`);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: `Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}`
                    });
                    return res.status(400).json({
                        message: `Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}`
                    });
                }
                console.log(`  ✅ ${itemType}: ${bottleStock.quantity} available`);
            }

            const discountPercent = packageDiscount !== undefined ? packageDiscount : selectedPackage.discount || 0;
            packageDiscountAmount = (selectedPackage.pricing * discountPercent) / 100;
            packageFinalPrice = selectedPackage.pricing - packageDiscountAmount;

            console.log("  💰 Package Original Price:", selectedPackage.pricing);
            console.log("  💰 Package Discount:", discountPercent, "% (₹", packageDiscountAmount, ")");
            console.log("  💰 Package Final Price:", packageFinalPrice);

            newPackageData = {
                packageId: selectedPackage.packageId,
                packageName: selectedPackage.packageName,
                pricing: selectedPackage.pricing,
                oilCount: selectedPackage.oilCount,
                discount: discountPercent,
                discountAmount: packageDiscountAmount,
                finalPrice: packageFinalPrice,
                bottleML: selectedPackage.bottleML,
                fillingLevel: selectedPackage.fillingLevel,
                fragranceQty: selectedPackage.fragranceQty,
                alcoholQty: selectedPackage.alcoholQty,
                xpOilItems: validatedXPOils,
                xpOil: validatedXPOils.length > 0 ? {
                    xpId: validatedXPOils[0].xpId,
                    productName: validatedXPOils[0].productName,
                    quantity: validatedXPOils[0].quantityInKG,
                    density: validatedXPOils[0].density
                } : null
            };
            hasPackage = true;
            changes.package.new = newPackageData;
            changes.xpOilItems.new = validatedXPOils;
            console.log("  ✅ New package data prepared with", validatedXPOils.length, "XP Oils");
        } else {
            console.log("  ℹ️ No new package provided");
        }

        // ============================================
        // 4. HANDLE DISPENSER CHANGES - UPDATED TO USE XP ID
        // ============================================
        console.log("\n🔍 Step 4: Handling Dispenser Changes (using XP ID)...");
        let newDispenserItems = [];
        let hasDispenser = false;
        let dispenserSubtotal = 0;
        let totalDispenserDiscount = 0;

        if (dispenserItems && dispenserItems.length > 0) {
            console.log("  💧 New Dispenser Items:", dispenserItems.length);
            for (const item of dispenserItems) {
                // ✅ CHANGED: Use xpId instead of dispenserId
                const { xpId, ml, quantity, unitPrice, discount } = item;
                console.log(`  📦 Item: XP ID: ${xpId} | ML: ${ml} | Qty: ${quantity} | Unit Price: ${unitPrice} | Discount: ${discount}%`);

                // ✅ CHANGED: Validate xpId instead of dispenserId
                if (!xpId || !ml || !quantity) {
                    console.log("❌ Missing dispenser item fields");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: 'XP ID, ML, and quantity are required for each dispenser item'
                    });
                    return res.status(400).json({
                        message: "XP ID, ML, and quantity are required for each dispenser item"
                    });
                }

                if (![3, 6].includes(ml)) {
                    console.log("❌ Invalid ML:", ml, "Must be 3 or 6");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: 'ML must be 3 or 6'
                    });
                    return res.status(400).json({
                        message: "ML must be 3 or 6"
                    });
                }

                if (quantity < 1) {
                    console.log("❌ Invalid quantity:", quantity, "Must be at least 1");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: 'Quantity must be at least 1'
                    });
                    return res.status(400).json({
                        message: "Quantity must be at least 1"
                    });
                }

                // ✅ CHANGED: Find XPInventory using xpId (not dispenserId)
                const xpOil = await XPInventory.findOne({ xpId });
                if (!xpOil) {
                    console.log("❌ XP Oil not found:", xpId);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: `XP Oil not found: ${xpId}`
                    });
                    return res.status(404).json({
                        message: `XP Oil not found: ${xpId}`
                    });
                }
                console.log(`  ✅ XP Oil found: ${xpOil.productName}`);

                const totalML = ml * quantity;
                const requiredKG = totalML / 1000;
                console.log(`  📊 Total ML: ${totalML}ml | Required KG: ${requiredKG}KG`);
                console.log(`  📦 Current Stock: ${xpOil.quantity}KG`);

                if (xpOil.quantity < requiredKG) {
                    console.log(`❌ Insufficient stock. Available: ${xpOil.quantity}KG, Required: ${requiredKG}KG`);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: `Insufficient stock for ${xpOil.productName}. Available: ${xpOil.quantity} KG, Required: ${requiredKG} KG (${totalML} ML)`
                    });
                    return res.status(400).json({
                        message: `Insufficient stock for ${xpOil.productName}. Available: ${xpOil.quantity} KG, Required: ${requiredKG} KG (${totalML} ML)`
                    });
                }
                console.log(`  ✅ Stock sufficient`);

                // Check Bottles Inventory for dispenser
                const mlSize = ml.toString();
                const bottleItems = ['Bottle', 'Cap', 'Pump', 'Box'];
                for (const itemType of bottleItems) {
                    const bottleStock = await BottlesInventory.findOne({ mlSize, itemType });
                    if (!bottleStock || bottleStock.quantity < quantity) {
                        console.log(`❌ Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}, Required: ${quantity}`);
                        await logFailed({
                            module: 'Invoice',
                            userId: req.user.userId,
                            userName: req.user.name,
                            userEmail: req.user.email,
                            action: 'Update',
                            heading: 'Invoice Update Failed',
                            description: `Insufficient ${mlSize}ml ${itemType} stock for dispenser. Available: ${bottleStock?.quantity || 0}, Required: ${quantity}`
                        });
                        return res.status(400).json({
                            message: `Insufficient ${mlSize}ml ${itemType} stock for dispenser. Available: ${bottleStock?.quantity || 0}, Required: ${quantity}`
                        });
                    }
                    console.log(`  ✅ ${itemType}: ${bottleStock.quantity} available`);
                }

                // ✅ CHANGED: Get selling prices from XPInventory
                const dbPrice = ml === 3 ? xpOil.sellingPrice3ml : xpOil.sellingPrice6ml;
                const baseUnitPrice = unitPrice !== undefined && unitPrice > 0 ? unitPrice : dbPrice;

                // Calculate using existing schema fields
                const itemDiscountPercent = discount !== undefined ? discount : 0;
                const originalTotal = baseUnitPrice * quantity;
                const discountAmount = (originalTotal * itemDiscountPercent) / 100;
                const finalPrice = originalTotal - discountAmount;

                console.log(`  💰 DB Price: ₹${dbPrice}/ml`);
                console.log(`  💰 Using Unit Price: ₹${baseUnitPrice}/ml`);
                console.log(`  💰 Original Total: ₹${originalTotal}`);
                console.log(`  💰 Discount: ${itemDiscountPercent}% (₹${discountAmount})`);
                console.log(`  💰 Final Price: ₹${finalPrice}`);

                // ✅ CHANGED: Store xpId (not dispenserId)
                newDispenserItems.push({
                    xpId: xpOil.xpId,                    // ✅ CHANGED
                    productName: xpOil.productName,
                    ml: ml,
                    quantity: quantity,
                    unitPrice: baseUnitPrice,
                    sellingPrice3ml: xpOil.sellingPrice3ml || 0,
                    sellingPrice6ml: xpOil.sellingPrice6ml || 0,
                    discount: itemDiscountPercent,
                    discountAmount: discountAmount,
                    originalPrice: originalTotal,
                    finalPrice: finalPrice,
                    totalML: totalML
                });

                dispenserSubtotal += finalPrice;
                totalDispenserDiscount += discountAmount;
                hasDispenser = true;
            }
            changes.dispenser.new = newDispenserItems;
            console.log("  ✅ New dispenser items prepared");
        } else {
            console.log("  ℹ️ No new dispenser items provided");
        }

        // ============================================
        // 5. EXECUTE INVENTORY ROLLBACK AND NEW REDUCTIONS
        // ============================================
        console.log("\n🔍 Step 5: Executing Inventory Rollback...");
        const inventoryChanges = [];

        // 5a. Handle Package/XP Oil Changes
        if (originalInvoice.hasPackage) {
            const oldPackage = originalInvoice.packageItem;
            const oldXPOilItems = oldPackage.xpOilItems || [];
            console.log("  📦 Original Package exists:", oldPackage.packageName);

            if (!hasPackage) {
                console.log("  🔄 Package REMOVED - Returning all stock...");
                if (oldXPOilItems.length > 0) {
                    const returnResult = await returnMultipleXPOils(
                        oldXPOilItems.map(item => ({ xpId: item.xpId, ml: item.ml })),
                        req.user,
                        invoiceNumber
                    );
                    inventoryChanges.push({ type: 'XP Oils Returned (Package Removed)', details: returnResult.results });
                    console.log(`  ✅ ${returnResult.results.length} XP Oils returned: ${returnResult.totalML}ml total`);
                }

                await returnAlcohol(
                    oldPackage.alcoholQty,
                    req.user,
                    'Invoice Edit - Return',
                    `Returned for invoice ${invoiceNumber} (Package removed: ${oldPackage.packageName})`
                );
                inventoryChanges.push({ type: 'Fragrance Base Returned', details: oldPackage.alcoholQty });
                console.log(`  ✅ Fragrance Base returned: ${oldPackage.alcoholQty}ml`);

                await returnBottlesInventory(
                    oldPackage.bottleML.toString(),
                    1,
                    req.user,
                    'Invoice Edit - Return',
                    `Returned for invoice ${invoiceNumber} (Package removed: ${oldPackage.packageName})`
                );
                inventoryChanges.push({ type: 'Bottles Returned - Package', details: oldPackage.bottleML });
                console.log(`  ✅ Bottles returned: ${oldPackage.bottleML}ml`);

            } else {
                const oldXPOilMap = new Map();
                for (const item of oldXPOilItems) {
                    oldXPOilMap.set(item.xpId, item);
                }

                const newXPOilMap = new Map();
                for (const item of validatedXPOils) {
                    newXPOilMap.set(item.xpId, item);
                }

                for (const [xpId, oldItem] of oldXPOilMap) {
                    if (!newXPOilMap.has(xpId)) {
                        console.log(`  🔄 XP Oil REMOVED: ${oldItem.productName} (${oldItem.ml}ml)`);
                        await returnXPOil(
                            oldItem.xpId,
                            oldItem.ml,
                            req.user,
                            'Invoice Edit - Return',
                            `Returned for invoice ${invoiceNumber} (XP Oil removed: ${oldItem.productName})`
                        );
                        inventoryChanges.push({ type: 'XP Oil Returned (Removed)', details: oldItem });
                        console.log(`  ✅ XP Oil returned: ${oldItem.productName}`);
                    }
                }

                for (const [xpId, newItem] of newXPOilMap) {
                    const oldItem = oldXPOilMap.get(xpId);
                    if (!oldItem) {
                        console.log(`  ➕ XP Oil ADDED: ${newItem.productName} (${newItem.ml}ml)`);
                        await reduceXPOil(
                            newItem.xpId,
                            newItem.ml,
                            req.user,
                            'Invoice Edit - New Reduction',
                            `Reduced for invoice ${invoiceNumber} (New XP Oil: ${newItem.productName})`
                        );
                        inventoryChanges.push({ type: 'XP Oil Reduced (Added)', details: newItem });
                        console.log(`  ✅ XP Oil reduced: ${newItem.productName}`);
                    } else if (oldItem.ml !== newItem.ml) {
                        console.log(`  🔄 XP Oil CHANGED: ${oldItem.productName} (${oldItem.ml}ml → ${newItem.ml}ml)`);
                        await returnXPOil(
                            oldItem.xpId,
                            oldItem.ml,
                            req.user,
                            'Invoice Edit - Return',
                            `Returned for invoice ${invoiceNumber} (XP Oil changed: ${oldItem.productName})`
                        );
                        inventoryChanges.push({ type: 'XP Oil Returned (Changed)', details: oldItem });
                        console.log(`  ✅ Old XP Oil returned: ${oldItem.productName}`);

                        await reduceXPOil(
                            newItem.xpId,
                            newItem.ml,
                            req.user,
                            'Invoice Edit - New Reduction',
                            `Reduced for invoice ${invoiceNumber} (New XP Oil: ${newItem.productName})`
                        );
                        inventoryChanges.push({ type: 'XP Oil Reduced (Changed)', details: newItem });
                        console.log(`  ✅ New XP Oil reduced: ${newItem.productName}`);
                    } else {
                        console.log(`  ℹ️ XP Oil unchanged: ${oldItem.productName}`);
                    }
                }
            }
        } else if (hasPackage) {
            console.log("  📦 New Package added - Reducing stock...");
        }

        // 5b. Handle Dispenser Changes - UPDATED TO USE XP ID
        console.log("\n  💧 Handling Dispenser Changes (using XP ID)...");
        const oldDispenserItems = originalInvoice.dispenserItems || [];
        const newDispenserMap = new Map();
        const oldDispenserMap = new Map();

        // ✅ CHANGED: Use xpId for keys
        for (const item of newDispenserItems) {
            const key = `${item.xpId}-${item.ml}`;
            newDispenserMap.set(key, item);
        }

        for (const item of oldDispenserItems) {
            // ✅ CHANGED: Use xpId for keys (old items should have xpId now)
            const key = `${item.xpId}-${item.ml}`;
            oldDispenserMap.set(key, item);
        }

        console.log(`  📊 Old dispensers: ${oldDispenserMap.size}, New dispensers: ${newDispenserMap.size}`);

        for (const [key, oldItem] of oldDispenserMap) {
            if (!newDispenserMap.has(key)) {
                console.log(`  🔄 Dispenser REMOVED: ${oldItem.productName}`);
                // ✅ CHANGED: Use returnXPOil instead of returnDispenserOil
                await returnXPOil(
                    oldItem.xpId,
                    oldItem.totalML || (oldItem.ml * oldItem.quantity),
                    req.user,
                    'Invoice Edit - Return',
                    `Returned for invoice ${invoiceNumber} (Dispenser removed: ${oldItem.productName})`
                );
                inventoryChanges.push({ type: 'XP Oil Returned (Dispenser Removed)', details: oldItem });
                console.log(`  ✅ XP Oil returned: ${oldItem.productName}`);

                await returnBottlesInventory(
                    oldItem.ml.toString(),
                    oldItem.quantity,
                    req.user,
                    'Invoice Edit - Return',
                    `Returned for invoice ${invoiceNumber} (Bottles for removed dispenser: ${oldItem.productName})`
                );
                inventoryChanges.push({ type: 'Bottles Returned (Removed)', details: oldItem });
                console.log(`  ✅ Bottles returned for removed dispenser`);
            }
        }

        for (const [key, newItem] of newDispenserMap) {
            const oldItem = oldDispenserMap.get(key);
            if (oldItem) {
                // Check if unitPrice, quantity or discount changed
                if (oldItem.quantity !== newItem.quantity ||
                    oldItem.discount !== newItem.discount ||
                    oldItem.unitPrice !== newItem.unitPrice) {

                    console.log(`  🔄 Dispenser CHANGED: ${oldItem.productName} | Qty: ${oldItem.quantity}→${newItem.quantity} | Unit Price: ${oldItem.unitPrice}→${newItem.unitPrice} | Discount: ${oldItem.discount}%→${newItem.discount}%`);

                    // ✅ CHANGED: Use returnXPOil instead of returnDispenserOil
                    await returnXPOil(
                        oldItem.xpId,
                        oldItem.totalML || (oldItem.ml * oldItem.quantity),
                        req.user,
                        'Invoice Edit - Return',
                        `Returned for invoice ${invoiceNumber} (Dispenser changed: ${oldItem.productName} | Old Qty: ${oldItem.quantity})`
                    );
                    inventoryChanges.push({ type: 'XP Oil Returned (Dispenser Changed)', details: oldItem });
                    console.log(`  ✅ Old XP Oil returned`);

                    await returnBottlesInventory(
                        oldItem.ml.toString(),
                        oldItem.quantity,
                        req.user,
                        'Invoice Edit - Return',
                        `Returned for invoice ${invoiceNumber} (Bottles for changed dispenser: ${oldItem.productName})`
                    );
                    inventoryChanges.push({ type: 'Bottles Returned (Changed)', details: oldItem });
                    console.log(`  ✅ Old bottles returned`);

                    // ✅ CHANGED: Use reduceXPOil instead of reduceDispenserOil
                    await reduceXPOil(
                        newItem.xpId,
                        newItem.totalML || (newItem.ml * newItem.quantity),
                        req.user,
                        'Invoice Edit - New Reduction',
                        `Reduced for invoice ${invoiceNumber} (New dispenser: ${newItem.productName} | Qty: ${newItem.quantity})`
                    );
                    inventoryChanges.push({ type: 'XP Oil Reduced (Dispenser New)', details: newItem });
                    console.log(`  ✅ New XP Oil reduced`);

                    await reduceBottlesInventory(
                        newItem.ml.toString(),
                        newItem.quantity,
                        req.user,
                        'Invoice Edit - New Reduction',
                        `Reduced for invoice ${invoiceNumber} (Bottles for new dispenser: ${newItem.productName})`
                    );
                    inventoryChanges.push({ type: 'Bottles Reduced (New)', details: newItem });
                    console.log(`  ✅ New bottles reduced`);
                } else {
                    console.log(`  ℹ️ Dispenser unchanged: ${oldItem.productName}`);
                }
            } else {
                console.log(`  ➕ New dispenser ADDED: ${newItem.productName}`);
                // ✅ CHANGED: Use reduceXPOil instead of reduceDispenserOil
                await reduceXPOil(
                    newItem.xpId,
                    newItem.totalML || (newItem.ml * newItem.quantity),
                    req.user,
                    'Invoice Edit - New Reduction',
                    `Reduced for invoice ${invoiceNumber} (New dispenser added: ${newItem.productName})`
                );
                inventoryChanges.push({ type: 'XP Oil Reduced (Dispenser Added)', details: newItem });
                console.log(`  ✅ New XP Oil reduced`);

                await reduceBottlesInventory(
                    newItem.ml.toString(),
                    newItem.quantity,
                    req.user,
                    'Invoice Edit - New Reduction',
                    `Reduced for invoice ${invoiceNumber} (Bottles for new dispenser: ${newItem.productName})`
                );
                inventoryChanges.push({ type: 'Bottles Reduced (Added)', details: newItem });
                console.log(`  ✅ New bottles reduced`);
            }
        }

        // 5c. Reduce new package stock if added
        if (hasPackage && !originalInvoice.hasPackage) {
            console.log("\n  📦 Reducing new package stock...");

            const xpResult = await reduceMultipleXPOils(
                validatedXPOils,
                req.user,
                invoiceNumber
            );
            inventoryChanges.push({ type: 'XP Oils Reduced (New Package)', details: xpResult.results });
            console.log(`  ✅ ${xpResult.results.length} XP Oils reduced: ${xpResult.totalML}ml total`);

            const alcoholResult = await reduceAlcohol(
                selectedPackage.alcoholQty,
                req.user,
                'Invoice Edit - New Reduction',
                `Reduced for invoice ${invoiceNumber} (New package: ${selectedPackage.packageName})`
            );
            inventoryChanges.push({ type: 'Fragrance Base Reduced (New Package)', details: alcoholResult });
            console.log(`  ✅ Fragrance Base reduced: ${selectedPackage.alcoholQty}ml`);

            const mlSize = selectedPackage.bottleML.toString();
            const bottleResult = await reduceBottlesInventory(
                mlSize,
                1,
                req.user,
                'Invoice Edit - New Reduction',
                `Reduced for invoice ${invoiceNumber} (New package: ${selectedPackage.packageName})`
            );
            inventoryChanges.push({ type: 'Bottles Reduced (New Package)', details: bottleResult });
            console.log(`  ✅ Bottles reduced: ${mlSize}ml`);
        }

        // ============================================
        // 6. CALCULATE NEW TOTALS
        // ============================================
        console.log("\n💰 Step 6: Calculating New Totals...");
        const subtotal = packageFinalPrice + dispenserSubtotal;
        const subtotalWithoutGST = subtotal / (1 + GST_RATE / 100);
        console.log("  💰 Subtotal:", subtotal);
        console.log("  💰 Subtotal Without GST:", subtotalWithoutGST);

        let promoData = null;
        let hasPromo = false;
        let promoDiscountAmount = 0;
        let afterPromo = subtotalWithoutGST;

        if (promoCode) {
            console.log("  🏷️ Promo Code:", promoCode);
            const promo = await PromoCode.findOne({
                code: promoCode.toUpperCase(),
                isActive: true,
                isExpired: false
            });

            if (!promo) {
                console.log("❌ Invalid or expired promo code:", promoCode);
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Invoice Update Failed',
                    description: 'Invalid or expired promo code'
                });
                return res.status(400).json({
                    message: "Invalid or expired promo code"
                });
            }

            const now = new Date();
            if (promo.startDate > now || promo.endDate < now) {
                console.log("❌ Promo code not active for current date");
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Update',
                    heading: 'Invoice Update Failed',
                    description: 'Promo code not active for current date'
                });
                return res.status(400).json({
                    message: "Promo code not active for current date"
                });
            }

            promoDiscountAmount = (subtotalWithoutGST * promo.discount) / 100;
            afterPromo = subtotalWithoutGST - promoDiscountAmount;
            console.log(`  ✅ Promo valid: ${promo.code} | ${promo.discount}% discount`);
            console.log(`  💰 Promo Discount Amount: ₹${promoDiscountAmount}`);
            console.log(`  💰 After Promo: ₹${afterPromo}`);

            promoData = {
                promoId: promo.promoId,
                code: promo.code,
                discount: promo.discount,
                discountAmount: promoDiscountAmount
            };
            hasPromo = true;
        } else {
            console.log("  ℹ️ No promo code provided");
        }

        const newLoyaltyUsed = originalLoyaltyUsed;
        let loyaltyDiscountAmount = 0;
        let afterLoyalty = afterPromo;

        if (newLoyaltyUsed > 0) {
            loyaltyDiscountAmount = Math.min(newLoyaltyUsed, afterPromo);
            afterLoyalty = afterPromo - loyaltyDiscountAmount;
            console.log(`  🪙 Loyalty Coins Used (unchanged): ${newLoyaltyUsed} coins (₹${loyaltyDiscountAmount})`);
            console.log(`  💰 After Loyalty: ₹${afterLoyalty}`);
        } else {
            console.log("  🪙 No loyalty coins used");
        }

        const newLoyaltyEarned = Math.floor(afterLoyalty / 100);
        console.log(`  🪙 Loyalty Coins EARNED (recalculated): ${newLoyaltyEarned} coins`);

        const gstAmount = afterLoyalty * (GST_RATE / 100);
        console.log("  💰 GST (", GST_RATE, "% ): ₹", gstAmount);

        const grandTotal = afterLoyalty + gstAmount;
        console.log("  💰 GRAND TOTAL: ₹", grandTotal);

        const totalDiscountAmount = packageDiscountAmount + totalDispenserDiscount + promoDiscountAmount + loyaltyDiscountAmount;
        console.log("  💰 Total Discount: ₹", totalDiscountAmount);

        // ============================================
        // 7. UPDATE CUSTOMER LOYALTY COINS
        // ============================================
        console.log("\n🔍 Step 7: Updating Customer Loyalty Coins...");
        let loyaltyUpdate = {
            removedEarned: 0,
            returnedUsed: 0,
            addedEarned: 0,
            deductedUsed: 0,
            previousBalance: 0,
            newBalance: 0
        };

        if (customer) {
            let currentCoins = customer.loyaltyCoins || 0;
            const previousBalance = currentCoins;
            loyaltyUpdate.previousBalance = previousBalance;

            console.log(`  🪙 Current Customer Coins: ${currentCoins}`);

            if (originalLoyaltyEarned > 0) {
                currentCoins = Math.max(0, currentCoins - originalLoyaltyEarned);
                loyaltyUpdate.removedEarned = originalLoyaltyEarned;
                console.log(`  🔻 Removed ${originalLoyaltyEarned} old earned coins`);
            }

            if (originalLoyaltyUsed > 0) {
                currentCoins = currentCoins + originalLoyaltyUsed;
                loyaltyUpdate.returnedUsed = originalLoyaltyUsed;
                console.log(`  🔺 Returned ${originalLoyaltyUsed} used coins`);
            }

            if (newLoyaltyEarned > 0) {
                currentCoins = currentCoins + newLoyaltyEarned;
                loyaltyUpdate.addedEarned = newLoyaltyEarned;
                console.log(`  🔺 Added ${newLoyaltyEarned} new earned coins`);
            }

            if (newLoyaltyUsed > 0) {
                currentCoins = Math.max(0, currentCoins - newLoyaltyUsed);
                loyaltyUpdate.deductedUsed = newLoyaltyUsed;
                console.log(`  🔻 Deducted ${newLoyaltyUsed} used coins`);
            }

            customer.loyaltyCoins = currentCoins;
            await customer.save();
            loyaltyUpdate.newBalance = currentCoins;

            console.log(`  ✅ Customer loyalty coins updated: ${previousBalance} → ${currentCoins}`);
            console.log(`  📊 Net Change: ${currentCoins - previousBalance} coins`);
        } else {
            console.log("  ⚠️ Customer not found, skipping loyalty update");
        }

        // ============================================
        // 8. UPDATE INVOICE
        // ============================================
        console.log("\n📝 Step 8: Updating Invoice...");

        const updatedCustomer = await Customer.findOne({ customerId: originalInvoice.customer.customerId });
        const newLoyaltyBalance = updatedCustomer ? updatedCustomer.loyaltyCoins : originalInvoice.customer.loyaltyCoins || 0;

        const updateData = {
            packageItem: newPackageData,
            hasPackage: hasPackage,
            dispenserItems: newDispenserItems,
            hasDispenser: hasDispenser,
            promoApplied: promoData,
            hasPromo: hasPromo,
            loyaltyCoinsEarned: newLoyaltyEarned,
            loyaltyCoinsUsed: newLoyaltyUsed,
            loyaltyDiscountAmount: loyaltyDiscountAmount,
            subtotal: subtotal,
            subtotalWithoutGST: subtotalWithoutGST,
            gstRate: GST_RATE,
            gstAmount: gstAmount,
            packageDiscountAmount: packageDiscountAmount,
            dispenserDiscountAmount: totalDispenserDiscount,
            promoDiscount: promoDiscountAmount,
            totalDiscountAmount: totalDiscountAmount,
            grandTotal: grandTotal,
            paymentStatus: paymentStatus || originalInvoice.paymentStatus,
            invoiceDate: invoiceDate ? new Date(invoiceDate) : originalInvoice.invoiceDate,
            notes: notes !== undefined ? notes : originalInvoice.notes,
            'customer.loyaltyCoins': newLoyaltyBalance
        };

        const updatedInvoice = await Invoice.findOneAndUpdate(
            { invoiceId: invoiceId },
            updateData,
            {
                returnDocument: 'after',
                runValidators: true
            }
        );

        console.log("✅ Invoice updated successfully!");
        console.log("  📄 New Invoice Number:", updatedInvoice.invoiceNumber);
        console.log("  💰 New Total: ₹", updatedInvoice.grandTotal);
        console.log("  🪙 Loyalty Earned:", updatedInvoice.loyaltyCoinsEarned);
        console.log("  🪙 Loyalty Used:", updatedInvoice.loyaltyCoinsUsed);

        // ============================================
        // 9. LOG SUCCESS
        // ============================================
        console.log("\n✅ INVOICE UPDATE COMPLETED SUCCESSFULLY");
        console.log(`📄 Invoice: ${invoiceNumber} | New Total: ₹${grandTotal.toFixed(2)}`);
        console.log(`🪙 Loyalty: ${newLoyaltyEarned} earned | ${newLoyaltyUsed} used | Balance: ${newLoyaltyBalance}`);
        console.log("==========================================\n");

        await logSuccess({
            module: 'Invoice',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Update',
            heading: 'Invoice Updated Successfully',
            description: `Invoice ${invoiceNumber} updated. New Total: ₹${grandTotal.toFixed(2)}`
        });

        res.status(200).json({
            message: "Invoice updated successfully",
            invoice: updatedInvoice.toObject(),
            inventoryChanges: inventoryChanges,
            loyaltyUpdate: loyaltyUpdate,
            calculations: {
                subtotal: subtotal,
                subtotalWithoutGST: subtotalWithoutGST,
                promoDiscount: promoDiscountAmount,
                loyaltyDiscount: loyaltyDiscountAmount,
                gstAmount: gstAmount,
                totalDiscount: totalDiscountAmount,
                grandTotal: grandTotal,
                loyaltyEarned: newLoyaltyEarned,
                loyaltyUsed: newLoyaltyUsed
            }
        });

    } catch (error) {
        console.error("\n❌ INVOICE UPDATE FAILED:");
        console.error("Error:", error);
        console.error("Stack:", error.stack);
        console.log("==========================================\n");

        await logFailed({
            module: 'Invoice',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Update',
            heading: 'Invoice Update Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to update invoice",
            error: error.message
        });
    }
});

// ============================================
// GET ALL INVOICES - UPDATED WITH DATE FILTERS
// ============================================
router.get("/get-all", auth, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            startDate,
            endDate,
            paymentStatus,
            customerId,
            timeFilter = 'all'
        } = req.query;

        let query = { status: 'Active' };

        // ✅ TIME FILTER LOGIC
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let dateFilter = {};

        switch (timeFilter) {
            case 'today':
                dateFilter = {
                    $gte: today,
                    $lt: tomorrow
                };
                break;
            case 'yesterday': {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayEnd = new Date(today);
                dateFilter = {
                    $gte: yesterday,
                    $lt: yesterdayEnd
                };
                break;
            }
            case 'thisWeek': {
                const startOfWeek = new Date(today);
                const day = today.getDay();
                const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                startOfWeek.setDate(diff);
                startOfWeek.setHours(0, 0, 0, 0);
                dateFilter = { $gte: startOfWeek };
                break;
            }
            case 'thisMonth': {
                const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                dateFilter = { $gte: startOfMonth };
                break;
            }
            case 'thisYear': {
                const startOfYear = new Date(today.getFullYear(), 0, 1);
                dateFilter = { $gte: startOfYear };
                break;
            }
            case 'lastYear': {
                const startOfLastYear = new Date(today.getFullYear() - 1, 0, 1);
                const endOfLastYear = new Date(today.getFullYear(), 0, 1);
                dateFilter = {
                    $gte: startOfLastYear,
                    $lt: endOfLastYear
                };
                break;
            }
            default:
                break;
        }

        if (startDate && endDate) {
            query.invoiceDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        } else if (Object.keys(dateFilter).length > 0) {
            query.invoiceDate = dateFilter;
        }

        if (paymentStatus) {
            query.paymentStatus = paymentStatus;
        }

        if (customerId) {
            query['customer.customerId'] = customerId;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [invoices, total] = await Promise.all([
            Invoice.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Invoice.countDocuments(query)
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
        console.error("Error fetching invoices:", error);
        res.status(500).json({
            message: "Failed to fetch invoices",
            error: error.message
        });
    }
});

// ============================================
// EXPORT INVOICES TO EXCEL
// ============================================
router.get("/export", auth, async (req, res) => {
    try {
        console.log("\n========== 📊 INVOICE EXPORT STARTED ==========");

        const {
            startDate,
            endDate,
            paymentStatus,
            search = '',
            timeFilter = 'all'
        } = req.query;

        console.log("📋 Export Filters:");
        console.log("  📅 Start Date:", startDate || "All");
        console.log("  📅 End Date:", endDate || "All");
        console.log("  💳 Payment Status:", paymentStatus || "All");
        console.log("  🔍 Search:", search || "None");
        console.log("  ⏰ Time Filter:", timeFilter);

        let query = { status: 'Active' };

        // TIME FILTER LOGIC
        if (!startDate && !endDate && timeFilter && timeFilter !== 'all') {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            let dateFilter = {};

            switch (timeFilter) {
                case 'today':
                    dateFilter = {
                        $gte: today,
                        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                    };
                    break;
                case 'yesterday': {
                    const yesterday = new Date(today);
                    yesterday.setDate(yesterday.getDate() - 1);
                    dateFilter = {
                        $gte: yesterday,
                        $lt: today
                    };
                    break;
                }
                case 'thisWeek': {
                    const startOfWeek = new Date(today);
                    const day = today.getDay();
                    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                    startOfWeek.setDate(diff);
                    startOfWeek.setHours(0, 0, 0, 0);
                    dateFilter = { $gte: startOfWeek };
                    break;
                }
                case 'thisMonth': {
                    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    dateFilter = { $gte: startOfMonth };
                    break;
                }
                case 'thisYear': {
                    const startOfYear = new Date(today.getFullYear(), 0, 1);
                    dateFilter = { $gte: startOfYear };
                    break;
                }
                case 'lastYear': {
                    const startOfLastYear = new Date(today.getFullYear() - 1, 0, 1);
                    const endOfLastYear = new Date(today.getFullYear(), 0, 1);
                    dateFilter = {
                        $gte: startOfLastYear,
                        $lt: endOfLastYear
                    };
                    break;
                }
                default:
                    break;
            }

            if (Object.keys(dateFilter).length > 0) {
                query.invoiceDate = dateFilter;
            }
        }

        if (startDate && endDate) {
            query.invoiceDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        if (paymentStatus) {
            query.paymentStatus = paymentStatus;
        }

        if (search && search.trim() !== '') {
            const searchTerm = search.trim();
            query.$or = [
                { invoiceNumber: { $regex: searchTerm, $options: 'i' } },
                { 'customer.customerName': { $regex: searchTerm, $options: 'i' } },
                { 'customer.contactNumber': { $regex: searchTerm, $options: 'i' } }
            ];
        }

        console.log("📝 Final Query:", JSON.stringify(query, null, 2));

        const invoices = await Invoice.find(query)
            .sort({ createdAt: -1 })
            .lean();

        console.log(`✅ Found ${invoices.length} invoices`);

        if (invoices.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No invoices found to export"
            });
        }

        const XLSX = require('xlsx');

        const formatDate = (dateString) => {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        };

        // ============================================
        // SHEET 1: INVOICE SUMMARY
        // ============================================
        console.log("\n📊 Creating Sheet 1: Invoice Summary...");

        const summaryData = invoices.map(inv => ({
            'Invoice #': inv.invoiceNumber || 'N/A',
            'Date': formatDate(inv.invoiceDate),
            'Customer Name': inv.customer?.customerName || 'N/A',
            'Phone': inv.customer?.contactNumber || 'N/A',
            'Payment': inv.paymentStatus || 'N/A',
            'Package': inv.hasPackage ? inv.packageItem?.packageName || 'Yes' : 'No',
            'Dispenser Items': inv.hasDispenser ? inv.dispenserItems?.length || 0 : 0,
            'Total Items': (inv.hasPackage ? 1 : 0) + (inv.dispenserItems?.length || 0),
            'Subtotal': `₹${(inv.subtotal || 0).toFixed(2)}`,
            'Total Discount': `₹${(inv.totalDiscountAmount || 0).toFixed(2)}`,
            'GST': `₹${(inv.gstAmount || 0).toFixed(2)}`,
            'Grand Total': `₹${(inv.grandTotal || 0).toFixed(2)}`,
            'Loyalty Earned': inv.loyaltyCoinsEarned || 0,
            'Loyalty Used': inv.loyaltyCoinsUsed || 0,
            'Status': inv.status || 'Active'
        }));

        // ============================================
        // SHEET 2: INVOICE DETAILS - WITH MULTIPLE XP OILS
        // ============================================
        console.log("\n📊 Creating Sheet 2: Invoice Details...");

        const detailsData = [];

        for (const inv of invoices) {
            let headerAdded = false;

            const addHeaderRow = () => {
                if (!headerAdded) {
                    detailsData.push({
                        'Invoice #': inv.invoiceNumber || 'N/A',
                        'Date': formatDate(inv.invoiceDate),
                        'Customer': inv.customer?.customerName || 'N/A',
                        'Payment': inv.paymentStatus || 'N/A',
                        'Grand Total': `₹${(inv.grandTotal || 0).toFixed(2)}`,
                        'Subtotal': `₹${(inv.subtotal || 0).toFixed(2)}`,
                        'Total Discount': `₹${(inv.totalDiscountAmount || 0).toFixed(2)}`,
                        'GST': `₹${(inv.gstAmount || 0).toFixed(2)}`,
                        'Item Type': '',
                        'Product Name': '',
                        'ML': '',
                        'Quantity': '',
                        'Unit Price': '',
                        'Discount %': '',
                        'Discount Amount': '',
                        'Final Price': '',
                        'XP Oil Name': '',
                        'XP Oil ML': '',
                        'Fragrance Base Used': '',
                        'Promo Code': inv.hasPromo ? inv.promoApplied?.code || 'N/A' : 'N/A',
                        'Loyalty Earned': inv.loyaltyCoinsEarned || 0,
                        'Loyalty Used': inv.loyaltyCoinsUsed || 0
                    });
                    headerAdded = true;
                }
            };

            // 1. Add Package Item (if exists)
            if (inv.hasPackage && inv.packageItem) {
                addHeaderRow();
                const pkg = inv.packageItem;

                // Show XP Oil details - multiple rows if multiple oils
                const xpOilItems = pkg.xpOilItems || [];

                if (xpOilItems.length > 0) {
                    for (const xp of xpOilItems) {
                        detailsData.push({
                            'Invoice #': '',
                            'Date': '',
                            'Customer': '',
                            'Payment': '',
                            'Grand Total': '',
                            'Subtotal': '',
                            'Total Discount': '',
                            'GST': '',
                            'Item Type': '📦 XP Oil',
                            'Product Name': xp.productName || 'N/A',
                            'ML': xp.ml || 'N/A',
                            'Quantity': 1,
                            'Unit Price': `₹${(xp.pricePerKG || 0).toFixed(2)}/KG`,
                            'Discount %': `${pkg.discount || 0}%`,
                            'Discount Amount': `₹${(pkg.discountAmount || 0).toFixed(2)}`,
                            'Final Price': `₹${(pkg.finalPrice || pkg.pricing || 0).toFixed(2)}`,
                            'XP Oil Name': xp.productName || 'N/A',
                            'XP Oil ML': `${xp.ml || 0}ml`,
                            'Fragrance Base Used': `${pkg.alcoholQty || 0}ml`,
                            'Promo Code': '',
                            'Loyalty Earned': '',
                            'Loyalty Used': ''
                        });
                    }
                } else {
                    // Fallback for old invoices with single XP Oil
                    detailsData.push({
                        'Invoice #': '',
                        'Date': '',
                        'Customer': '',
                        'Payment': '',
                        'Grand Total': '',
                        'Subtotal': '',
                        'Total Discount': '',
                        'GST': '',
                        'Item Type': '📦 Package',
                        'Product Name': pkg.packageName || 'N/A',
                        'ML': pkg.bottleML || 'N/A',
                        'Quantity': 1,
                        'Unit Price': `₹${(pkg.pricing || 0).toFixed(2)}`,
                        'Discount %': `${pkg.discount || 0}%`,
                        'Discount Amount': `₹${(pkg.discountAmount || 0).toFixed(2)}`,
                        'Final Price': `₹${(pkg.finalPrice || pkg.pricing || 0).toFixed(2)}`,
                        'XP Oil Name': pkg.xpOil?.productName || 'N/A',
                        'XP Oil ML': `${(pkg.xpOil?.quantity || 0) * 1000}ml`,
                        'Fragrance Base Used': `${pkg.alcoholQty || 0}ml`,
                        'Promo Code': '',
                        'Loyalty Earned': '',
                        'Loyalty Used': ''
                    });
                }
            }

            // 2. Add Dispenser Items
            if (inv.hasDispenser && inv.dispenserItems.length > 0) {
                if (!inv.hasPackage) {
                    addHeaderRow();
                }

                for (const item of inv.dispenserItems) {
                    const pricePerUnit = item.ml === 3 ? item.sellingPrice3ml : item.sellingPrice6ml;
                    detailsData.push({
                        'Invoice #': '',
                        'Date': '',
                        'Customer': '',
                        'Payment': '',
                        'Grand Total': '',
                        'Subtotal': '',
                        'Total Discount': '',
                        'GST': '',
                        'Item Type': '💧 Dispenser',
                        'Product Name': item.productName || 'N/A',
                        'ML': item.ml || 'N/A',
                        'Quantity': item.quantity || 0,
                        'Unit Price': `₹${(pricePerUnit || 0).toFixed(2)}`,
                        'Discount %': `${item.discount || 0}%`,
                        'Discount Amount': `₹${(item.discountAmount || 0).toFixed(2)}`,
                        'Final Price': `₹${(item.finalPrice || 0).toFixed(2)}`,
                        'XP Oil Name': 'N/A',
                        'XP Oil ML': 'N/A',
                        'Fragrance Base Used': 'N/A',
                        'Promo Code': '',
                        'Loyalty Earned': '',
                        'Loyalty Used': ''
                    });
                }
            }

            // 3. If NO items
            if (!inv.hasPackage && (!inv.hasDispenser || inv.dispenserItems.length === 0)) {
                addHeaderRow();
                detailsData.push({
                    'Invoice #': '',
                    'Date': '',
                    'Customer': '',
                    'Payment': '',
                    'Grand Total': '',
                    'Subtotal': '',
                    'Total Discount': '',
                    'GST': '',
                    'Item Type': '⚠️ No Items',
                    'Product Name': 'No products in this invoice',
                    'ML': 'N/A',
                    'Quantity': 0,
                    'Unit Price': '₹0.00',
                    'Discount %': '0%',
                    'Discount Amount': '₹0.00',
                    'Final Price': '₹0.00',
                    'XP Oil Name': 'N/A',
                    'XP Oil ML': 'N/A',
                    'Fragrance Base Used': 'N/A',
                    'Promo Code': '',
                    'Loyalty Earned': '',
                    'Loyalty Used': ''
                });
            }
        }

        console.log(`✅ Details data: ${detailsData.length} rows created`);

        // ============================================
        // 4. CREATE EXCEL WORKBOOK
        // ============================================
        console.log("\n📁 Creating Excel Workbook...");

        const wb = XLSX.utils.book_new();

        // Sheet 1: Summary
        const ws1 = XLSX.utils.json_to_sheet(summaryData);
        ws1['!cols'] = [
            { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 },
            { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
            { wch: 15 }, { wch: 18 }, { wch: 12 }, { wch: 18 },
            { wch: 15 }, { wch: 15 }, { wch: 12 }
        ];
        XLSX.utils.book_append_sheet(wb, ws1, 'Invoice Summary');

        // Sheet 2: Details
        const ws2 = XLSX.utils.json_to_sheet(detailsData);
        ws2['!cols'] = [
            { wch: 15 },  // Invoice #
            { wch: 15 },  // Date
            { wch: 25 },  // Customer
            { wch: 12 },  // Payment
            { wch: 18 },  // Grand Total
            { wch: 15 },  // Subtotal
            { wch: 18 },  // Total Discount
            { wch: 12 },  // GST
            { wch: 18 },  // Item Type
            { wch: 30 },  // Product Name
            { wch: 8 },   // ML
            { wch: 10 },  // Quantity
            { wch: 15 },  // Unit Price
            { wch: 12 },  // Discount %
            { wch: 18 },  // Discount Amount
            { wch: 18 },  // Final Price
            { wch: 20 },  // XP Oil Name
            { wch: 12 },  // XP Oil ML
            { wch: 18 },  // Fragrance Base Used
            { wch: 15 },  // Promo Code
            { wch: 15 },  // Loyalty Earned
            { wch: 15 }   // Loyalty Used
        ];
        XLSX.utils.book_append_sheet(wb, ws2, 'Invoice Details');

        // ============================================
        // 5. GENERATE AND SEND FILE
        // ============================================
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        const filename = `invoices_export_${new Date().toISOString().split('T')[0]}.xlsx`;

        console.log(`✅ Excel file created: ${filename}`);
        console.log(`📊 Summary rows: ${summaryData.length}`);
        console.log(`📊 Details rows: ${detailsData.length}`);
        console.log("========== 📊 INVOICE EXPORT COMPLETED ==========\n");

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(buffer);

    } catch (error) {
        console.error("\n❌ INVOICE EXPORT FAILED:");
        console.error("Error:", error);
        console.error("Stack:", error.stack);
        console.log("==========================================\n");

        await logFailed({
            module: 'Invoice',
            userId: req.user?.userId || 'Unknown',
            userName: req.user?.name || 'Unknown',
            userEmail: req.user?.email || 'Unknown',
            action: 'Export',
            heading: 'Invoice Export Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            success: false,
            message: "Failed to export invoices",
            error: error.message
        });
    }
});

// ============================================
// GET INVOICE BY ID
// ============================================
router.get("/:invoiceId", auth, async (req, res) => {
    try {
        const { invoiceId } = req.params;

        const invoice = await Invoice.findOne({
            invoiceId: invoiceId,
            status: 'Active'
        }).lean();

        if (!invoice) {
            return res.status(404).json({
                message: "Invoice not found"
            });
        }

        res.status(200).json(invoice);

    } catch (error) {
        console.error("Error fetching invoice:", error);
        res.status(500).json({
            message: "Failed to fetch invoice",
            error: error.message
        });
    }
});

// ============================================
// DELETE INVOICE - With Inventory Return & Audit - UPDATED TO USE XP ID
// ============================================
router.delete("/delete/:invoiceId", auth, checkInvoicePermission, async (req, res) => {
    console.log("\n========== 🗑️ INVOICE DELETION STARTED ==========");
    console.log("📝 Invoice ID:", req.params.invoiceId);
    console.log("📝 Deletion Reason:", req.body.deletionReason || "Not provided");

    try {
        const { invoiceId } = req.params;
        const { deletionReason } = req.body;

        // ============================================
        // 1. GET INVOICE
        // ============================================
        console.log("\n🔍 Step 1: Fetching Invoice to Delete...");
        const invoice = await Invoice.findOne({
            invoiceId: invoiceId,
            status: 'Active'
        });

        if (!invoice) {
            console.log("❌ Invoice not found:", invoiceId);
            await logFailed({
                module: 'Invoice',
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email,
                action: 'Delete',
                heading: 'Invoice Deletion Failed',
                description: 'Invoice not found'
            });
            return res.status(404).json({
                message: "Invoice not found"
            });
        }

        console.log("✅ Invoice found:", invoice.invoiceNumber);
        console.log("  👤 Customer:", invoice.customer.customerName);
        console.log("  💰 Total Amount: ₹", invoice.grandTotal);
        console.log("  📦 Package:", invoice.hasPackage ? invoice.packageItem?.packageName : "None");
        console.log("  🧪 XP Oils:", invoice.packageItem?.xpOilItems?.length || 0);
        console.log("  💧 Dispensers:", invoice.dispenserItems?.length || 0);
        console.log("  🏷️ Promo:", invoice.hasPromo ? invoice.promoApplied?.code : "None");
        console.log("  🪙 Loyalty Earned:", invoice.loyaltyCoinsEarned || 0);
        console.log("  🪙 Loyalty Used:", invoice.loyaltyCoinsUsed || 0);

        const invoiceNumber = invoice.invoiceNumber;
        const invoiceData = invoice.toObject();

        // ============================================
        // 2. RETURN ALL INVENTORY
        // ============================================
        console.log("\n🔍 Step 2: Returning All Inventory...");
        const inventoryReturned = {
            xpOil: 0,
            alcohol: 0,
            dispenser: 0,
            bottles: 0,
            xpOilDetails: []
        };

        // 2a. Return Package Stock
        if (invoice.hasPackage && invoice.packageItem) {
            console.log("\n  📦 Returning Package Stock...");
            const pkg = invoice.packageItem;
            console.log("    Package:", pkg.packageName);

            // ✅ Return Multiple XP Oils
            const xpOilItems = pkg.xpOilItems || [];

            if (xpOilItems.length > 0) {
                console.log(`    🧪 Returning ${xpOilItems.length} XP Oils...`);
                const returnResult = await returnMultipleXPOils(
                    xpOilItems.map(item => ({ xpId: item.xpId, ml: item.ml })),
                    req.user,
                    invoiceNumber
                );

                inventoryReturned.xpOilDetails = returnResult.results;
                inventoryReturned.xpOil = returnResult.totalML;

                for (const result of returnResult.results) {
                    console.log(`    ✅ ${result.productName}: ${result.ml}ml returned`);
                }
            } else {
                // Fallback for old invoices with single XP Oil
                if (pkg.xpOil && pkg.xpOil.xpId) {
                    const xpResult = await returnXPOil(
                        pkg.xpOil.xpId,
                        pkg.fragranceQty || (pkg.xpOil.quantity * 1000),
                        req.user,
                        'Invoice Deletion - Return',
                        `Returned for invoice ${invoiceNumber} (Invoice deleted)`
                    );
                    inventoryReturned.xpOil = pkg.fragranceQty || (pkg.xpOil.quantity * 1000);
                    inventoryReturned.xpOilDetails.push(xpResult);
                    console.log(`    ✅ XP Oil returned: ${inventoryReturned.xpOil}g (${xpResult.productName})`);
                }
            }

            // Return Alcohol
            const alcoholResult = await returnAlcohol(
                pkg.alcoholQty,
                req.user,
                'Invoice Deletion - Return',
                `Returned for invoice ${invoiceNumber} (Invoice deleted)`
            );
            inventoryReturned.alcohol += pkg.alcoholQty;
            console.log(`    ✅ Fragrance Base returned: ${pkg.alcoholQty}ml`);

            // Return Bottles
            const bottleResult = await returnBottlesInventory(
                pkg.bottleML.toString(),
                1,
                req.user,
                'Invoice Deletion - Return',
                `Returned for invoice ${invoiceNumber} (Invoice deleted)`
            );
            inventoryReturned.bottles += 1;
            console.log(`    ✅ Bottles returned: ${pkg.bottleML}ml (1 set)`);
        } else {
            console.log("  ℹ️ No package stock to return");
        }

        // 2b. Return Dispenser Stock - UPDATED TO USE XP ID
        if (invoice.hasDispenser && invoice.dispenserItems.length > 0) {
            console.log("\n  💧 Returning Dispenser Stock (using XP ID)...");
            for (const item of invoice.dispenserItems) {
                console.log(`    Item: ${item.productName}`);
                console.log(`      ML: ${item.ml}ml | Qty: ${item.quantity} | Total ML: ${item.totalML}ml`);

                // ✅ CHANGED: Use returnXPOil instead of returnDispenserOil
                // ✅ CHANGED: Use xpId instead of dispenserId
                const xpResult = await returnXPOil(
                    item.xpId,  // ✅ CHANGED: Use xpId
                    item.totalML || (item.ml * item.quantity),
                    req.user,
                    'Invoice Deletion - Return',
                    `Returned for invoice ${invoiceNumber} (Invoice deleted)`
                );
                inventoryReturned.dispenser += item.totalML || (item.ml * item.quantity);
                console.log(`    ✅ XP Oil returned: ${item.totalML || (item.ml * item.quantity)}ml (${item.productName})`);

                const bottleResult = await returnBottlesInventory(
                    item.ml.toString(),
                    item.quantity,
                    req.user,
                    'Invoice Deletion - Return',
                    `Returned for invoice ${invoiceNumber} (Invoice deleted)`
                );
                inventoryReturned.bottles += item.quantity;
                console.log(`    ✅ Bottles returned: ${item.ml}ml × ${item.quantity}`);
            }
        } else {
            console.log("  ℹ️ No dispenser stock to return");
        }

        console.log("\n  📊 Inventory Return Summary:");
        console.log(`    XP Oil: ${inventoryReturned.xpOil}ml`);
        console.log(`    Fragrance Base: ${inventoryReturned.alcohol}ml`);
        console.log(`    Dispenser: ${inventoryReturned.dispenser}ml`);
        console.log(`    Bottles: ${inventoryReturned.bottles} units`);

        // ============================================
        // 3. RETURN LOYALTY COINS TO CUSTOMER
        // ============================================
        console.log("\n🔍 Step 3: Returning Loyalty Coins...");
        const loyaltyCoinsEarned = invoice.loyaltyCoinsEarned || 0;
        const loyaltyCoinsUsed = invoice.loyaltyCoinsUsed || 0;
        let loyaltyReturned = { earned: 0, used: 0 };

        if (loyaltyCoinsEarned > 0 || loyaltyCoinsUsed > 0) {
            const customer = await Customer.findOne({ customerId: invoice.customer.customerId });
            if (customer) {
                let currentCoins = customer.loyaltyCoins || 0;
                const previousBalance = currentCoins;

                if (loyaltyCoinsEarned > 0) {
                    currentCoins = Math.max(0, currentCoins - loyaltyCoinsEarned);
                    loyaltyReturned.earned = loyaltyCoinsEarned;
                    console.log(`  🔻 Removed ${loyaltyCoinsEarned} earned coins`);
                }

                if (loyaltyCoinsUsed > 0) {
                    currentCoins = currentCoins + loyaltyCoinsUsed;
                    loyaltyReturned.used = loyaltyCoinsUsed;
                    console.log(`  🔺 Returned ${loyaltyCoinsUsed} used coins`);
                }

                customer.loyaltyCoins = currentCoins;
                await customer.save();
                console.log(`  ✅ Customer loyalty coins updated: ${previousBalance} → ${currentCoins}`);
            }
        } else {
            console.log("  ℹ️ No loyalty coins to return");
        }

        // ============================================
        // 4. SAVE TO DELETED INVOICE COLLECTION (AUDIT)
        // ============================================
        console.log("\n🔍 Step 4: Saving to Deleted Invoice Collection (Audit)...");
        const deletedInvoice = new DeletedInvoice({
            originalInvoiceId: invoice.invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            invoiceData: invoiceData,
            deletedBy: {
                userId: req.user.userId,
                userName: req.user.name,
                userEmail: req.user.email
            },
            deletedAt: new Date(),
            deletionReason: deletionReason || 'Invoice deleted by user',
            inventoryReturned: {
                xpOil: inventoryReturned.xpOil,
                alcohol: inventoryReturned.alcohol,
                dispenser: inventoryReturned.dispenser,
                bottles: inventoryReturned.bottles,
                xpOilDetails: inventoryReturned.xpOilDetails
            },
            loyaltyCoins: {
                earned: loyaltyCoinsEarned,
                used: loyaltyCoinsUsed
            },
            customerInfo: {
                customerId: invoice.customer.customerId,
                customerName: invoice.customer.customerName,
                contactNumber: invoice.customer.contactNumber
            },
            financialSummary: {
                subtotal: invoice.subtotal,
                grandTotal: invoice.grandTotal,
                totalDiscount: invoice.totalDiscountAmount,
                gstAmount: invoice.gstAmount
            },
            isRestored: false
        });

        await deletedInvoice.save();
        console.log("✅ Deleted Invoice saved for audit:");
        console.log(`  📄 Original Invoice ID: ${deletedInvoice.originalInvoiceId}`);
        console.log(`  📄 Invoice Number: ${deletedInvoice.invoiceNumber}`);
        console.log(`  👤 Deleted By: ${req.user.name} (${req.user.email})`);
        console.log(`  📅 Deleted At: ${new Date().toISOString()}`);
        console.log(`  🪙 Loyalty - Earned: ${loyaltyCoinsEarned}, Used: ${loyaltyCoinsUsed}`);

        // ============================================
        // 5. DELETE FROM MAIN COLLECTION
        // ============================================
        console.log("\n🔍 Step 5: Deleting from Main Collection...");
        await Invoice.findOneAndDelete({ invoiceId: invoiceId });
        console.log(`✅ Invoice ${invoiceNumber} removed from main collection`);

        // ============================================
        // 6. UPDATE WORKSHOP - Remove invoice marking
        // ============================================
        console.log("\n🔍 Step 6: Updating Workshop...");
        if (invoice.hasWorkshop && invoice.workshop) {
            console.log(`  🏭 Workshop ID: ${invoice.workshop.workshopId}`);
            const workshop = await Workshop.findOne({
                workshopId: invoice.workshop.workshopId,
                isDeleted: false
            });

            if (workshop) {
                const customerIndex = workshop.customers.findIndex(
                    c => c.customerId === invoice.customer.customerId
                );

                if (customerIndex !== -1) {
                    workshop.customers[customerIndex].invoiceCreated = false;
                    workshop.customers[customerIndex].invoiceId = null;
                    await workshop.save();
                    console.log(`  ✅ Customer ${invoice.customer.customerName} unmarked from workshop ${workshop.workshopId}`);
                } else {
                    console.log(`  ⚠️ Customer not found in workshop`);
                }
            } else {
                console.log(`  ⚠️ Workshop not found or deleted`);
            }
        } else {
            console.log("  ℹ️ No workshop associated with this invoice");
        }

        // ============================================
        // 7. LOG SUCCESS
        // ============================================
        console.log("\n✅ INVOICE DELETION COMPLETED SUCCESSFULLY");
        console.log(`📄 Invoice: ${invoiceNumber} | Total: ₹${invoice.grandTotal.toFixed(2)}`);
        console.log(`📊 Inventory Returned: XP Oil: ${inventoryReturned.xpOil}ml, Fragrance Base: ${inventoryReturned.alcohol}ml, Dispenser: ${inventoryReturned.dispenser}ml, Bottles: ${inventoryReturned.bottles} units`);
        console.log(`🪙 Loyalty: ${loyaltyReturned.earned} earned removed, ${loyaltyReturned.used} used returned`);
        console.log("==========================================\n");

        await logSuccess({
            module: 'Invoice',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Delete',
            heading: 'Invoice Deleted Successfully',
            description: `Invoice ${invoiceNumber} deleted. All inventory and loyalty coins returned.`
        });

        res.status(200).json({
            message: "Invoice deleted successfully",
            deletedInvoice: deletedInvoice.toObject(),
            inventoryReturned: inventoryReturned,
            loyaltyReturned: loyaltyReturned
        });

    } catch (error) {
        console.error("\n❌ INVOICE DELETION FAILED:");
        console.error("Error:", error);
        console.error("Stack:", error.stack);
        console.log("==========================================\n");

        await logFailed({
            module: 'Invoice',
            userId: req.user.userId,
            userName: req.user.name,
            userEmail: req.user.email,
            action: 'Delete',
            heading: 'Invoice Deletion Failed',
            description: error.message || 'Unknown error occurred'
        });

        res.status(500).json({
            message: "Failed to delete invoice",
            error: error.message
        });
    }
});

module.exports = router;