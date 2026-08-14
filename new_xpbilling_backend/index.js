const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const connectDB = require("./config/mongodb");
require("dotenv").config();
const path = require("path");

process.env.TZ = 'Asia/Kolkata';

const app = express();

// Connect to MongoDB
connectDB();

app.use(
    cors({
        origin: [
            "http://localhost:5173",
            "https://xp-billing.vercel.app",
            "https://xp.techorses.com",
        ],
        credentials: true,
    })
);

// Middleware
app.use(express.json());
app.use(cookieParser());

// ========== IMPORT ROUTES ==========
const customerRoutes = require("./routes/customerRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require('./routes/admin');
const promoCodesRoutes = require('./routes/promoCodes');
const packageRoutes = require('./routes/packages');
const workshopRoutes = require('./routes/workshops');

// INVENTORY 
const bottlesRoutes = require('./routes/inventory/bottles');
const xpRoutes = require('./routes/inventory/xp');
const dispenserRoutes = require('./routes/inventory/dispenser');

const disposalRoutes = require('./routes/productDisposal');
const invoiceRoutes = require('./routes/invoice');
const dashboardRoutes = require("./routes/dashboard");
const reportsRoutes = require("./routes/reports");

// ✅ NEW: Loyalty Reset Routes
const loyaltyResetRoutes = require("./routes/loyaltyResetRoutes");

// ✅ NEW: Cron Scheduler
const { scheduleLoyaltyReset } = require("./utils/cronScheduler");
const logsRoutes = require('./routes/logsRoutes');


// ========== USE ROUTES ==========
app.use('/customer', customerRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/promo', promoCodesRoutes);
app.use('/packages', packageRoutes);
app.use('/workshops', workshopRoutes);

app.use('/bottles', bottlesRoutes);
app.use('/xp', xpRoutes);
app.use('/dispenser', dispenserRoutes);

app.use('/disposal', disposalRoutes);
app.use('/invoice', invoiceRoutes);

app.use("/dashboard", dashboardRoutes);
app.use("/reports", reportsRoutes);

// ✅ NEW: Loyalty Reset Routes
app.use("/loyalty", loyaltyResetRoutes);
app.use('/logs', logsRoutes);


// Test route
app.get("/", (req, res) => {
    res.send("XP Billing Software is Running OK!");
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:4000`);

    // ✅ Start the cron scheduler AFTER server starts
    scheduleLoyaltyReset();
});