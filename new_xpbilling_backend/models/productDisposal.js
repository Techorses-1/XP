const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// ✅ Disposal entry sub-schema (stored as array)
const disposalEntrySchema = new mongoose.Schema({
    disposalEntryId: {
        type: String,
        default: () => `dpe-${uuidv4().substring(0, 8)}`,
    },
    disposedQuantity: {
        type: Number,
        required: [true, 'Disposed quantity is required'],
        min: [0.001, 'Disposed quantity must be greater than 0']
    },
    reason: {
        type: String,
        required: [true, 'Reason is required'],
        enum: ['Damage', 'Expired', 'Broken', 'Return', 'Other']
    },
    performedBy: {
        userId: { type: String, required: true },
        userName: { type: String, required: true },
        userEmail: { type: String, required: true }
    },
    disposedAt: {
        type: Date,
        default: Date.now
    },
    notes: {
        type: String,
        default: '',
        trim: true
    }
}, {
    _id: true
});

// ✅ Main disposal document - ONE per product
const productDisposalSchema = new mongoose.Schema({
    disposalId: {
        type: String,
        unique: true,
        default: () => `dsp-${uuidv4().substring(0, 8)}`,
    },
    inventoryType: {
        type: String,
        required: [true, 'Inventory type is required'],
        enum: ['xp', 'dispenser', 'bottles'],
        index: true
    },
    inventoryItemId: {
        type: String,
        required: [true, 'Inventory item ID is required'],
        index: true
    },
    productName: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    // For XP/Dispenser - XP no longer has ML, so can be null
    ml: {
        type: Number,
        default: null
    },
    // For Bottles
    mlSize: {
        type: String,
        default: null,
        trim: true
    },
    itemType: {
        type: String,
        default: null,
        trim: true
    },
    disposals: [disposalEntrySchema],
    totalDisposed: {
        type: Number,
        default: 0,
        min: [0, 'Total disposed cannot be negative']
    }
}, {
    timestamps: true
});

// ✅ Indexes for faster queries (NO DUPLICATES)
productDisposalSchema.index({ inventoryType: 1, inventoryItemId: 1 });
productDisposalSchema.index({ inventoryItemId: 1 });
productDisposalSchema.index({ inventoryType: 1 });

// ✅ Static method to get by inventory item
productDisposalSchema.statics.getByInventoryItem = async function (inventoryItemId) {
    return await this.findOne({ inventoryItemId }).lean();
};

// ✅ Static method to get by inventory type
productDisposalSchema.statics.getByInventoryType = async function (inventoryType, limit = 100, page = 1) {
    const skip = (page - 1) * limit;
    const [disposals, total] = await Promise.all([
        this.find({ inventoryType })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        this.countDocuments({ inventoryType })
    ]);
    return { disposals, total, page, limit, totalPages: Math.ceil(total / limit) };
};

// ✅ Static method to add disposal entry
productDisposalSchema.statics.addDisposal = async function (inventoryItemId, disposalData) {
    const doc = await this.findOne({ inventoryItemId });

    if (!doc) {
        // Create new document with first disposal
        return await this.create({
            inventoryType: disposalData.inventoryType,
            inventoryItemId: inventoryItemId,
            productName: disposalData.productName,
            ml: disposalData.ml || null,
            mlSize: disposalData.mlSize || null,
            itemType: disposalData.itemType || null,
            disposals: [{
                disposedQuantity: disposalData.disposedQuantity,
                reason: disposalData.reason,
                performedBy: disposalData.performedBy,
                notes: disposalData.notes || ''
            }],
            totalDisposed: disposalData.disposedQuantity
        });
    }

    // Push new disposal and update total
    doc.disposals.push({
        disposedQuantity: disposalData.disposedQuantity,
        reason: disposalData.reason,
        performedBy: disposalData.performedBy,
        notes: disposalData.notes || ''
    });
    doc.totalDisposed = (doc.totalDisposed || 0) + disposalData.disposedQuantity;

    await doc.save();
    return doc;
};

// ✅ Static method to get summary by inventory type
productDisposalSchema.statics.getSummaryByType = async function (inventoryType) {
    const result = await this.aggregate([
        { $match: { inventoryType } },
        {
            $group: {
                _id: null,
                totalItems: { $sum: 1 },
                totalDisposed: { $sum: '$totalDisposed' },
                totalDisposals: { $sum: { $size: '$disposals' } }
            }
        }
    ]);
    return result[0] || { totalItems: 0, totalDisposed: 0, totalDisposals: 0 };
};

const ProductDisposal = mongoose.models.ProductDisposal || mongoose.model('ProductDisposal', productDisposalSchema);

module.exports = ProductDisposal;