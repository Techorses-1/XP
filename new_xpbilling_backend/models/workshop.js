const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const workshopCustomerSchema = new mongoose.Schema({
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
    packageId: {
        type: String,
        required: true,
        ref: 'Package'
    },
    packageName: {
        type: String,
        required: true
    },
    packagePricing: {
        type: Number,
        required: true,
        min: 0
    },
    packageOilCount: {
        type: Number,
        required: true,
        min: 0
    },
    packageDiscount: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    attended: {
        type: Boolean,
        default: true
    },
    // ✅ ADD THESE 2 NEW FIELDS
    invoiceCreated: {
        type: Boolean,
        default: false
    },
    invoiceId: {
        type: String,
        default: null
    }
}, {
    _id: true
});

const workshopSchema = new mongoose.Schema({
    workshopId: {
        type: String,
        unique: true,
        default: function () {
            const randomStr = Math.random().toString(36).substring(2, 9);
            return `wrkshp-${randomStr}`;
        }
    },
    date: {
        type: Date,
        required: [true, 'Date is required']
    },
    startTime: {
        type: String,
        required: [true, 'Start time is required']
    },
    endTime: {
        type: String,
        required: [true, 'End time is required']
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    customers: [workshopCustomerSchema],

}, {
    timestamps: true
});

// ✅ Indexes - keep only necessary ones
workshopSchema.index({ date: 1, startTime: 1 }, { unique: true });
workshopSchema.index({ status: 1 });
workshopSchema.index({ isDeleted: 1 });
// date, startTime, endTime are covered by compound unique index

// Static method to check if slot is available
workshopSchema.statics.isSlotAvailable = async function (date, startTime, endTime, excludeWorkshopId = null) {
    const query = {
        date: date,
        isDeleted: false,
        $or: [
            {
                startTime: { $lt: endTime },
                endTime: { $gt: startTime }
            }
        ]
    };

    if (excludeWorkshopId) {
        query.workshopId = { $ne: excludeWorkshopId };
    }

    const existing = await this.findOne(query);
    return !existing;
};

const Workshop = mongoose.models.Workshop || mongoose.model('Workshop', workshopSchema);

module.exports = Workshop;