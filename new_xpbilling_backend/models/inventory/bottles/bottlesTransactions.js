const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// ✅ Transaction sub-schema for array (SAME as XP/Dispenser)
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
    // ✅ NEW: Purchase price per item
    purchasePrice: {
        type: Number,
        default: 0,
        min: [0, 'Purchase price cannot be negative']
    },
    previousStock: {
        type: Number,
        default: 0
    },
    newStock: {
        type: Number,
        default: 0
    },
    // ✅ NEW: For tracking average price calculations
    previousAvgPrice: {
        type: Number,
        default: 0
    },
    newAvgPrice: {
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
    reason: {
        type: String,
        enum: ['Purchase', 'Sale', 'Adjustment', 'Damage', 'Return', 'Other', 'Invoice', 'Invoice Return', 'Invoice Deletion - Return', 'Invoice Edit - Return', 'Invoice Edit - New Reduction'],
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

// ✅ Main transaction document - ONE per (mlSize + itemType)
const bottlesTransactionsSchema = new mongoose.Schema({
    mlSize: {
        type: String,
        required: [true, 'ML size is required'],
        trim: true,
    },
    itemType: {
        type: String,
        required: [true, 'Item type is required'],
        trim: true,
    },
    bottleItemId: {
        type: String,
        required: [true, 'Bottle item ID is required'],
    },
    transactions: [transactionItemSchema]
}, {
    timestamps: true
});

// ✅ Compound unique index - ONE document per (mlSize + itemType)
bottlesTransactionsSchema.index({ mlSize: 1, itemType: 1 }, { unique: true });

// ✅ Index for faster queries by bottleItemId
bottlesTransactionsSchema.index({ bottleItemId: 1 });

// ✅ Static method to get transactions by mlSize + itemType
bottlesTransactionsSchema.statics.getByItem = async function (mlSize, itemType, limit = 100, page = 1) {
    const doc = await this.findOne({ mlSize, itemType }).lean();
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

// ✅ Static method to get transactions by bottleItemId
bottlesTransactionsSchema.statics.getByBottleItemId = async function (bottleItemId, limit = 100, page = 1) {
    const doc = await this.findOne({ bottleItemId }).lean();
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
bottlesTransactionsSchema.statics.addTransaction = async function (mlSize, itemType, bottleItemId, transactionData) {
    // Generate transactionId if not provided
    if (!transactionData.transactionId) {
        transactionData.transactionId = `txn-${uuidv4().substring(0, 8)}`;
    }
    return await this.findOneAndUpdate(
        { mlSize, itemType },
        {
            $set: { bottleItemId: bottleItemId },
            $push: { transactions: transactionData }
        },
        { new: true, upsert: true }
    );
};

// ✅ Static method to get summary by mlSize
bottlesTransactionsSchema.statics.getSummaryByML = async function (mlSize) {
    const doc = await this.find({ mlSize }).lean();
    if (!doc || doc.length === 0) {
        return [];
    }

    const result = doc.map(item => {
        const summary = item.transactions.reduce((acc, t) => {
            if (t.transactionType === 'IN') {
                acc.totalIN += t.quantity;
                acc.totalCost += (t.quantity * (t.purchasePrice || 0));
            } else if (t.transactionType === 'OUT') {
                acc.totalOUT += t.quantity;
            }
            acc.totalTransactions += 1;
            return acc;
        }, { totalIN: 0, totalOUT: 0, totalTransactions: 0, totalCost: 0 });

        return {
            _id: item.itemType,
            totalIN: summary.totalIN,
            totalOUT: summary.totalOUT,
            totalTransactions: summary.totalTransactions,
            totalCost: summary.totalCost,
            avgPrice: summary.totalIN > 0 ? summary.totalCost / summary.totalIN : 0
        };
    });

    return result;
};

const BottlesTransactions = mongoose.models.BottlesTransactions || mongoose.model('BottlesTransactions', bottlesTransactionsSchema);

module.exports = BottlesTransactions;