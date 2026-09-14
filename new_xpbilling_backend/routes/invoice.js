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
const GlobalCounter = require("../models/globalCounter");
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
    const itemTypes = (mlSize === '3' || mlSize === '6')
        ? ['Bottle', 'Cap', 'Roll on', 'Box']
        : ['Bottle', 'Cap', 'Pump', 'Box'];
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
    const itemTypes = (mlSize === '3' || mlSize === '6')
        ? ['Bottle', 'Cap', 'Roll on', 'Box']
        : ['Bottle', 'Cap', 'Pump', 'Box'];
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
        // ✅ GENERATE INVOICE NUMBER (SEQUENTIAL, YEAR-RESET)
        // ============================================
        const now = new Date();
        const year = now.getFullYear();
        const counterId = `invoices-${year}`;

        const counter = await GlobalCounter.findOneAndUpdate(
            { id: counterId },
            { $inc: { count: 1 } },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true
            }
        );

        const invoiceNumber = `INV${year}${String(counter.count).padStart(4, "0")}`;
        console.log("📄 Generated Invoice Number:", invoiceNumber);

        const {
            customerId,
            newCustomer,
            workshopId,
            packageItems,
            dispenserItems,
            promoCode,
            paymentStatus,
            invoiceDate,
            notes,
            loyaltyCoinsUsed = 0
        } = req.body;

        console.log("\n📋 Request Data:");
        console.log("  👤 Customer ID:", customerId);
        console.log("  👤 New Customer:", newCustomer);
        console.log("  🏭 Workshop ID:", workshopId);
        console.log("  📦 Package Items:", packageItems?.length || 0);
        console.log("  💧 Dispenser Items:", dispenserItems?.length || 0);
        console.log("  🏷️ Promo Code:", promoCode);
        console.log("  💳 Payment:", paymentStatus);
        console.log("  🪙 Loyalty Coins Used:", loyaltyCoinsUsed);

        // ============================================
        // 1. VALIDATE / CREATE CUSTOMER
        // ============================================
        console.log("\n🔍 Step 1: Validating / Creating Customer...");

        let customer = null;

        // ✅ CASE A: Existing customer selected
        if (customerId) {
            console.log("  ℹ️ Existing customer ID provided:", customerId);

            customer = await Customer.findOne({ customerId });
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
        }
        // ✅ CASE B: New customer data provided
        else if (newCustomer) {
            console.log("  ℹ️ No customerId — attempting to create new customer");

            const { customerName, email, contactNumber } = newCustomer;

            if (!customerName || !customerName.trim()) {
                console.log("❌ New customer: name missing");
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: 'Customer name is required'
                });
                return res.status(400).json({
                    message: "Customer name is required"
                });
            }

            if (!contactNumber || !contactNumber.trim()) {
                console.log("❌ New customer: phone missing");
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: 'Customer phone number is required'
                });
                return res.status(400).json({
                    message: "Customer phone number is required"
                });
            }

            if (!/^[0-9]{10}$/.test(contactNumber.trim())) {
                console.log("❌ New customer: invalid phone format:", contactNumber);
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: 'Phone number must be exactly 10 digits'
                });
                return res.status(400).json({
                    message: "Phone number must be exactly 10 digits"
                });
            }

            if (email && email.trim() && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email.trim())) {
                console.log("❌ New customer: invalid email format:", email);
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: 'Invalid email format'
                });
                return res.status(400).json({
                    message: "Invalid email format"
                });
            }

            const existingByPhone = await Customer.findOne({ contactNumber: contactNumber.trim() });
            if (existingByPhone) {
                console.log("❌ New customer: phone already exists:", contactNumber);
                await logFailed({
                    module: 'Invoice',
                    userId: req.user.userId,
                    userName: req.user.name,
                    userEmail: req.user.email,
                    action: 'Create',
                    heading: 'Invoice Creation Failed',
                    description: `Customer with phone ${contactNumber} already exists`
                });
                return res.status(400).json({
                    message: "Customer with this phone number already exists"
                });
            }

            if (email && email.trim()) {
                const existingByEmail = await Customer.findOne({ email: email.trim() });
                if (existingByEmail) {
                    console.log("❌ New customer: email already exists:", email);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: `Customer with email ${email} already exists`
                    });
                    return res.status(400).json({
                        message: "Customer with this email already exists"
                    });
                }
            }

            const newCustDoc = new Customer({
                customerName: customerName.trim(),
                email: email && email.trim() ? email.trim() : undefined,
                contactNumber: contactNumber.trim()
            });

            customer = await newCustDoc.save();
            console.log("✅ New customer created:", customer.customerName, "|", customer.customerId);
        }
        // ✅ CASE C: Neither provided
        else {
            console.log("❌ No customerId and no newCustomer data provided");
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
                c => c.customerId === customer.customerId
            );

            if (!customerInWorkshop) {
                console.log("❌ Customer not in workshop:", customer.customerId);
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
        // 3. VALIDATE MULTIPLE PACKAGES & XP OILS
        // ============================================
        console.log("\n🔍 Step 3: Checking Packages & XP Oils...");
        let packageItemsData = [];
        let hasPackage = false;
        let packageFinalPriceTotal = 0;
        let packageDiscountTotal = 0;

        if (packageItems && packageItems.length > 0) {
            console.log("  📦 Total Packages:", packageItems.length);

            // ============================================
            // ✅ AGGREGATE STOCK DEMAND FIRST (across all packages)
            // ============================================
            const aggregatedXP = {};          // { xpId: totalML }
            let aggregatedFragranceBaseML = 0;
            const aggregatedBottles = {};     // { mlSize: totalQty }

            // First pass — build aggregated demand
            for (const pkg of packageItems) {
                const qty = parseInt(pkg.quantity) || 1;
                const xpOils = pkg.xpOilItems || [];
                for (const xp of xpOils) {
                    if (xp.xpId) {
                        const ml = parseFloat(xp.ml) || 0;
                        aggregatedXP[xp.xpId] = (aggregatedXP[xp.xpId] || 0) + (ml * qty);
                    }
                }
                if (pkg.fragranceBaseML) {
                    aggregatedFragranceBaseML += (parseFloat(pkg.fragranceBaseML) || 0) * qty;
                }
            }

            // We'll aggregate bottle demand once we know the bottleML of each package.
            // That happens inside the loop below — we'll check bottles per-package then.

            // ============================================
            // ✅ SECOND PASS — Validate each package individually
            // ============================================
            for (let i = 0; i < packageItems.length; i++) {
                const pkgInput = packageItems[i];
                const { packageId, xpOilItems, fragranceBaseML, discount } = pkgInput;
                const qty = parseInt(pkgInput.quantity) || 1;

                console.log(`\n  📦 Package ${i + 1}/${packageItems.length}:`);
                console.log(`    Package ID: ${packageId}`);
                console.log(`    Quantity: ${qty}`);
                console.log(`    XP Oils: ${xpOilItems?.length || 0}`);
                console.log(`    Fragrance Base ML: ${fragranceBaseML}`);
                console.log(`    Discount: ${discount}%`);

                // ✅ Validate package exists
                if (!packageId) {
                    console.log("❌ Package ID missing");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: 'Package ID is required for each package'
                    });
                    return res.status(400).json({
                        message: "Package ID is required for each package"
                    });
                }

                const selectedPackage = await Package.findOne({ packageId, isActive: true });
                if (!selectedPackage) {
                    console.log("❌ Package not found or inactive:", packageId);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: `Package not found or inactive: ${packageId}`
                    });
                    return res.status(404).json({
                        message: `Package not found or inactive: ${packageId}`
                    });
                }
                console.log(`    ✅ Package found: ${selectedPackage.packageName}`);

                // ✅ Validate qty
                if (qty < 1) {
                    console.log("❌ Invalid quantity:", qty);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: 'Package quantity must be at least 1'
                    });
                    return res.status(400).json({
                        message: "Package quantity must be at least 1"
                    });
                }

                // ✅ Validate XP oils
                const xpOilItemsFromRequest = xpOilItems || [];
                if (!xpOilItemsFromRequest || xpOilItemsFromRequest.length === 0) {
                    console.log("❌ No XP Oil items provided for this package");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: 'At least one XP Oil is required for each package'
                    });
                    return res.status(400).json({
                        message: "At least one XP Oil is required for each package"
                    });
                }

                // ✅ Validate fragranceBaseML
                if (fragranceBaseML === undefined || fragranceBaseML === null || parseFloat(fragranceBaseML) <= 0) {
                    console.log("❌ Invalid Fragrance Base ML:", fragranceBaseML);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: 'Fragrance Base ML must be greater than 0'
                    });
                    return res.status(400).json({
                        message: "Fragrance Base ML must be greater than 0"
                    });
                }

                const validatedFragranceBaseML = parseFloat(fragranceBaseML);

                // ✅ Validate each XP oil + build validatedXPOils array
                let totalXPMl = 0;
                let validatedXPOils = [];

                for (const xpItem of xpOilItemsFromRequest) {
                    const { xpId, ml } = xpItem;

                    if (!xpId) {
                        console.log("❌ XP Oil ID missing");
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

                    console.log(`    ✅ XP Oil: ${xpOil.productName}, ML: ${mlValue}ml`);
                }

                console.log(`    📊 Total XP ML (per unit): ${totalXPMl}ml`);
                console.log(`    🍷 Fragrance Base (per unit): ${validatedFragranceBaseML}ml`);

                // ✅ Compute per-package pricing
                const pkgDiscountPercent = discount !== undefined ? discount : selectedPackage.discount || 0;
                const pkgDiscountAmount = (selectedPackage.pricing * pkgDiscountPercent) / 100;
                const pkgFinalPrice = selectedPackage.pricing - pkgDiscountAmount;

                // Accumulate totals
                packageDiscountTotal += pkgDiscountAmount * qty;
                packageFinalPriceTotal += pkgFinalPrice * qty;

                console.log(`    💰 Package Unit Price: ₹${selectedPackage.pricing}`);
                console.log(`    💰 Discount: ${pkgDiscountPercent}% (₹${pkgDiscountAmount})`);
                console.log(`    💰 Final Unit Price: ₹${pkgFinalPrice}`);
                console.log(`    💰 Line Total (× ${qty}): ₹${pkgFinalPrice * qty}`);

                // ✅ Bottles per-package (must check per ml size because bottles differ)
                const mlSize = selectedPackage.bottleML.toString();
                aggregatedBottles[mlSize] = (aggregatedBottles[mlSize] || 0) + qty;

                // Build package data object
                packageItemsData.push({
                    packageId: selectedPackage.packageId,
                    packageName: selectedPackage.packageName,
                    pricing: selectedPackage.pricing,
                    oilCount: selectedPackage.oilCount,
                    quantity: qty,
                    discount: pkgDiscountPercent,
                    discountAmount: pkgDiscountAmount,
                    finalPrice: pkgFinalPrice,
                    bottleML: selectedPackage.bottleML,
                    fillingLevel: selectedPackage.fillingLevel,
                    fragranceQty: totalXPMl,
                    alcoholQty: validatedFragranceBaseML,
                    xpOilItems: validatedXPOils,
                    xpOil: validatedXPOils.length > 0 ? {
                        xpId: validatedXPOils[0].xpId,
                        productName: validatedXPOils[0].productName,
                        quantity: validatedXPOils[0].quantityInKG,
                        density: validatedXPOils[0].density
                    } : null
                });
            }

            hasPackage = true;

            // ============================================
            // ✅ AGGREGATED STOCK VALIDATION
            // ============================================
            console.log("\n🔍 Aggregated Stock Validation Across All Packages...");

            // ✅ 1. Fragrance Base — check total demand
            if (aggregatedFragranceBaseML > 0) {
                const totalAlcoholKG = aggregatedFragranceBaseML / 820;
                console.log("  🍷 Total Fragrance Base Required:", aggregatedFragranceBaseML, "ml (", totalAlcoholKG, "KG)");

                const alcoholProduct = await XPInventory.findOne({ productName: "FRAGRANCE BASE" });
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

                if (alcoholProduct.quantity < totalAlcoholKG) {
                    console.log("❌ Insufficient Fragrance Base stock. Available:", alcoholProduct.quantity, "KG, Required:", totalAlcoholKG, "KG");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Create',
                        heading: 'Invoice Creation Failed',
                        description: `Insufficient Fragrance Base stock. Available: ${alcoholProduct.quantity} KG, Required: ${totalAlcoholKG} KG (${aggregatedFragranceBaseML} ML)`
                    });
                    return res.status(400).json({
                        message: `Insufficient Fragrance Base stock. Available: ${alcoholProduct.quantity} KG, Required: ${totalAlcoholKG} KG (${aggregatedFragranceBaseML} ML)`
                    });
                }
                console.log("  ✅ Fragrance Base stock sufficient");
            }

            // ✅ 2. XP Oils — check each aggregated oil
            for (const [xpId, totalML] of Object.entries(aggregatedXP)) {
                if (totalML <= 0) continue;
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
                const requiredKG = totalML / (xpOil.density || 1000);
                console.log(`  🧪 ${xpOil.productName}: required ${totalML}ml (${requiredKG}KG), available ${xpOil.quantity}KG`);

                if (xpOil.quantity < requiredKG) {
                    console.log(`❌ Insufficient stock for ${xpOil.productName}`);
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
            }
            console.log("  ✅ All XP Oils stock sufficient");

            // ✅ 3. Bottles — check each ml size
            for (const [mlSize, totalQty] of Object.entries(aggregatedBottles)) {
                const bottleItems = (mlSize === '3' || mlSize === '6')
                    ? ['Bottle', 'Cap', 'Roll on', 'Box']
                    : ['Bottle', 'Cap', 'Pump', 'Box'];

                for (const itemType of bottleItems) {
                    const bottleStock = await BottlesInventory.findOne({ mlSize, itemType });
                    if (!bottleStock || bottleStock.quantity < totalQty) {
                        console.log(`❌ Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}, Required: ${totalQty}`);
                        await logFailed({
                            module: 'Invoice',
                            userId: req.user.userId,
                            userName: req.user.name,
                            userEmail: req.user.email,
                            action: 'Create',
                            heading: 'Invoice Creation Failed',
                            description: `Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}, Required: ${totalQty}`
                        });
                        return res.status(400).json({
                            message: `Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}, Required: ${totalQty}`
                        });
                    }
                }
                console.log(`  ✅ ${mlSize}ml bottles: ${totalQty} sets sufficient`);
            }

            console.log("  ✅ All aggregated stock checks passed");
        } else {
            console.log("  ℹ️ No packages provided");
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

                const mlSize = ml.toString();
                const bottleItems = (mlSize === '3' || mlSize === '6')
                    ? ['Bottle', 'Cap', 'Roll on', 'Box']
                    : ['Bottle', 'Cap', 'Pump', 'Box'];
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

                const dbPrice = ml === 3 ? xpOil.sellingPrice3ml : xpOil.sellingPrice6ml;
                const baseUnitPrice = unitPrice !== undefined && unitPrice > 0 ? unitPrice : dbPrice;

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

                // ✅ REDUCE XP Inventory
                await reduceXPOil(
                    xpOil.xpId,
                    totalML,
                    req.user,
                    'Invoice - Dispenser',
                    `Reduced for invoice ${invoiceNumber} (${xpOil.productName}: ${ml}ml × ${quantity})`
                );

                // ✅ REDUCE BOTTLE INVENTORY FOR DISPENSERS
                await reduceBottlesInventory(
                    ml.toString(),
                    quantity,
                    req.user,
                    'Invoice - Dispenser',
                    `Reduced for invoice ${invoiceNumber} (Dispenser: ${xpOil.productName}, ${ml}ml × ${quantity})`
                );
            }
            console.log("  ✅ All dispenser items validated and inventory reduced");
        } else {
            console.log("  ℹ️ No dispenser items provided");
        }

        // ============================================
        // 5. CALCULATE SUBTOTAL
        // ============================================
        const subtotal = packageFinalPriceTotal + dispenserSubtotal;
        console.log("\n💰 SUBTOTAL CALCULATION:");
        console.log("  📦 Package Final Total: ₹", packageFinalPriceTotal);
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

            const nowPromo = new Date();
            if (promo.startDate > nowPromo || promo.endDate < nowPromo) {
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

        const totalDiscountAmount = packageDiscountTotal + totalDispenserDiscount + promoDiscountAmount + loyaltyDiscountAmount;
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
            invoiceId: invoiceNumber,
            invoiceNumber: invoiceNumber,
            customer: {
                customerId: customer.customerId,
                customerName: customer.customerName,
                email: customer.email || '',
                contactNumber: customer.contactNumber,
                loyaltyCoins: currentCoins
            },
            workshop: workshopData,
            hasWorkshop: hasWorkshop,
            packageItems: packageItemsData,
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
            packageDiscountAmount: packageDiscountTotal,
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
                c => c.customerId === customer.customerId
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
        // 11. REDUCE PACKAGE INVENTORIES (per package, using qty)
        // ============================================
        console.log("\n🔍 Step 11: Reducing Package Inventories...");
        const inventoryUpdates = [];

        if (hasPackage && packageItemsData.length > 0) {
            for (let i = 0; i < packageItemsData.length; i++) {
                const pkg = packageItemsData[i];
                const qty = pkg.quantity || 1;

                console.log(`\n  📦 Package ${i + 1}/${packageItemsData.length}: ${pkg.packageName} (qty ${qty})`);

                // ✅ Reduce XP Oils × qty
                const xpItemsForReduction = pkg.xpOilItems.map(item => ({
                    xpId: item.xpId,
                    ml: item.ml * qty
                }));

                const xpResult = await reduceMultipleXPOils(
                    xpItemsForReduction,
                    req.user,
                    invoice.invoiceNumber
                );
                inventoryUpdates.push({ type: `XP Oils (Package ${i + 1})`, details: xpResult.results });
                console.log(`  ✅ ${xpResult.results.length} XP Oils reduced: ${xpResult.totalML}ml total (incl. qty ×${qty})`);

                // ✅ Reduce Fragrance Base × qty
                const totalFragranceForThisPkg = pkg.alcoholQty * qty;
                const alcoholResult = await reduceAlcohol(
                    totalFragranceForThisPkg,
                    req.user,
                    'Invoice - Fragrance Base',
                    `Reduced for invoice ${invoice.invoiceNumber} (Package ${i + 1}: ${pkg.packageName}, Fragrance Base: ${totalFragranceForThisPkg}ml)`
                );
                inventoryUpdates.push({ type: `Fragrance Base (Package ${i + 1})`, details: alcoholResult });
                console.log(`  ✅ Fragrance Base reduced: ${totalFragranceForThisPkg}ml (incl. qty ×${qty})`);

                // ✅ Reduce Bottles × qty
                const mlSize = pkg.bottleML.toString();
                const bottleResult = await reduceBottlesInventory(
                    mlSize,
                    qty,
                    req.user,
                    'Invoice - Package',
                    `Reduced for invoice ${invoice.invoiceNumber} (Package ${i + 1}: ${pkg.packageName}, ${mlSize}ml × ${qty})`
                );
                inventoryUpdates.push({ type: `Bottles (Package ${i + 1})`, details: bottleResult });
                console.log(`  ✅ Bottles reduced: ${mlSize}ml × ${qty}`);
            }
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
                packageFinalTotal: packageFinalPriceTotal,
                packageDiscountTotal: packageDiscountTotal,
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
            packageItems,
            dispenserItems,
            promoCode,
            paymentStatus,
            invoiceDate,
            notes
        } = req.body;

        console.log("\n📋 Update Data:");
        console.log("  📦 Package Items:", packageItems?.length || 0);
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
        // ✅ Normalize OLD invoice packages to array (A1 backward compat)
        // ============================================
        let originalPackageItems = [];
        if (originalInvoice.packageItems && originalInvoice.packageItems.length > 0) {
            originalPackageItems = originalInvoice.packageItems.map(p => p.toObject ? p.toObject() : p);
        } else if (originalInvoice.packageItem && originalInvoice.packageItem.packageId) {
            originalPackageItems = [
                originalInvoice.packageItem.toObject ? originalInvoice.packageItem.toObject() : originalInvoice.packageItem
            ];
            // Ensure qty exists
            if (!originalPackageItems[0].quantity) originalPackageItems[0].quantity = 1;
        }
        console.log("  📦 Original Packages (normalized):", originalPackageItems.length);

        // ✅ Build oldByLineId map at higher scope (used in Step 3 AND Step 5)
        const oldByLineId = {};
        for (const op of originalPackageItems) {
            if (op.lineId) {
                oldByLineId[op.lineId] = op;
            }
        }
        console.log("  📊 Old packages with lineId:", Object.keys(oldByLineId).length);

        // ============================================
        // 2. TRACK CHANGES
        // ============================================
        console.log("\n🔍 Step 2: Tracking Changes...");
        console.log("  💧 Original Dispensers:", originalInvoice.dispenserItems?.length || 0);

        // ============================================
        // 3. VALIDATE NEW PACKAGES & XP OILS
        // ============================================
        console.log("\n🔍 Step 3: Validating New Packages...");
        let newPackageItemsData = [];
        let hasPackage = false;
        let packageFinalPriceTotal = 0;
        let packageDiscountTotal = 0;

        if (packageItems && packageItems.length > 0) {
            console.log("  📦 Total New Packages:", packageItems.length);

            // ============================================
            // ✅ AGGREGATE STOCK DEMAND — only for NEW or CHANGED packages
            // ============================================
            const aggregatedXP = {};
            let aggregatedFragranceBaseML = 0;
            const aggregatedBottles = {};

            // First determine which items need to be "reduced"
            const itemsNeedingReduction = [];

            for (const pkgInput of packageItems) {
                const qty = parseInt(pkgInput.quantity) || 1;
                const incomingLineId = pkgInput.lineId || null;

                // Check if this is unchanged vs old
                let isUnchanged = false;
                if (incomingLineId && oldByLineId[incomingLineId]) {
                    const oldPkg = oldByLineId[incomingLineId];
                    // Compare: packageId, qty, discount, fragranceBaseML, xpOilItems
                    const oldQty = oldPkg.quantity || 1;
                    const oldXp = (oldPkg.xpOilItems || []).map(x => ({ xpId: x.xpId, ml: x.ml })).sort((a, b) => a.xpId.localeCompare(b.xpId));
                    const newXp = (pkgInput.xpOilItems || []).map(x => ({ xpId: x.xpId, ml: parseFloat(x.ml) })).sort((a, b) => a.xpId.localeCompare(b.xpId));

                    const xpEqual = oldXp.length === newXp.length && oldXp.every((o, idx) => o.xpId === newXp[idx].xpId && o.ml === newXp[idx].ml);
                    const otherEqual =
                        oldPkg.packageId === pkgInput.packageId &&
                        oldQty === qty &&
                        (oldPkg.discount || 0) === (pkgInput.discount || 0) &&
                        (oldPkg.alcoholQty || 0) === parseFloat(pkgInput.fragranceBaseML || 0);

                    if (xpEqual && otherEqual) {
                        isUnchanged = true;
                    }
                }

                if (isUnchanged) {
                    console.log(`  ℹ️ Package unchanged (lineId: ${incomingLineId})`);
                    // Still need to compute pricing for the invoice total
                    const selectedPackage = await Package.findOne({ packageId: pkgInput.packageId, isActive: true });
                    if (!selectedPackage) {
                        console.log("❌ Package not found or inactive:", pkgInput.packageId);
                        await logFailed({
                            module: 'Invoice',
                            userId: req.user.userId,
                            userName: req.user.name,
                            userEmail: req.user.email,
                            action: 'Update',
                            heading: 'Invoice Update Failed',
                            description: `Package not found or inactive: ${pkgInput.packageId}`
                        });
                        return res.status(404).json({
                            message: `Package not found or inactive: ${pkgInput.packageId}`
                        });
                    }

                    const pkgDiscountPercent = pkgInput.discount !== undefined ? pkgInput.discount : selectedPackage.discount || 0;
                    const pkgDiscountAmount = (selectedPackage.pricing * pkgDiscountPercent) / 100;
                    const pkgFinalPrice = selectedPackage.pricing - pkgDiscountAmount;

                    packageDiscountTotal += pkgDiscountAmount * qty;
                    packageFinalPriceTotal += pkgFinalPrice * qty;

                    // Build validated xp oils (from old, unchanged)
                    const validatedXPOils = [];
                    for (const x of (pkgInput.xpOilItems || [])) {
                        const xpOil = await XPInventory.findOne({ xpId: x.xpId });
                        if (!xpOil) {
                            console.log("❌ XP Oil not found:", x.xpId);
                            await logFailed({
                                module: 'Invoice',
                                userId: req.user.userId,
                                userName: req.user.name,
                                userEmail: req.user.email,
                                action: 'Update',
                                heading: 'Invoice Update Failed',
                                description: `XP Oil not found: ${x.xpId}`
                            });
                            return res.status(404).json({
                                message: `XP Oil not found: ${x.xpId}`
                            });
                        }
                        const mlValue = parseFloat(x.ml);
                        validatedXPOils.push({
                            xpId: xpOil.xpId,
                            productName: xpOil.productName,
                            ml: mlValue,
                            quantityInKG: mlValue / (xpOil.density || 1000),
                            density: xpOil.density || 1000,
                            pricePerKG: xpOil.avgPurchasePrice || 0
                        });
                    }

                    newPackageItemsData.push({
                        lineId: incomingLineId,  // preserve original lineId
                        packageId: selectedPackage.packageId,
                        packageName: selectedPackage.packageName,
                        pricing: selectedPackage.pricing,
                        oilCount: selectedPackage.oilCount,
                        quantity: qty,
                        discount: pkgDiscountPercent,
                        discountAmount: pkgDiscountAmount,
                        finalPrice: pkgFinalPrice,
                        bottleML: selectedPackage.bottleML,
                        fillingLevel: selectedPackage.fillingLevel,
                        fragranceQty: validatedXPOils.reduce((s, o) => s + o.ml, 0),
                        alcoholQty: parseFloat(pkgInput.fragranceBaseML || 0),
                        xpOilItems: validatedXPOils,
                        xpOil: validatedXPOils.length > 0 ? {
                            xpId: validatedXPOils[0].xpId,
                            productName: validatedXPOils[0].productName,
                            quantity: validatedXPOils[0].quantityInKG,
                            density: validatedXPOils[0].density
                        } : null
                    });
                    continue;
                }

                // This item needs reduction — add to aggregation
                itemsNeedingReduction.push(pkgInput);
            }

            // Aggregate demand for items needing reduction
            for (const pkgInput of itemsNeedingReduction) {
                const qty = parseInt(pkgInput.quantity) || 1;
                for (const xp of (pkgInput.xpOilItems || [])) {
                    if (xp.xpId) {
                        const ml = parseFloat(xp.ml) || 0;
                        aggregatedXP[xp.xpId] = (aggregatedXP[xp.xpId] || 0) + (ml * qty);
                    }
                }
                if (pkgInput.fragranceBaseML) {
                    aggregatedFragranceBaseML += (parseFloat(pkgInput.fragranceBaseML) || 0) * qty;
                }
            }

            // ============================================
            // ✅ AGGREGATED STOCK VALIDATION (only for items needing reduction)
            // ============================================
            console.log("\n🔍 Aggregated Stock Validation (for new/changed items)...");

            if (aggregatedFragranceBaseML > 0) {
                const totalAlcoholKG = aggregatedFragranceBaseML / 820;
                const alcoholProduct = await XPInventory.findOne({ productName: "FRAGRANCE BASE" });
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
                if (alcoholProduct.quantity < totalAlcoholKG) {
                    console.log("❌ Insufficient Fragrance Base stock");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: `Insufficient Fragrance Base stock. Available: ${alcoholProduct.quantity} KG, Required: ${totalAlcoholKG} KG`
                    });
                    return res.status(400).json({
                        message: `Insufficient Fragrance Base stock. Available: ${alcoholProduct.quantity} KG, Required: ${totalAlcoholKG} KG (${aggregatedFragranceBaseML} ML)`
                    });
                }
                console.log("  ✅ Fragrance Base stock sufficient");
            }

            for (const [xpId, totalML] of Object.entries(aggregatedXP)) {
                if (totalML <= 0) continue;
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
                const requiredKG = totalML / (xpOil.density || 1000);
                if (xpOil.quantity < requiredKG) {
                    console.log(`❌ Insufficient stock for ${xpOil.productName}`);
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
            }
            console.log("  ✅ All XP Oils stock sufficient");

            // Bottles — aggregate mlSize demand from itemsNeedingReduction
            for (const pkgInput of itemsNeedingReduction) {
                const qty = parseInt(pkgInput.quantity) || 1;
                const selectedPackage = await Package.findOne({ packageId: pkgInput.packageId, isActive: true });
                if (!selectedPackage) continue;
                const mlSize = selectedPackage.bottleML.toString();
                aggregatedBottles[mlSize] = (aggregatedBottles[mlSize] || 0) + qty;
            }

            for (const [mlSize, totalQty] of Object.entries(aggregatedBottles)) {
                const bottleItems = (mlSize === '3' || mlSize === '6')
                    ? ['Bottle', 'Cap', 'Roll on', 'Box']
                    : ['Bottle', 'Cap', 'Pump', 'Box'];
                for (const itemType of bottleItems) {
                    const bottleStock = await BottlesInventory.findOne({ mlSize, itemType });
                    if (!bottleStock || bottleStock.quantity < totalQty) {
                        console.log(`❌ Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}, Required: ${totalQty}`);
                        await logFailed({
                            module: 'Invoice',
                            userId: req.user.userId,
                            userName: req.user.name,
                            userEmail: req.user.email,
                            action: 'Update',
                            heading: 'Invoice Update Failed',
                            description: `Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}, Required: ${totalQty}`
                        });
                        return res.status(400).json({
                            message: `Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}, Required: ${totalQty}`
                        });
                    }
                }
            }
            console.log("  ✅ All bottle stock sufficient");

            // ============================================
            // Now loop itemsNeedingReduction, validate individually + build packageItemsData
            // ============================================
            for (let idx = 0; idx < itemsNeedingReduction.length; idx++) {
                const pkgInput = itemsNeedingReduction[idx];
                const { packageId, xpOilItems, fragranceBaseML, discount, lineId } = pkgInput;
                const qty = parseInt(pkgInput.quantity) || 1;

                console.log(`\n  📦 New/Changed Package ${idx + 1}/${itemsNeedingReduction.length}:`);
                console.log(`    Package ID: ${packageId}`);
                console.log(`    Quantity: ${qty}`);
                console.log(`    LineId (incoming): ${lineId || 'NEW'}`);

                if (!packageId) {
                    console.log("❌ Package ID missing");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: 'Package ID is required for each package'
                    });
                    return res.status(400).json({
                        message: "Package ID is required for each package"
                    });
                }

                const selectedPackage = await Package.findOne({ packageId, isActive: true });
                if (!selectedPackage) {
                    console.log("❌ Package not found or inactive:", packageId);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: `Package not found or inactive: ${packageId}`
                    });
                    return res.status(404).json({
                        message: `Package not found or inactive: ${packageId}`
                    });
                }

                if (qty < 1) {
                    console.log("❌ Invalid quantity:", qty);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: 'Package quantity must be at least 1'
                    });
                    return res.status(400).json({
                        message: "Package quantity must be at least 1"
                    });
                }

                const xpOilItemsFromRequest = xpOilItems || [];
                if (xpOilItemsFromRequest.length === 0) {
                    console.log("❌ No XP Oil items provided for this package");
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: 'At least one XP Oil is required for each package'
                    });
                    return res.status(400).json({
                        message: "At least one XP Oil is required for each package"
                    });
                }

                if (fragranceBaseML === undefined || fragranceBaseML === null || parseFloat(fragranceBaseML) <= 0) {
                    console.log("❌ Invalid Fragrance Base ML:", fragranceBaseML);
                    await logFailed({
                        module: 'Invoice',
                        userId: req.user.userId,
                        userName: req.user.name,
                        userEmail: req.user.email,
                        action: 'Update',
                        heading: 'Invoice Update Failed',
                        description: 'Fragrance Base ML must be greater than 0'
                    });
                    return res.status(400).json({
                        message: "Fragrance Base ML must be greater than 0"
                    });
                }

                const validatedFragranceBaseML = parseFloat(fragranceBaseML);

                let totalXPMl = 0;
                let validatedXPOils = [];

                for (const xpItem of xpOilItemsFromRequest) {
                    const { xpId, ml } = xpItem;

                    if (!xpId) {
                        console.log("❌ XP Oil ID missing");
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
                }

                const pkgDiscountPercent = discount !== undefined ? discount : selectedPackage.discount || 0;
                const pkgDiscountAmount = (selectedPackage.pricing * pkgDiscountPercent) / 100;
                const pkgFinalPrice = selectedPackage.pricing - pkgDiscountAmount;

                packageDiscountTotal += pkgDiscountAmount * qty;
                packageFinalPriceTotal += pkgFinalPrice * qty;

                newPackageItemsData.push({
                    lineId: lineId || null,   // preserve if given, schema will generate if null
                    packageId: selectedPackage.packageId,
                    packageName: selectedPackage.packageName,
                    pricing: selectedPackage.pricing,
                    oilCount: selectedPackage.oilCount,
                    quantity: qty,
                    discount: pkgDiscountPercent,
                    discountAmount: pkgDiscountAmount,
                    finalPrice: pkgFinalPrice,
                    bottleML: selectedPackage.bottleML,
                    fillingLevel: selectedPackage.fillingLevel,
                    fragranceQty: totalXPMl,
                    alcoholQty: validatedFragranceBaseML,
                    xpOilItems: validatedXPOils,
                    xpOil: validatedXPOils.length > 0 ? {
                        xpId: validatedXPOils[0].xpId,
                        productName: validatedXPOils[0].productName,
                        quantity: validatedXPOils[0].quantityInKG,
                        density: validatedXPOils[0].density
                    } : null
                });
            }

            hasPackage = true;
        } else {
            console.log("  ℹ️ No packages in update");
        }

        // ============================================
        // 4. VALIDATE NEW DISPENSERS
        // ============================================
        console.log("\n🔍 Step 4: Validating New Dispenser Items...");
        let newDispenserItems = [];
        let hasDispenser = false;
        let dispenserSubtotal = 0;
        let totalDispenserDiscount = 0;

        if (dispenserItems && dispenserItems.length > 0) {
            for (const item of dispenserItems) {
                const { xpId, ml, quantity, unitPrice, discount } = item;

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
                    console.log("❌ Invalid ML:", ml);
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
                    console.log("❌ Invalid quantity:", quantity);
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

                const totalML = ml * quantity;
                const requiredKG = totalML / 1000;

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

                const mlSize = ml.toString();
                const bottleItems = (mlSize === '3' || mlSize === '6')
                    ? ['Bottle', 'Cap', 'Roll on', 'Box']
                    : ['Bottle', 'Cap', 'Pump', 'Box'];
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
                            description: `Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}, Required: ${quantity}`
                        });
                        return res.status(400).json({
                            message: `Insufficient ${mlSize}ml ${itemType} stock. Available: ${bottleStock?.quantity || 0}, Required: ${quantity}`
                        });
                    }
                }

                const dbPrice = ml === 3 ? xpOil.sellingPrice3ml : xpOil.sellingPrice6ml;
                const baseUnitPrice = unitPrice !== undefined && unitPrice > 0 ? unitPrice : dbPrice;

                const itemDiscountPercent = discount !== undefined ? discount : 0;
                const originalTotal = baseUnitPrice * quantity;
                const discountAmount = (originalTotal * itemDiscountPercent) / 100;
                const finalPrice = originalTotal - discountAmount;

                newDispenserItems.push({
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
            }
        } else {
            console.log("  ℹ️ No dispenser items provided");
        }

        // ============================================
        // 5. EXECUTE INVENTORY ROLLBACK AND NEW REDUCTIONS
        // ============================================
        console.log("\n🔍 Step 5: Executing Inventory Rollback + Reductions...");
        const inventoryChanges = [];

        // 5a. Return ALL old packages (C4-ish for old, but new side only reduces changed/new)
        //    Wait — we already diff'd. So we should return ONLY old packages that are:
        //    - removed (lineId not present in new)
        //    - OR changed (lineId present but content differs)
        // ============================================

        // Build a map of new incoming lineIds
        const newLineIdsSet = new Set(
            packageItems.map(p => p.lineId).filter(Boolean)
        );

        // Also identify changed lineIds (those in both old and new, but content differs)
        // Easier way: for each old package, if its lineId is either absent in new OR the new item is flagged as needing reduction → return old.
        const changedLineIds = new Set(
            (packageItems || [])
                .filter(p => p.lineId && oldByLineId[p.lineId])
                .filter(p => {
                    const oldPkg = oldByLineId[p.lineId];
                    const oldQty = oldPkg.quantity || 1;
                    const oldXp = (oldPkg.xpOilItems || []).map(x => ({ xpId: x.xpId, ml: x.ml })).sort((a, b) => a.xpId.localeCompare(b.xpId));
                    const newXp = (p.xpOilItems || []).map(x => ({ xpId: x.xpId, ml: parseFloat(x.ml) })).sort((a, b) => a.xpId.localeCompare(b.xpId));
                    const xpEqual = oldXp.length === newXp.length && oldXp.every((o, i) => o.xpId === newXp[i].xpId && o.ml === newXp[i].ml);
                    const otherEqual =
                        oldPkg.packageId === p.packageId &&
                        oldQty === (parseInt(p.quantity) || 1) &&
                        (oldPkg.discount || 0) === (p.discount || 0) &&
                        (oldPkg.alcoholQty || 0) === parseFloat(p.fragranceBaseML || 0);
                    return !(xpEqual && otherEqual);
                })
                .map(p => p.lineId)
        );

        // Now loop OLD packages and decide: return or skip
        for (const oldPkg of originalPackageItems) {
            const oldLineId = oldPkg.lineId;

            const isRemoved = !newLineIdsSet.has(oldLineId);
            const isChanged = changedLineIds.has(oldLineId);

            if (!isRemoved && !isChanged) {
                console.log(`  ℹ️ Old package unchanged → skipping return (lineId: ${oldLineId})`);
                continue;
            }

            const qty = oldPkg.quantity || 1;
            const reason = isRemoved ? 'Removed' : 'Changed';
            console.log(`  🔄 Old package ${reason}: ${oldPkg.packageName} (lineId: ${oldLineId}, qty ${qty})`);

            // Return XP oils × qty
            const xpItemsForReturn = (oldPkg.xpOilItems || []).map(x => ({
                xpId: x.xpId,
                ml: x.ml * qty
            }));
            if (xpItemsForReturn.length > 0) {
                const returnResult = await returnMultipleXPOils(xpItemsForReturn, req.user, invoiceNumber);
                inventoryChanges.push({ type: `XP Oils Returned (${reason})`, details: returnResult.results });
                console.log(`  ✅ Returned ${returnResult.results.length} XP Oils: ${returnResult.totalML}ml`);
            }

            // Return Fragrance Base × qty
            const totalFragranceToReturn = (oldPkg.alcoholQty || 0) * qty;
            if (totalFragranceToReturn > 0) {
                await returnAlcohol(
                    totalFragranceToReturn,
                    req.user,
                    `Invoice Edit - ${reason} - Return`,
                    `Returned for invoice ${invoiceNumber} (Old package ${reason}: ${oldPkg.packageName})`
                );
                inventoryChanges.push({ type: `Fragrance Base Returned (${reason})`, details: totalFragranceToReturn });
                console.log(`  ✅ Returned Fragrance Base: ${totalFragranceToReturn}ml`);
            }

            // Return Bottles × qty
            await returnBottlesInventory(
                oldPkg.bottleML.toString(),
                qty,
                req.user,
                `Invoice Edit - ${reason} - Return`,
                `Returned for invoice ${invoiceNumber} (Old package ${reason}: ${oldPkg.packageName})`
            );
            inventoryChanges.push({ type: `Bottles Returned (${reason})`, details: oldPkg.bottleML });
            console.log(`  ✅ Returned Bottles: ${oldPkg.bottleML}ml × ${qty}`);
        }

        // 5b. Reduce NEW packages (only new + changed — unchanged were already skipped in aggregation)
        //     We need to reduce the NEW side for: items in newPackageItemsData whose lineId is either NEW (no old match) OR changed.
        //     Actually, newPackageItemsData contains both unchanged (kept) and changed/new packages.
        //     We want to reduce only the changed/new ones.
        // ============================================
        for (let i = 0; i < newPackageItemsData.length; i++) {
            const pkg = newPackageItemsData[i];
            const lineId = pkg.lineId;
            const qty = pkg.quantity || 1;

            // Skip unchanged (lineId exists in old AND not in changedLineIds)
            const wasInOld = lineId && oldByLineId[lineId];
            const wasChanged = lineId && changedLineIds.has(lineId);
            const isBrandNew = !lineId || !oldByLineId[lineId];

            if (wasInOld && !wasChanged) {
                console.log(`  ℹ️ Skipping reduce for unchanged package (lineId: ${lineId})`);
                continue;
            }

            console.log(`\n  📦 Reducing new/changed package: ${pkg.packageName} (qty ${qty})`);

            // Reduce XP oils × qty
            const xpItemsForReduction = pkg.xpOilItems.map(x => ({
                xpId: x.xpId,
                ml: x.ml * qty
            }));
            const xpResult = await reduceMultipleXPOils(xpItemsForReduction, req.user, invoiceNumber);
            inventoryChanges.push({ type: `XP Oils Reduced`, details: xpResult.results });
            console.log(`  ✅ Reduced ${xpResult.results.length} XP Oils: ${xpResult.totalML}ml`);

            // Reduce Fragrance Base × qty
            const totalFragrance = pkg.alcoholQty * qty;
            const alcoholResult = await reduceAlcohol(
                totalFragrance,
                req.user,
                'Invoice Edit - Reduction',
                `Reduced for invoice ${invoiceNumber} (Package: ${pkg.packageName}, ${totalFragrance}ml)`
            );
            inventoryChanges.push({ type: 'Fragrance Base Reduced', details: alcoholResult });
            console.log(`  ✅ Reduced Fragrance Base: ${totalFragrance}ml`);

            // Reduce Bottles × qty
            const mlSize = pkg.bottleML.toString();
            const bottleResult = await reduceBottlesInventory(
                mlSize,
                qty,
                req.user,
                'Invoice Edit - Reduction',
                `Reduced for invoice ${invoiceNumber} (Package: ${pkg.packageName}, ${mlSize}ml × ${qty})`
            );
            inventoryChanges.push({ type: 'Bottles Reduced', details: bottleResult });
            console.log(`  ✅ Reduced Bottles: ${mlSize}ml × ${qty}`);
        }

        // 5c. Handle Dispenser Changes (C4 - return old, reduce new)
        console.log("\n  💧 Handling Dispenser Changes (C4 — return old, reduce new)...");
        const oldDispenserItems = originalInvoice.dispenserItems || [];

        // Return ALL old dispensers
        for (const oldItem of oldDispenserItems) {
            const totalML = oldItem.totalML || (oldItem.ml * oldItem.quantity);
            await returnXPOil(
                oldItem.xpId,
                totalML,
                req.user,
                'Invoice Edit - Return',
                `Returned for invoice ${invoiceNumber} (Dispenser: ${oldItem.productName})`
            );
            await returnBottlesInventory(
                oldItem.ml.toString(),
                oldItem.quantity,
                req.user,
                'Invoice Edit - Return',
                `Returned for invoice ${invoiceNumber} (Dispenser bottles: ${oldItem.productName})`
            );
            inventoryChanges.push({ type: 'Dispenser Returned (Old)', details: oldItem });
        }
        if (oldDispenserItems.length > 0) {
            console.log(`  ✅ Returned ${oldDispenserItems.length} old dispenser items`);
        }

        // Reduce ALL new dispensers
        for (const newItem of newDispenserItems) {
            const totalML = newItem.totalML || (newItem.ml * newItem.quantity);
            await reduceXPOil(
                newItem.xpId,
                totalML,
                req.user,
                'Invoice Edit - Reduction',
                `Reduced for invoice ${invoiceNumber} (Dispenser: ${newItem.productName})`
            );
            await reduceBottlesInventory(
                newItem.ml.toString(),
                newItem.quantity,
                req.user,
                'Invoice Edit - Reduction',
                `Reduced for invoice ${invoiceNumber} (Dispenser bottles: ${newItem.productName})`
            );
            inventoryChanges.push({ type: 'Dispenser Reduced (New)', details: newItem });
        }
        if (newDispenserItems.length > 0) {
            console.log(`  ✅ Reduced ${newDispenserItems.length} new dispenser items`);
        }

        // ============================================
        // 6. CALCULATE NEW TOTALS
        // ============================================
        console.log("\n💰 Step 6: Calculating New Totals...");
        const subtotal = packageFinalPriceTotal + dispenserSubtotal;
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

            const nowPromo = new Date();
            if (promo.startDate > nowPromo || promo.endDate < nowPromo) {
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
        } else {
            console.log("  🪙 No loyalty coins used");
        }

        const newLoyaltyEarned = Math.floor(afterLoyalty / 100);
        console.log(`  🪙 Loyalty Coins EARNED (recalculated): ${newLoyaltyEarned} coins`);

        const gstAmount = afterLoyalty * (GST_RATE / 100);
        const grandTotal = afterLoyalty + gstAmount;
        console.log("  💰 GRAND TOTAL: ₹", grandTotal);

        const totalDiscountAmount = packageDiscountTotal + totalDispenserDiscount + promoDiscountAmount + loyaltyDiscountAmount;
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
        } else {
            console.log("  ⚠️ Customer not found, skipping loyalty update");
        }

        // ============================================
        // 8. UPDATE INVOICE
        // ============================================
        console.log("\n📝 Step 8: Updating Invoice...");

        const updatedCustomer = await Customer.findOne({ customerId: originalInvoice.customer.customerId });
        const newLoyaltyBalance = updatedCustomer ? updatedCustomer.loyaltyCoins : originalInvoice.customer.loyaltyCoins || 0;

        // Prepare packageItems with lineIds (schema will generate for null ones)
        const finalPackageItems = newPackageItemsData.map(p => {
            const obj = { ...p };
            if (!obj.lineId) {
                delete obj.lineId;  // Let schema default generate
            }
            return obj;
        });

        const updateData = {
            packageItems: finalPackageItems,
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
            packageDiscountAmount: packageDiscountTotal,
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
        console.log("  📄 Invoice Number:", updatedInvoice.invoiceNumber);
        console.log("  💰 New Total: ₹", updatedInvoice.grandTotal);

        // ============================================
        // 9. LOG SUCCESS
        // ============================================
        console.log("\n✅ INVOICE UPDATE COMPLETED SUCCESSFULLY");
        console.log(`📄 Invoice: ${invoiceNumber} | New Total: ₹${grandTotal.toFixed(2)}`);
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
                packageFinalTotal: packageFinalPriceTotal,
                packageDiscountTotal: packageDiscountTotal,
                dispenserSubtotal: dispenserSubtotal,
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

        // ✅ Helper: normalize packages array for any invoice (A1 backward compat)
        const getPackagesArray = (inv) => {
            if (inv.packageItems && inv.packageItems.length > 0) {
                return inv.packageItems.map(p => {
                    const obj = { ...p };
                    if (!obj.quantity) obj.quantity = 1;
                    return obj;
                });
            }
            if (inv.packageItem && inv.packageItem.packageId) {
                const single = { ...inv.packageItem };
                if (!single.quantity) single.quantity = 1;
                return [single];
            }
            return [];
        };

        // ============================================
        // SHEET 1: INVOICE SUMMARY
        // ============================================
        console.log("\n📊 Creating Sheet 1: Invoice Summary...");

        const summaryData = invoices.map(inv => {
            const pkgs = getPackagesArray(inv);
            const pkgNames = pkgs.map(p => p.packageName).join(', ');

            return {
                'Invoice #': inv.invoiceNumber || 'N/A',
                'Date': formatDate(inv.invoiceDate),
                'Customer Name': inv.customer?.customerName || 'N/A',
                'Phone': inv.customer?.contactNumber || 'N/A',
                'Payment': inv.paymentStatus || 'N/A',
                'Packages Count': pkgs.length,
                'Package Names': pkgs.length > 0 ? pkgNames : 'No',
                'Dispenser Items': inv.hasDispenser ? inv.dispenserItems?.length || 0 : 0,
                'Total Items': pkgs.length + (inv.dispenserItems?.length || 0),
                'Subtotal': `₹${(inv.subtotal || 0).toFixed(2)}`,
                'Total Discount': `₹${(inv.totalDiscountAmount || 0).toFixed(2)}`,
                'GST': `₹${(inv.gstAmount || 0).toFixed(2)}`,
                'Grand Total': `₹${(inv.grandTotal || 0).toFixed(2)}`,
                'Loyalty Earned': inv.loyaltyCoinsEarned || 0,
                'Loyalty Used': inv.loyaltyCoinsUsed || 0,
                'Status': inv.status || 'Active'
            };
        });

        // ============================================
        // SHEET 2: INVOICE DETAILS - WITH MULTIPLE PACKAGES
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

            // 1. Add Package Items (loop through all packages)
            const pkgs = getPackagesArray(inv);
            if (pkgs.length > 0) {
                addHeaderRow();

                for (let pkgIdx = 0; pkgIdx < pkgs.length; pkgIdx++) {
                    const pkg = pkgs[pkgIdx];
                    const qty = pkg.quantity || 1;
                    const xpOilItems = pkg.xpOilItems || [];

                    if (xpOilItems.length > 0) {
                        // One row per XP oil per package
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
                                'Item Type': `📦 Package ${pkgIdx + 1} - XP Oil`,
                                'Product Name': xp.productName || 'N/A',
                                'ML': xp.ml || 'N/A',
                                'Quantity': qty,
                                'Unit Price': `₹${(xp.pricePerKG || 0).toFixed(2)}/KG`,
                                'Discount %': `${pkg.discount || 0}%`,
                                'Discount Amount': `₹${((pkg.discountAmount || 0) * qty).toFixed(2)}`,
                                'Final Price': `₹${((pkg.finalPrice || pkg.pricing || 0) * qty).toFixed(2)}`,
                                'XP Oil Name': xp.productName || 'N/A',
                                'XP Oil ML': `${(xp.ml || 0) * qty}ml`,
                                'Fragrance Base Used': `${(pkg.alcoholQty || 0) * qty}ml`,
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
                            'Item Type': `📦 Package ${pkgIdx + 1}`,
                            'Product Name': pkg.packageName || 'N/A',
                            'ML': pkg.bottleML || 'N/A',
                            'Quantity': qty,
                            'Unit Price': `₹${(pkg.pricing || 0).toFixed(2)}`,
                            'Discount %': `${pkg.discount || 0}%`,
                            'Discount Amount': `₹${((pkg.discountAmount || 0) * qty).toFixed(2)}`,
                            'Final Price': `₹${((pkg.finalPrice || pkg.pricing || 0) * qty).toFixed(2)}`,
                            'XP Oil Name': pkg.xpOil?.productName || 'N/A',
                            'XP Oil ML': `${((pkg.xpOil?.quantity || 0) * 1000) * qty}ml`,
                            'Fragrance Base Used': `${(pkg.alcoholQty || 0) * qty}ml`,
                            'Promo Code': '',
                            'Loyalty Earned': '',
                            'Loyalty Used': ''
                        });
                    }
                }
            }

            // 2. Add Dispenser Items
            if (inv.hasDispenser && inv.dispenserItems.length > 0) {
                if (pkgs.length === 0) {
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
            if (pkgs.length === 0 && (!inv.hasDispenser || inv.dispenserItems.length === 0)) {
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
            { wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 12 },
            { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 12 },
            { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 12 }
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
            { wch: 25 },  // Item Type
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
// DELETE INVOICE - With Inventory Return & Audit
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
        console.log("  📦 Package Items:", invoice.packageItems?.length || 0);
        console.log("  💧 Dispensers:", invoice.dispenserItems?.length || 0);
        console.log("  🏷️ Promo:", invoice.hasPromo ? invoice.promoApplied?.code : "None");
        console.log("  🪙 Loyalty Earned:", invoice.loyaltyCoinsEarned || 0);
        console.log("  🪙 Loyalty Used:", invoice.loyaltyCoinsUsed || 0);

        const invoiceNumber = invoice.invoiceNumber;
        const invoiceData = invoice.toObject();

        // ============================================
        // ✅ Normalize OLD invoice to array (A1 backward compat)
        // ============================================
        let packageItemsToReturn = [];
        if (invoice.packageItems && invoice.packageItems.length > 0) {
            packageItemsToReturn = invoice.packageItems.map(p => p.toObject ? p.toObject() : p);
        } else if (invoice.packageItem && invoice.packageItem.packageId) {
            const single = invoice.packageItem.toObject ? invoice.packageItem.toObject() : invoice.packageItem;
            if (!single.quantity) single.quantity = 1;
            packageItemsToReturn = [single];
        }
        console.log("  📦 Packages to return (normalized):", packageItemsToReturn.length);

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

        // 2a. Return Packages (loop through each package × qty)
        if (packageItemsToReturn.length > 0) {
            console.log("\n  📦 Returning Package Stock...");

            for (let i = 0; i < packageItemsToReturn.length; i++) {
                const pkg = packageItemsToReturn[i];
                const qty = pkg.quantity || 1;

                console.log(`\n    📦 Package ${i + 1}/${packageItemsToReturn.length}: ${pkg.packageName} (qty ${qty})`);

                // ✅ Return XP Oils × qty
                const xpOilItems = pkg.xpOilItems || [];

                if (xpOilItems.length > 0) {
                    console.log(`      🧪 Returning ${xpOilItems.length} XP Oils × ${qty}...`);

                    const xpItemsForReturn = xpOilItems.map(item => ({
                        xpId: item.xpId,
                        ml: item.ml * qty
                    }));

                    const returnResult = await returnMultipleXPOils(
                        xpItemsForReturn,
                        req.user,
                        invoiceNumber
                    );

                    inventoryReturned.xpOilDetails.push(...returnResult.results);
                    inventoryReturned.xpOil += returnResult.totalML;

                    for (const result of returnResult.results) {
                        console.log(`      ✅ ${result.productName}: ${result.ml}ml returned`);
                    }
                } else {
                    // Fallback for old invoices with single XP Oil
                    if (pkg.xpOil && pkg.xpOil.xpId) {
                        const singleML = (pkg.fragranceQty || (pkg.xpOil.quantity * 1000)) * qty;
                        const xpResult = await returnXPOil(
                            pkg.xpOil.xpId,
                            singleML,
                            req.user,
                            'Invoice Deletion - Return',
                            `Returned for invoice ${invoiceNumber} (Invoice deleted)`
                        );
                        inventoryReturned.xpOil += singleML;
                        inventoryReturned.xpOilDetails.push(xpResult);
                        console.log(`      ✅ XP Oil returned: ${singleML}g (${xpResult.productName})`);
                    }
                }

                // ✅ Return Fragrance Base × qty
                const totalFragranceToReturn = (pkg.alcoholQty || 0) * qty;
                if (totalFragranceToReturn > 0) {
                    await returnAlcohol(
                        totalFragranceToReturn,
                        req.user,
                        'Invoice Deletion - Return',
                        `Returned for invoice ${invoiceNumber} (Package ${i + 1}: ${pkg.packageName}, Fragrance Base: ${totalFragranceToReturn}ml)`
                    );
                    inventoryReturned.alcohol += totalFragranceToReturn;
                    console.log(`      ✅ Fragrance Base returned: ${totalFragranceToReturn}ml`);
                }

                // ✅ Return Bottles × qty
                await returnBottlesInventory(
                    pkg.bottleML.toString(),
                    qty,
                    req.user,
                    'Invoice Deletion - Return',
                    `Returned for invoice ${invoiceNumber} (Package ${i + 1}: ${pkg.packageName}, ${pkg.bottleML}ml × ${qty})`
                );
                inventoryReturned.bottles += qty;
                console.log(`      ✅ Bottles returned: ${pkg.bottleML}ml × ${qty}`);
            }
        } else {
            console.log("  ℹ️ No package stock to return");
        }

        // 2b. Return Dispenser Stock
        if (invoice.hasDispenser && invoice.dispenserItems.length > 0) {
            console.log("\n  💧 Returning Dispenser Stock...");
            for (const item of invoice.dispenserItems) {
                console.log(`    Item: ${item.productName}`);
                console.log(`      ML: ${item.ml}ml | Qty: ${item.quantity} | Total ML: ${item.totalML}ml`);

                const xpResult = await returnXPOil(
                    item.xpId,
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
        console.log("✅ Deleted Invoice saved for audit");
        console.log(`  📄 Invoice Number: ${deletedInvoice.invoiceNumber}`);
        console.log(`  👤 Deleted By: ${req.user.name}`);

        // ============================================
        // 5. DELETE FROM MAIN COLLECTION
        // ============================================
        console.log("\n🔍 Step 5: Deleting from Main Collection...");
        await Invoice.findOneAndDelete({ invoiceId: invoiceId });
        console.log(`✅ Invoice ${invoiceNumber} removed from main collection`);

        // ============================================
        // 6. UPDATE WORKSHOP
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