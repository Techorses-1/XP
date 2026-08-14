const Customer = require("../models/customer");
const { logSuccess, logFailed } = require("../utils/logHelper");
const { sendLoyaltyResetEmail } = require("../utils/emailService");

// Get user from env or use system user
const SYSTEM_USER = {
    userId: "system",
    userName: "System",
    userEmail: process.env.EMAIL_USER,
};

// Main reset function
const resetLoyaltyCoins = async () => {
    console.log(`\n🔄 ===== LOYALTY COINS RESET STARTED =====`);
    console.log(`📅 Date: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

    try {
        // Step 1: Get all customers with coins > 0
        const customersWithCoins = await Customer.find({
            loyaltyCoins: { $gt: 0 }
        }).lean();

        const totalCustomers = customersWithCoins.length;
        let totalCoinsReset = 0;

        console.log(`📊 Found ${totalCustomers} customers with loyalty coins`);

        if (totalCustomers === 0) {
            console.log("ℹ️ No customers have loyalty coins to reset");

            // Log success even if no coins to reset
            await logSuccess({
                module: 'Loyalty Reset',
                userId: SYSTEM_USER.userId,
                userName: SYSTEM_USER.userName,
                userEmail: SYSTEM_USER.userEmail,
                action: 'Reset Coins',
                heading: 'Loyalty Coins Reset Completed',
                description: 'No customers had loyalty coins to reset. All customers already have 0 coins.'
            });

            // Still send email notification
            await sendLoyaltyResetEmail({
                totalCustomers: 0,
                totalCoinsReset: 0,
                resetDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
            });

            return {
                success: true,
                totalCustomers: 0,
                totalCoinsReset: 0,
                message: 'No coins to reset'
            };
        }

        // Step 2: Calculate total coins before reset
        totalCoinsReset = customersWithCoins.reduce((sum, c) => sum + c.loyaltyCoins, 0);
        console.log(`🪙 Total coins to reset: ${totalCoinsReset}`);

        // Step 3: Reset all customers' loyalty coins to 0
        const result = await Customer.updateMany(
            { loyaltyCoins: { $gt: 0 } },
            { $set: { loyaltyCoins: 0 } }
        );

        console.log(`✅ Updated ${result.modifiedCount} customers`);

        // Step 4: Log success
        await logSuccess({
            module: 'Loyalty Reset',
            userId: SYSTEM_USER.userId,
            userName: SYSTEM_USER.userName,
            userEmail: SYSTEM_USER.userEmail,
            action: 'Reset Coins',
            heading: 'Loyalty Coins Reset Completed',
            description: `Reset ${totalCustomers} customers. Total coins reset: ${totalCoinsReset}`
        });

        // Step 5: Send email notification
        const emailResult = await sendLoyaltyResetEmail({
            totalCustomers: totalCustomers,
            totalCoinsReset: totalCoinsReset,
            resetDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        });

        if (emailResult.success) {
            console.log(`✅ Email sent successfully`);
        } else {
            console.log(`⚠️ Email failed: ${emailResult.error}`);
        }

        console.log(`\n✅ ===== LOYALTY COINS RESET COMPLETED =====`);
        console.log(`📊 ${totalCustomers} customers reset, ${totalCoinsReset} coins cleared`);

        return {
            success: true,
            totalCustomers: totalCustomers,
            totalCoinsReset: totalCoinsReset,
            emailSent: emailResult.success,
            modifiedCount: result.modifiedCount
        };

    } catch (error) {
        console.error(`❌ Loyalty coins reset failed:`, error);

        // Log failure
        await logFailed({
            module: 'Loyalty Reset',
            userId: SYSTEM_USER.userId,
            userName: SYSTEM_USER.userName,
            userEmail: SYSTEM_USER.userEmail,
            action: 'Reset Coins',
            heading: 'Loyalty Coins Reset Failed',
            description: error.message || 'Unknown error occurred'
        });

        return {
            success: false,
            error: error.message
        };
    }
};

module.exports = resetLoyaltyCoins;