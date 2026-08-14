const express = require("express");
const router = express.Router();
const resetLoyaltyCoins = require("../jobs/loyaltyReset");

// ✅ MANUAL TRIGGER - For testing purposes (NO PERMISSION CHECK)
router.post("/reset-loyalty-coins", async (req, res) => {
    try {
        console.log(`🔄 Manual trigger: Loyalty coins reset initiated`);

        const result = await resetLoyaltyCoins();

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: "Loyalty coins reset completed successfully",
                data: {
                    totalCustomers: result.totalCustomers,
                    totalCoinsReset: result.totalCoinsReset,
                    modifiedCount: result.modifiedCount
                }
            });
        } else {
            return res.status(500).json({
                success: false,
                message: "Loyalty coins reset failed",
                error: result.error
            });
        }

    } catch (error) {
        console.error("Error in manual reset:", error);
        res.status(500).json({
            success: false,
            message: "Failed to reset loyalty coins",
            error: error.message
        });
    }
});

// ✅ GET RESET STATUS - Check when last reset happened
router.get("/reset-status", async (req, res) => {
    try {
        const Log = require("../models/log");
        const lastReset = await Log.findOne({
            module: 'Loyalty Reset',
            action: 'Reset Coins',
            heading: 'Loyalty Coins Reset Completed'
        }).sort({ createdAt: -1 });

        if (lastReset) {
            return res.status(200).json({
                success: true,
                data: {
                    lastReset: lastReset.createdAt,
                    description: lastReset.description,
                    performedBy: lastReset.userName || lastReset.userEmail
                }
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                lastReset: null,
                message: "No previous reset records found"
            }
        });

    } catch (error) {
        console.error("Error fetching reset status:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch reset status",
            error: error.message
        });
    }
});

module.exports = router;