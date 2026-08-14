const nodemailer = require("nodemailer");

// Email configuration
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

console.log(`📧 Email Service initialized with: ${EMAIL_USER}`);

// Create transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false,
        },
    });
};

// Send email function
const sendEmail = async (to, subject, htmlContent) => {
    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: `"XP Billing System" <${EMAIL_USER}>`,
            to: to,
            subject: subject,
            html: htmlContent,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error("❌ Email sending failed:", error);
        return { success: false, error: error.message };
    }
};

// Send loyalty reset notification
const sendLoyaltyResetEmail = async (stats) => {
    const { totalCustomers, totalCoinsReset, resetDate } = stats;

    const subject = "🔄 Annual Loyalty Coins Reset Completed";

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #3f3f91; text-align: center;">🔄 Annual Loyalty Coins Reset</h2>
            <div style="background: #f0f4ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="font-size: 14px; color: #555;">✅ <strong>Reset Completed Successfully</strong></p>
            </div>

            <div style="margin: 20px 0;">
                <h3 style="color: #333;">📊 Reset Summary</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;"><strong>Reset Date:</strong></td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${resetDate}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;"><strong>Total Customers Reset:</strong></td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${totalCustomers}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;"><strong>Total Coins Reset:</strong></td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${totalCoinsReset}</td>
                    </tr>
                </table>
            </div>

            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="font-size: 13px; color: #666; margin: 0;">
                    All customer loyalty coins have been reset to 0.
                </p>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />

            <p style="font-size: 12px; color: #999; text-align: center;">
                This is an automated system notification.<br />
                XP Billing System
            </p>
        </div>
    `;

    return await sendEmail(EMAIL_USER, subject, html);
};

module.exports = {
    sendEmail,
    sendLoyaltyResetEmail,
};