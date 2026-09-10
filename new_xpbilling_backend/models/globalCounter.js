const mongoose = require('mongoose');

const globalCounterSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true
    }, // e.g. 'invoices-2026', 'invoices-2027'
    count: {
        type: Number,
        required: true,
        default: 0
    }
}, {
    timestamps: true
});

const GlobalCounter = mongoose.models.GlobalCounter || mongoose.model('GlobalCounter', globalCounterSchema);

module.exports = GlobalCounter;