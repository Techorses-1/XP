const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// ============================================
// ✅ XP OIL ITEM SUB-SCHEMA (For Multiple XP Oils)
// ============================================
const xpOilItemSchema = new mongoose.Schema({
    xpId: {
        type: String,
        required: true,
        ref: 'XPInventory'
    },
    productName: {
        type: String,
        required: true
    },
    ml: {
        type: Number,
        required: true,
        min: 0.1
    },
    quantityInKG: {
        type: Number,
        required: true,
        min: 0
    },
    density: {
        type: Number,
        default: 1000
    },
    pricePerKG: {
        type: Number,
        default: 0
    }
}, {
    _id: true
});

// ============================================
// INVOICE ITEM SUB-SCHEMA (Package Item)
// ============================================
const packageItemSchema = new mongoose.Schema({
    // ✅ NEW: Backend-generated unique line ID for this package entry (used for update diffing)
    lineId: {
        type: String,
        default: () => uuidv4()
    },
    packageId: {
        type: String,
        required: true,
        ref: 'Package'
    },
    packageName: {
        type: String,
        required: true
    },
    pricing: {
        type: Number,
        required: true,
        min: 0
    },
    oilCount: {
        type: Number,
        required: true,
        min: 0
    },
    // ✅ NEW: Quantity of this package
    quantity: {
        type: Number,
        default: 1,
        min: 1
    },
    discount: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    discountAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    finalPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    bottleML: {
        type: Number,
        required: true,
        enum: [30, 60, 125]
    },
    fillingLevel: {
        type: Number,
        required: true,
        min: 0
    },
    fragranceQty: {
        type: Number,
        required: true,
        min: 0
    },
    alcoholQty: {
        type: Number,
        required: true,
        min: 0
    },
    xpOilItems: [xpOilItemSchema],
    xpOil: {
        xpId: {
            type: String,
            ref: 'XPInventory'
        },
        productName: {
            type: String
        },
        quantity: {
            type: Number,
            default: 0
        },
        density: {
            type: Number,
            default: 1000
        }
    }
}, {
    _id: true
});

// ============================================
// ✅ UPDATED INVOICE ITEM SUB-SCHEMA (Dispenser Item)
// ✅ CHANGED: dispenserId → xpId (Now uses XPInventory)
// ============================================
const dispenserItemSchema = new mongoose.Schema({
    // ✅ CHANGED: dispenserId → xpId (references XPInventory)
    xpId: {
        type: String,
        required: true,
        ref: 'XPInventory'
    },
    // ✅ KEPT for backward compatibility (old invoices)
    dispenserId: {
        type: String,
        default: null
    },
    productName: {
        type: String,
        required: true
    },
    ml: {
        type: Number,
        required: true,
        enum: [3, 6]
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    // ✅ Store user-entered unit price
    unitPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    sellingPrice3ml: {
        type: Number,
        default: 0,
        min: 0
    },
    sellingPrice6ml: {
        type: Number,
        default: 0,
        min: 0
    },
    discount: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    discountAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    originalPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    finalPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    totalML: {
        type: Number,
        required: true,
        min: 0
    }
}, {
    _id: true
});

// ============================================
// PROMO CODE SUB-SCHEMA
// ============================================
const promoAppliedSchema = new mongoose.Schema({
    promoId: {
        type: String,
        ref: 'PromoCode'
    },
    code: {
        type: String,
        uppercase: true
    },
    discount: {
        type: Number,
        min: 0,
        max: 100
    },
    discountAmount: {
        type: Number,
        default: 0,
        min: 0
    }
}, {
    _id: true
});

// ============================================
// CUSTOMER SUB-SCHEMA (Snapshot)
// ============================================
const customerSnapshotSchema = new mongoose.Schema({
    customerId: {
        type: String,
        required: true,
        ref: 'Customer'
    },
    customerName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        default: ''
    },
    contactNumber: {
        type: String,
        required: true
    },
    loyaltyCoins: {
        type: Number,
        default: 0,
        min: 0
    }
}, {
    _id: true
});

// ============================================
// WORKSHOP SUB-SCHEMA (Snapshot)
// ============================================
const workshopSnapshotSchema = new mongoose.Schema({
    workshopId: {
        type: String,
        ref: 'Workshop'
    },
    date: {
        type: Date
    },
    startTime: {
        type: String
    },
    endTime: {
        type: String
    }
}, {
    _id: true
});

// ============================================
// MAIN INVOICE SCHEMA
// ============================================
const invoiceSchema = new mongoose.Schema({
    invoiceId: {
        type: String,
        required: true,
        unique: true
    },
    invoiceNumber: {
        type: String,
        required: true,
        unique: true
    },

    customer: {
        type: customerSnapshotSchema,
        required: [true, 'Customer is required']
    },

    workshop: {
        type: workshopSnapshotSchema,
        default: null
    },
    hasWorkshop: {
        type: Boolean,
        default: false
    },

    // ✅ KEPT for backward compatibility (old invoices)
    packageItem: {
        type: packageItemSchema,
        default: null
    },
    // ✅ NEW: Array of packages (for new invoices)
    packageItems: {
        type: [packageItemSchema],
        default: []
    },
    hasPackage: {
        type: Boolean,
        default: false
    },

    dispenserItems: [dispenserItemSchema],
    hasDispenser: {
        type: Boolean,
        default: false
    },

    promoApplied: {
        type: promoAppliedSchema,
        default: null
    },
    hasPromo: {
        type: Boolean,
        default: false
    },

    // ========== LOYALTY COINS ==========
    loyaltyCoinsEarned: {
        type: Number,
        default: 0,
        min: 0
    },
    loyaltyCoinsUsed: {
        type: Number,
        default: 0,
        min: 0
    },
    loyaltyDiscountAmount: {
        type: Number,
        default: 0,
        min: 0
    },

    // ========== FINANCIALS ==========
    subtotal: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    subtotalWithoutGST: {
        type: Number,
        default: 0,
        min: 0
    },
    gstRate: {
        type: Number,
        default: 18,
        min: 0,
        max: 100
    },
    gstAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    packageDiscountAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    dispenserDiscountAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    promoDiscount: {
        type: Number,
        default: 0,
        min: 0
    },
    totalDiscountAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    grandTotal: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },

    paymentStatus: {
        type: String,
        required: true,
        enum: ['Cash', 'UPI', 'Card'],
        default: 'Cash'
    },
    paymentDate: {
        type: Date,
        default: Date.now
    },

    invoiceDate: {
        type: Date,
        required: true,
        default: Date.now
    },

    notes: {
        type: String,
        default: '',
        trim: true
    },

    createdBy: {
        userId: { type: String, required: true },
        userName: { type: String, required: true },
        userEmail: { type: String, required: true }
    },

    status: {
        type: String,
        enum: ['Active', 'Cancelled'],
        default: 'Active'
    }
}, {
    timestamps: true
});

// ============================================
// INDEXES
// ============================================
invoiceSchema.index({ invoiceId: 1 });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ 'customer.customerId': 1 });
invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ createdAt: -1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ paymentStatus: 1 });

// ============================================
// STATIC METHODS
// ============================================

invoiceSchema.statics.getByCustomer = async function (customerId, limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const [invoices, total] = await Promise.all([
        this.find({ 'customer.customerId': customerId, status: 'Active' })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        this.countDocuments({ 'customer.customerId': customerId, status: 'Active' })
    ]);
    return { invoices, total, page, limit, totalPages: Math.ceil(total / limit) };
};

invoiceSchema.statics.getByDateRange = async function (startDate, endDate, limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const query = {
        invoiceDate: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        },
        status: 'Active'
    };
    const [invoices, total] = await Promise.all([
        this.find(query)
            .sort({ invoiceDate: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        this.countDocuments(query)
    ]);
    return { invoices, total, page, limit, totalPages: Math.ceil(total / limit) };
};

invoiceSchema.statics.getSummary = async function (startDate, endDate) {
    const match = {
        invoiceDate: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        },
        status: 'Active'
    };

    const result = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalInvoices: { $sum: 1 },
                totalRevenue: { $sum: '$grandTotal' },
                totalGST: { $sum: '$gstAmount' },
                totalDiscount: { $sum: '$totalDiscountAmount' },
                totalLoyaltyEarned: { $sum: '$loyaltyCoinsEarned' },
                totalLoyaltyUsed: { $sum: '$loyaltyCoinsUsed' },
                avgInvoiceValue: { $avg: '$grandTotal' }
            }
        }
    ]);

    return result[0] || {
        totalInvoices: 0,
        totalRevenue: 0,
        totalGST: 0,
        totalDiscount: 0,
        totalLoyaltyEarned: 0,
        totalLoyaltyUsed: 0,
        avgInvoiceValue: 0
    };
};

invoiceSchema.statics.getByPaymentType = async function (paymentType, startDate, endDate) {
    const match = {
        paymentStatus: paymentType,
        status: 'Active'
    };
    if (startDate && endDate) {
        match.invoiceDate = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        };
    }

    const result = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                totalAmount: { $sum: '$grandTotal' }
            }
        }
    ]);

    return result[0] || { total: 0, totalAmount: 0 };
};

// ============================================
// ✅ UPDATED PRE-SAVE MIDDLEWARE
// ✅ HANDLES BOTH: packageItems[] (new) AND packageItem (old)
// ============================================
invoiceSchema.pre('save', function () {
    // ============================================
    // Determine which packages array to use
    // Priority: packageItems[] (new) > packageItem (old)
    // ============================================
    const hasNewPackages = this.packageItems && this.packageItems.length > 0;
    const hasOldPackage = this.packageItem && this.packageItem.packageId;

    // ============================================
    // Calculate Package Discount Amounts
    // ============================================
    let totalPackageDiscount = 0;
    let totalPackageFinal = 0;

    if (hasNewPackages) {
        // NEW: Loop through packageItems array
        for (const pkg of this.packageItems) {
            const qty = pkg.quantity || 1;
            pkg.discountAmount = (pkg.pricing * pkg.discount) / 100;
            pkg.finalPrice = pkg.pricing - pkg.discountAmount;

            totalPackageDiscount += pkg.discountAmount * qty;
            totalPackageFinal += pkg.finalPrice * qty;
        }
        this.packageDiscountAmount = totalPackageDiscount;

        // ✅ B2: Set packageItem = first package for backward compat
        this.packageItem = this.packageItems[0];
        this.hasPackage = true;
    } else if (hasOldPackage) {
        // OLD: Single package (backward compat)
        const pkg = this.packageItem;
        const qty = pkg.quantity || 1;
        pkg.discountAmount = (pkg.pricing * pkg.discount) / 100;
        pkg.finalPrice = pkg.pricing - pkg.discountAmount;

        totalPackageDiscount = pkg.discountAmount * qty;
        totalPackageFinal = pkg.finalPrice * qty;
        this.packageDiscountAmount = totalPackageDiscount;

        // ✅ Ensure packageItems is set so all readers can use array
        this.packageItems = [this.packageItem];
        this.hasPackage = true;
    } else {
        this.packageDiscountAmount = 0;
        this.hasPackage = false;
    }

    // ============================================
    // Calculate Dispenser (unchanged)
    // ============================================
    let totalDispenserDiscount = 0;
    let dispenserTotal = 0;

    if (this.hasDispenser && this.dispenserItems.length > 0) {
        for (const item of this.dispenserItems) {
            let unitPrice = item.unitPrice;

            if (!unitPrice || unitPrice === 0) {
                unitPrice = item.ml === 3 ? item.sellingPrice3ml : item.sellingPrice6ml;
            }

            const originalTotal = unitPrice * item.quantity;
            const discountAmt = (originalTotal * (item.discount || 0)) / 100;
            const finalTotal = originalTotal - discountAmt;

            item.originalPrice = originalTotal;
            item.discountAmount = discountAmt;
            item.finalPrice = finalTotal;

            totalDispenserDiscount += discountAmt;
            dispenserTotal += finalTotal;
        }
        this.dispenserDiscountAmount = totalDispenserDiscount;
    }

    // ============================================
    // Calculate Subtotal
    // ============================================
    let subtotal = 0;
    subtotal += totalPackageFinal;
    if (this.hasDispenser && this.dispenserItems.length > 0) {
        subtotal += dispenserTotal;
    }
    this.subtotal = subtotal;

    // Calculate Subtotal WITHOUT GST
    this.subtotalWithoutGST = this.subtotal / (1 + this.gstRate / 100);

    // ============================================
    // Apply Promo Discount
    // ============================================
    let promoDiscountAmount = 0;
    let afterPromo = this.subtotalWithoutGST;

    if (this.hasPromo && this.promoApplied) {
        promoDiscountAmount = (this.subtotalWithoutGST * this.promoApplied.discount) / 100;
        this.promoApplied.discountAmount = promoDiscountAmount;
        this.promoDiscount = promoDiscountAmount;
        afterPromo = this.subtotalWithoutGST - promoDiscountAmount;
    }

    // ============================================
    // Apply Loyalty Coins Discount
    // ============================================
    let loyaltyDiscountAmount = 0;
    if (this.loyaltyCoinsUsed > 0) {
        loyaltyDiscountAmount = Math.min(this.loyaltyCoinsUsed, afterPromo);
        this.loyaltyDiscountAmount = loyaltyDiscountAmount;
        afterPromo = afterPromo - loyaltyDiscountAmount;
    }

    // ============================================
    // Calculate Total Discount
    // ============================================
    this.totalDiscountAmount = (this.packageDiscountAmount || 0) +
        (this.dispenserDiscountAmount || 0) +
        (this.promoDiscount || 0) +
        (this.loyaltyDiscountAmount || 0);

    // Calculate GST
    this.gstAmount = afterPromo * (this.gstRate / 100);

    // Calculate Grand Total
    this.grandTotal = afterPromo + this.gstAmount;

    // Calculate Loyalty Coins EARNED
    if (afterPromo > 0) {
        this.loyaltyCoinsEarned = Math.floor(afterPromo / 100);
    }
});

const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice;