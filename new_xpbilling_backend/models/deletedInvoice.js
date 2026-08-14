const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const deletedInvoiceSchema = new mongoose.Schema({
    // ========== ORIGINAL INVOICE DATA ==========
    originalInvoiceId: {
        type: String,
        required: true,
        unique: true
    },
    invoiceNumber: {
        type: String,
        required: true
    },

    // Full invoice data as object (preserve everything)
    invoiceData: {
        type: Object,
        required: true
    },

    // ========== DELETION INFO ==========
    deletedBy: {
        userId: { type: String, required: true },
        userName: { type: String, required: true },
        userEmail: { type: String, required: true }
    },
    deletedAt: {
        type: Date,
        default: Date.now
    },
    deletionReason: {
        type: String,
        default: 'Invoice deleted by user'
    },

    // ========== INVENTORY RETURN SUMMARY ==========
    inventoryReturned: {
        xpOil: {
            type: Number,
            default: 0,
            min: 0
        },
        alcohol: {
            type: Number,
            default: 0,
            min: 0
        },
        dispenser: {
            type: Number,
            default: 0,
            min: 0
        },
        bottles: {
            type: Number,
            default: 0,
            min: 0
        }
    },

    // ========== ✅ LOYALTY COINS SUMMARY ==========
    loyaltyCoins: {
        earned: {
            type: Number,
            default: 0,
            min: 0
        },
        used: {
            type: Number,
            default: 0,
            min: 0
        },
        discountAmount: {
            type: Number,
            default: 0,
            min: 0
        }
    },

    // ========== CUSTOMER INFO (Quick lookup) ==========
    customerInfo: {
        customerId: { type: String },
        customerName: { type: String },
        contactNumber: { type: String }
    },

    // ========== FINANCIAL SUMMARY (Quick lookup) ==========
    financialSummary: {
        subtotal: { type: Number, default: 0 },
        grandTotal: { type: Number, default: 0 },
        totalDiscount: { type: Number, default: 0 },
        gstAmount: { type: Number, default: 0 }
    },

    // ========== RESTORE INFO ==========
    restoredAt: {
        type: Date,
        default: null
    },
    restoredBy: {
        userId: { type: String, default: null },
        userName: { type: String, default: null },
        userEmail: { type: String, default: null }
    },
    isRestored: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// ============================================
// INDEXES
// ============================================
deletedInvoiceSchema.index({ originalInvoiceId: 1 });
deletedInvoiceSchema.index({ invoiceNumber: 1 });
deletedInvoiceSchema.index({ 'customerInfo.customerId': 1 });
deletedInvoiceSchema.index({ deletedAt: -1 });
deletedInvoiceSchema.index({ isRestored: 1 });

// ============================================
// STATIC METHODS
// ============================================

// ✅ Get deleted invoices by customer
deletedInvoiceSchema.statics.getByCustomer = async function (customerId, limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const [invoices, total] = await Promise.all([
        this.find({ 'customerInfo.customerId': customerId })
            .sort({ deletedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        this.countDocuments({ 'customerInfo.customerId': customerId })
    ]);
    return { invoices, total, page, limit, totalPages: Math.ceil(total / limit) };
};

// ✅ Get deleted invoices by date range
deletedInvoiceSchema.statics.getByDateRange = async function (startDate, endDate, limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const query = {
        deletedAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        }
    };
    const [invoices, total] = await Promise.all([
        this.find(query)
            .sort({ deletedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        this.countDocuments(query)
    ]);
    return { invoices, total, page, limit, totalPages: Math.ceil(total / limit) };
};

// ✅ Get summary of deleted invoices - UPDATED WITH LOYALTY COINS
deletedInvoiceSchema.statics.getSummary = async function (startDate, endDate) {
    const match = {
        deletedAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        }
    };

    const result = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalDeleted: { $sum: 1 },
                totalRevenueLost: { $sum: '$financialSummary.grandTotal' },
                totalDiscountLost: { $sum: '$financialSummary.totalDiscount' },
                totalGSTLost: { $sum: '$financialSummary.gstAmount' },
                totalLoyaltyEarnedLost: { $sum: '$loyaltyCoins.earned' },
                totalLoyaltyUsedLost: { $sum: '$loyaltyCoins.used' },
                totalLoyaltyDiscountLost: { $sum: '$loyaltyCoins.discountAmount' },
                avgInvoiceValue: { $avg: '$financialSummary.grandTotal' }
            }
        }
    ]);

    return result[0] || {
        totalDeleted: 0,
        totalRevenueLost: 0,
        totalDiscountLost: 0,
        totalGSTLost: 0,
        totalLoyaltyEarnedLost: 0,
        totalLoyaltyUsedLost: 0,
        totalLoyaltyDiscountLost: 0,
        avgInvoiceValue: 0
    };
};

// ✅ Restore deleted invoice (move back to main collection)
deletedInvoiceSchema.statics.restore = async function (deletedInvoiceId, user) {
    const deletedDoc = await this.findOne({ originalInvoiceId: deletedInvoiceId, isRestored: false });
    if (!deletedDoc) {
        throw new Error('Deleted invoice not found or already restored');
    }

    // Mark as restored
    deletedDoc.isRestored = true;
    deletedDoc.restoredAt = new Date();
    deletedDoc.restoredBy = {
        userId: user.userId,
        userName: user.name,
        userEmail: user.email
    };
    await deletedDoc.save();

    return deletedDoc;
};

const DeletedInvoice = mongoose.models.DeletedInvoice || mongoose.model('DeletedInvoice', deletedInvoiceSchema);

module.exports = DeletedInvoice;