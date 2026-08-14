const cron = require("node-cron");
const resetLoyaltyCoins = require("../jobs/loyaltyReset");

// Schedule: January 1st at 12:00 AM every year
// Cron expression: 0 0 1 1 *  (minute hour day month dayOfWeek)

const scheduleLoyaltyReset = () => {
    console.log(`\n⏰ ===== SCHEDULING LOYALTY COINS RESET =====`);

    // Schedule the job
    const task = cron.schedule(
        "0 0 1 1 *", // January 1st at 12:00 AM
        async () => {
            console.log(`\n🔄 Cron Job Triggered: Loyalty Coins Reset`);
            await resetLoyaltyCoins();
        },
        {
            scheduled: true,
            timezone: "Asia/Kolkata",
        }
    );

    console.log(`✅ Loyalty coins reset scheduled for: January 1st at 12:00 AM IST`);

    // ✅ FIX: Get next run time using task.getNext() instead of nextDates()
    try {
        // For node-cron v3+, use task.getNext()
        if (typeof task.getNext === 'function') {
            const nextRun = task.getNext();
            console.log(`📅 Next scheduled run: ${nextRun.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
        } else {
            // Fallback: calculate next run manually
            const now = new Date();
            const nextJan1 = new Date(now.getFullYear() + (now.getMonth() >= 0 ? 1 : 0), 0, 1, 0, 0, 0);
            console.log(`📅 Next scheduled run: ${nextJan1.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
        }
    } catch (error) {
        console.log(`⚠️ Could not calculate next run time: ${error.message}`);
    }

    return task;
};

module.exports = {
    scheduleLoyaltyReset,
};