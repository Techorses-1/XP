const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const packageSchema = new mongoose.Schema({
    packageId: {
        type: String,
        unique: true,
        default: () => uuidv4(),
    },
    packageName: {
        type: String,
        required: [true, 'Package name is required'],
        trim: true,
        unique: true,
    },
    pricing: {
        type: Number,
        required: [true, 'Pricing is required'],
        min: [1, 'Pricing must be at least 1'],
    },
    oilCount: {
        type: Number,
        required: [true, 'Oil count is required'],
        min: [1, 'Oil count must be at least 1'],
        max: [25, 'Oil count cannot exceed 25'],
        default: 1 , 
    },
    discount: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative'],
        max: [100, 'Discount cannot exceed 100%'],
    },
    bottleML: {
        type: Number,
        required: [true, 'Bottle ML is required'],
        enum: [30, 60, 125],
    },
    fillingLevel: {
        type: Number,
        required: [true, 'Filling level is required'],
        min: [1, 'Filling level must be at least 1'],
    },
    fragranceQty: {
        type: Number,
        required: [true, 'Fragrance quantity is required'],
        min: [0, 'Fragrance quantity cannot be negative'],
        default: 0,
    },
    alcoholQty: {
        type: Number,
        required: [true, 'Alcohol quantity is required'],
        min: [0, 'Alcohol quantity cannot be negative'],
        default: 0,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

// ============================================
// ✅ PRE-SAVE MIDDLEWARE - NO next()
// ============================================
packageSchema.pre('save', function () {
    // Validate filling level against bottle ML
    if (this.fillingLevel > this.bottleML) {
        throw new Error(`Filling level (${this.fillingLevel}) cannot exceed bottle ML (${this.bottleML})`);
    }

    // Auto-calculate fragrance and alcohol if not manually set
    if (this.fillingLevel > 0) {
        if (!this.fragranceQty || this.fragranceQty === 0) {
            this.fragranceQty = parseFloat((this.fillingLevel * 0.30).toFixed(2));
        }
        if (!this.alcoholQty || this.alcoholQty === 0) {
            this.alcoholQty = parseFloat((this.fillingLevel * 0.70).toFixed(2));
        }
    }
});

// ============================================
// ✅ PRE-FINDONEANDUPDATE MIDDLEWARE - NO next()
// ============================================
packageSchema.pre('findOneAndUpdate', async function () {
    const update = this.getUpdate();
    const query = this.getQuery();

    // If updating fillingLevel or bottleML, validate
    if (update.fillingLevel !== undefined || update.bottleML !== undefined || update.$set) {
        // Check if update is using $set
        const updateData = update.$set || update;

        // Get the current document
        const doc = await this.model.findOne(query);
        if (!doc) return;

        const bottleML = updateData.bottleML !== undefined ? updateData.bottleML : doc.bottleML;
        const fillingLevel = updateData.fillingLevel !== undefined ? updateData.fillingLevel : doc.fillingLevel;

        // Validate
        if (fillingLevel > bottleML) {
            throw new Error(`Filling level (${fillingLevel}) cannot exceed bottle ML (${bottleML})`);
        }

        // Auto-calculate fragrance and alcohol if filling level changed
        if (updateData.fillingLevel !== undefined && updateData.fillingLevel > 0) {
            if (updateData.fragranceQty === undefined) {
                // If using $set
                if (update.$set) {
                    update.$set.fragranceQty = parseFloat((updateData.fillingLevel * 0.30).toFixed(2));
                    update.$set.alcoholQty = parseFloat((updateData.fillingLevel * 0.70).toFixed(2));
                } else {
                    // Direct update
                    update.fragranceQty = parseFloat((updateData.fillingLevel * 0.30).toFixed(2));
                    update.alcoholQty = parseFloat((updateData.fillingLevel * 0.70).toFixed(2));
                }
            }
        }
    }
});

// ============================================
// ✅ INDEXES - REMOVED DUPLICATES
// ============================================
// Only keep unique indexes
packageSchema.index({ packageName: 1 }, { unique: true });
packageSchema.index({ isActive: 1 });
packageSchema.index({ bottleML: 1 });

// ============================================
// ✅ MODEL
// ============================================
const Package = mongoose.models.Package || mongoose.model('Package', packageSchema);

module.exports = Package;