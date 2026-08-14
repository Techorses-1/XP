const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// ✅ Transaction sub-schema for array
const transactionItemSchema = new mongoose.Schema({
    transactionId: {
        type: String,
        default: () => `txn-${uuidv4().substring(0, 8)}`,
    },
    transactionType: {
        type: String,
        required: true,
        enum: ['IN', 'OUT'],
    },
    quantity: {
        type: Number,
        required: true,
        min: [1, 'Quantity must be at least 1']
    },
    purchasePrice: {
        type: Number,
        default: 0,
        min: [0, 'Purchase price cannot be negative']
    },
    // ========== NEW DENSITY SNAPSHOT ==========
    density: {
        type: Number,
        default: 1000
    },
    // ==========================================
    previousStock: {
        type: Number,
        default: 0
    },
    newStock: {
        type: Number,
        default: 0
    },
    previousTotalQuantityAdded: {
        type: Number,
        default: 0
    },
    newTotalQuantityAdded: {
        type: Number,
        default: 0
    },
    previousTotalCost: {
        type: Number,
        default: 0
    },
    newTotalCost: {
        type: Number,
        default: 0
    },
    previousAvgPrice: {
        type: Number,
        default: 0
    },
    newAvgPrice: {
        type: Number,
        default: 0
    },
    reason: {
        type: String,
        enum: ['Purchase', 'Sale', 'Adjustment', 'Damage', 'Return', 'Other'],
        default: 'Purchase'
    },
    notes: {
        type: String,
        default: '',
        trim: true
    },
    performedBy: {
        userId: { type: String },
        userName: { type: String },
        userEmail: { type: String }
    },
    bulkUploadId: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    _id: true
});

// ✅ Main transaction document - ONE per product
const xpTransactionsSchema = new mongoose.Schema({
    xpId: {
        type: String,
        required: [true, 'XP ID is required'],
        unique: true,
    },
    productName: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
    },
    transactions: [transactionItemSchema]
}, {
    timestamps: true
});

// ✅ Indexes
xpTransactionsSchema.index({ xpId: 1 });
xpTransactionsSchema.index({ productName: 1 });

// ✅ Static method to get transactions by xpId
xpTransactionsSchema.statics.getByXPId = async function (xpId, limit = 100, page = 1) {
    const doc = await this.findOne({ xpId }).lean();
    if (!doc) return { transactions: [], total: 0, page, limit, totalPages: 0 };

    const transactions = doc.transactions || [];
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

// ✅ Static method to add transaction
xpTransactionsSchema.statics.addTransaction = async function (xpId, transactionData) {
    return await this.findOneAndUpdate(
        { xpId },
        { $push: { transactions: transactionData } },
        { new: true, upsert: true }
    );
};

// ✅ Static method to get summary by product
xpTransactionsSchema.statics.getSummaryByProduct = async function (xpId) {
    const doc = await this.findOne({ xpId }).lean();
    if (!doc || !doc.transactions || doc.transactions.length === 0) {
        return { totalIN: 0, totalOUT: 0, totalTransactions: 0 };
    }

    const summary = doc.transactions.reduce((acc, t) => {
        if (t.transactionType === 'IN') {
            acc.totalIN += t.quantity;
        } else if (t.transactionType === 'OUT') {
            acc.totalOUT += t.quantity;
        }
        acc.totalTransactions += 1;
        return acc;
    }, { totalIN: 0, totalOUT: 0, totalTransactions: 0 });

    return summary;
};

const XPTransactions = mongoose.models.XPTransactions || mongoose.model('XPTransactions', xpTransactionsSchema);

module.exports = XPTransactions;