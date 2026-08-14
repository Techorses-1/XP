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
    sellingPrice3ml: {
        type: Number,
        default: 0,
        min: [0, 'Selling price cannot be negative']
    },
    sellingPrice6ml: {
        type: Number,
        default: 0,
        min: [0, 'Selling price cannot be negative']
    },
    discount: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative'],
        max: [100, 'Discount cannot exceed 100%']
    },
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
    previousTotalPurchaseCost: {
        type: Number,
        default: 0
    },
    newTotalPurchaseCost: {
        type: Number,
        default: 0
    },
    previousAvgPurchasePrice: {
        type: Number,
        default: 0
    },
    newAvgPurchasePrice: {
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
const dispenserTransactionsSchema = new mongoose.Schema({
    dispenserId: {
        type: String,
        required: [true, 'Dispenser ID is required'],
        unique: true,
    },
    productName: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
    },
    sellingPrice3ml: {
        type: Number,
        default: 0,
        min: [0, 'Selling price cannot be negative']
    },
    sellingPrice6ml: {
        type: Number,
        default: 0,
        min: [0, 'Selling price cannot be negative']
    },
    discount: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative'],
        max: [100, 'Discount cannot exceed 100%']
    },
    transactions: [transactionItemSchema]
}, {
    timestamps: true
});

// ✅ Indexes
dispenserTransactionsSchema.index({ dispenserId: 1 });
dispenserTransactionsSchema.index({ productName: 1 });

// ✅ Static method to get transactions by dispenserId
dispenserTransactionsSchema.statics.getByDispenserId = async function (dispenserId, limit = 100, page = 1) {
    const doc = await this.findOne({ dispenserId }).lean();
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
dispenserTransactionsSchema.statics.addTransaction = async function (dispenserId, transactionData) {
    if (!transactionData.transactionId) {
        transactionData.transactionId = `txn-${uuidv4().substring(0, 8)}`;
    }
    return await this.findOneAndUpdate(
        { dispenserId },
        { $push: { transactions: transactionData } },
        { new: true, upsert: true }
    );
};

// ✅ Static method to update product details in transaction document
dispenserTransactionsSchema.statics.updateProductDetails = async function (dispenserId, sellingPrice3ml, sellingPrice6ml, discount) {
    const updateData = {};
    if (sellingPrice3ml !== undefined) updateData.sellingPrice3ml = sellingPrice3ml;
    if (sellingPrice6ml !== undefined) updateData.sellingPrice6ml = sellingPrice6ml;
    if (discount !== undefined) updateData.discount = discount;
    return await this.findOneAndUpdate(
        { dispenserId },
        { $set: updateData },
        { new: true }
    );
};

// ✅ Static method to get summary by product
dispenserTransactionsSchema.statics.getSummaryByProduct = async function (dispenserId) {
    const doc = await this.findOne({ dispenserId }).lean();
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

const DispenserTransactions = mongoose.models.DispenserTransactions || mongoose.model('DispenserTransactions', dispenserTransactionsSchema);

module.exports = DispenserTransactions;