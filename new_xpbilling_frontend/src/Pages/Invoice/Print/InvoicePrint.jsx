import React from "react";
import "./InvoicePrint.scss";
import logo from "../../../assets/logo/logo.png";

const InvoicePrint = ({ invoice }) => {
    if (!invoice) return null;

    const {
        invoiceNumber,
        invoiceDate,
        customer,
        packageItem,
        dispenserItems,
        paymentStatus,
        subtotalWithoutGST,
        gstRate,
        gstAmount,
        promoDiscount,
        loyaltyDiscountAmount,
        loyaltyCoinsUsed,
        totalDiscountAmount,
        grandTotal,
        promoApplied,
        notes,
        hasPackage,
        hasDispenser,
        hasPromo,
        workshop,
        loyaltyCoinsEarned
    } = invoice;

    // ============================================
    // HELPER: Number to Words Conversion
    // ============================================
    const numberToWords = (num) => {
        if (num === 0) return 'Zero';

        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
            'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
            'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        let integerPart = Math.floor(num);
        let words = '';

        if (integerPart >= 10000000) {
            words += numberToWords(Math.floor(integerPart / 10000000)) + ' Crore ';
            integerPart %= 10000000;
        }

        if (integerPart >= 100000) {
            words += numberToWords(Math.floor(integerPart / 100000)) + ' Lakh ';
            integerPart %= 100000;
        }

        if (integerPart >= 1000) {
            words += numberToWords(Math.floor(integerPart / 1000)) + ' Thousand ';
            integerPart %= 1000;
        }

        if (integerPart >= 100) {
            words += numberToWords(Math.floor(integerPart / 100)) + ' Hundred ';
            integerPart %= 100;
        }

        if (integerPart > 0) {
            if (words !== '') words += ' ';

            if (integerPart < 20) {
                words += ones[integerPart];
            } else {
                words += tens[Math.floor(integerPart / 10)];
                if (integerPart % 10 > 0) {
                    words += ' ' + ones[integerPart % 10];
                }
            }
        }

        // Handle decimal part (paise)
        const decimalPart = Math.round((num - Math.floor(num)) * 100);
        if (decimalPart > 0) {
            if (words !== '') words += ' and ';
            if (decimalPart < 20) {
                words += ones[decimalPart] + ' Paise';
            } else {
                words += tens[Math.floor(decimalPart / 10)];
                if (decimalPart % 10 > 0) {
                    words += ' ' + ones[decimalPart % 10] + ' Paise';
                }
            }
        }

        return words.trim();
    };

    // ============================================
    // HELPER: Format Currency
    // ============================================
    const formatCurrency = (value) => {
        if (value === undefined || value === null) return "₹0.00";
        return `₹${Number(value).toFixed(2)}`;
    };

    // ============================================
    // HELPER: Format Date
    // ============================================
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    // ============================================
    // ✅ GET VALUES DIRECTLY FROM INVOICE
    // ============================================
    const packageFinalPrice = packageItem?.finalPrice || packageItem?.pricing || 0;

    // ✅ Dispenser Total - Use finalPrice from database
    const dispenserTotal = hasDispenser && dispenserItems
        ? dispenserItems.reduce((sum, item) => sum + (item.finalPrice || 0), 0)
        : 0;

    // ✅ Price (excl GST) = BEFORE promo and loyalty (only package + dispenser discounts)
    const priceExclGST = subtotalWithoutGST || 0;

    // ✅ Subtotal = AFTER promo and loyalty discounts
    const subtotalAfterAllDiscounts = (subtotalWithoutGST || 0) - (promoDiscount || 0) - (loyaltyDiscountAmount || 0);

    // ============================================
    // TERMS & CONDITIONS
    // ============================================
    const termsAndConditions =
        `Items once sold will not be taken back. \nOnly manufacturing defects are eligible for replacement within 1 day of purchase.`;

    const declaration =
        `We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.`;

    return (
        <div id="invoice-print">
            <div className="invoice-container">

                {/* ============================================
                    HEADER - Company Logo & Address
                ============================================ */}
                <div className="invoice-header">
                    <div className="company-top-info">
                        <div className="company-name-left">
                            <p style={{ fontSize: '9px', fontWeight: 'normal' }}>SFP SONS (INDIA) PRIVATE LIMITED</p>
                        </div>
                        <div className="gst-number-right">
                            <p>24AAICS9235N1ZS</p>
                        </div>
                    </div>

                    <div className="logo-address-center">
                        <div className="invoice-logo">
                            <img src={logo} alt="Company Logo" />
                        </div>
                        <div className="company-address">
                            <div className="address-details">
                                <p>Shop no 4, Siddharth Complex, RC Dutt Rd, Aradhana Society,</p>
                                <p>Vishwas Colony, Alkapuri, Vadodara, Gujarat 390023</p>

                            </div>
                        </div>
                    </div>
                </div>

                {/* ============================================
                    TAX INVOICE HEADING
                ============================================ */}
                <div className="tax-invoice-heading">
                    <h1>TAX INVOICE</h1>
                </div>

                {/* ============================================
                    INVOICE & CUSTOMER DETAILS
                ============================================ */}
                <div className="invoice-details-section">
                    <div className="customer-info">
                        <h3>Billing Details</h3>
                        <table className="details-table">
                            <tbody>
                                <tr>
                                    <td>Customer Name:</td>
                                    <td><strong>{customer?.customerName || "N/A"}</strong></td>
                                </tr>
                                {customer?.email && (
                                    <tr>
                                        <td>Email:</td>
                                        <td>{customer.email}</td>
                                    </tr>
                                )}
                                {customer?.contactNumber && (
                                    <tr>
                                        <td>Mobile:</td>
                                        <td>{customer.contactNumber}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="invoice-info">
                        <h3>Invoice Details</h3>
                        <table className="details-table">
                            <tbody>
                                <tr>
                                    <td>Invoice Number:</td>
                                    <td><strong>{invoiceNumber || "N/A"}</strong></td>
                                </tr>
                                <tr>
                                    <td>Date:</td>
                                    <td>{formatDate(invoiceDate)}</td>
                                </tr>
                                <tr>
                                    <td>Payment Type:</td>
                                    <td><strong>{(paymentStatus || "N/A").toUpperCase()}</strong></td>
                                </tr>
                                {workshop && (
                                    <tr>
                                        <td>Workshop:</td>
                                        <td>{formatDate(workshop.date)} {workshop.startTime} - {workshop.endTime}</td>
                                    </tr>
                                )}
                                {hasPromo && promoApplied && (
                                    <tr>
                                        <td>Promo Code:</td>
                                        <td><strong>{promoApplied.code}</strong> ({promoApplied.discount}% off)</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ============================================
                    ITEMS TABLE - Package & Dispenser
                ============================================ */}
                <div className="items-section">
                    <h3>Items Details</h3>
                    <table className="items-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Product / Item</th>
                                <th>ML</th>
                                <th>Qty</th>
                                <th>Price</th>
                                <th>Disc %</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Package Item */}
                            {hasPackage && packageItem && (
                                <tr>
                                    <td>1</td>
                                    <td><strong>{packageItem.packageName}</strong></td>
                                    <td>{packageItem.bottleML}ml</td>
                                    <td>1</td>
                                    <td>{formatCurrency(packageItem.pricing)}</td>
                                    <td>{packageItem.discount || 0}%</td>
                                    <td>{formatCurrency(packageItem.finalPrice || packageItem.pricing)}</td>
                                </tr>
                            )}

                            {/* ✅ Dispenser Items - USING DATABASE VALUES DIRECTLY */}
                            {hasDispenser && dispenserItems && dispenserItems.length > 0 && (
                                dispenserItems.map((item, index) => {
                                    const price = item.ml === 3 ? item.sellingPrice3ml : item.sellingPrice6ml;
                                    // ✅ Use finalPrice directly from database!
                                    const finalPrice = item.finalPrice || 0;

                                    return (
                                        <tr key={index}>
                                            <td>{hasPackage ? index + 2 : index + 1}</td>
                                            <td><strong>{item.productName}</strong></td>
                                            <td>{item.ml}ml</td>
                                            <td>{item.quantity}</td>
                                            <td>{formatCurrency(price)}</td>
                                            <td>{item.discount || 0}%</td>
                                            <td>{formatCurrency(finalPrice)}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ============================================
                    ✅ TOTALS SECTION - CORRECT ORDER
                ============================================ */}
                <div className="totals-section">
                    <div className="amount-details">
                        <table>
                            <tbody>
                                {/* 1. PRICE (excl GST) - BEFORE promo & loyalty */}
                                <tr>
                                    <td><strong>Price(Excl gst):</strong></td>
                                    <td><strong>{formatCurrency(priceExclGST)}</strong></td>
                                </tr>

                                {/* 2. Package Price (after discount) */}
                                {hasPackage && packageItem && (
                                    <tr>
                                        <td>Package Price:</td>
                                        <td>{formatCurrency(packageFinalPrice)}</td>
                                    </tr>
                                )}

                                {/* 3. Dispenser Price (after discount) */}
                                {hasDispenser && dispenserItems && dispenserItems.length > 0 && (
                                    <tr>
                                        <td >Dispenser Price:</td>
                                        <td>{formatCurrency(dispenserTotal)}</td>
                                    </tr>
                                )}

                                {/* 4. Promo Discount (if exists) */}
                                {hasPromo && promoDiscount > 0 && (
                                    <tr>
                                        <td >Promo Discount:</td>
                                        <td style={{ color: '#dc3545' }}>-{formatCurrency(promoDiscount)}</td>
                                    </tr>
                                )}

                                {/* 5. Loyalty Discount (if exists) */}
                                {loyaltyDiscountAmount > 0 && (
                                    <tr>
                                        <td>Loyalty Discount ({loyaltyCoinsUsed || 0} coins):</td>
                                        <td style={{ color: '#dc3545' }}>-{formatCurrency(loyaltyDiscountAmount)}</td>
                                    </tr>
                                )}

                                {/* 6. Total Discount (sum of all discounts) */}
                                {totalDiscountAmount > 0 && (
                                    <tr>
                                        <td><strong>Total Discount:</strong></td>
                                        <td style={{ color: '#dc3545' }}><strong>-{formatCurrency(totalDiscountAmount)}</strong></td>
                                    </tr>
                                )}

                                {/* 7. Subtotal (After ALL discounts, BEFORE GST) */}
                                <tr style={{ borderTop: '1px dashed #ddd' }}>
                                    <td><strong>Subtotal:</strong></td>
                                    <td><strong>{formatCurrency(subtotalAfterAllDiscounts)}</strong></td>
                                </tr>

                                {/* 8. GST */}
                                <tr>
                                    <td><strong>GST ({gstRate || 18}%):</strong></td>
                                    <td><strong>{formatCurrency(gstAmount || 0)}</strong></td>
                                </tr>

                                {/* 9. Grand Total */}
                                <tr className="grand-total">
                                    <td><strong>Grand Total:</strong></td>
                                    <td><strong>{formatCurrency(grandTotal || 0)}</strong></td>
                                </tr>

                                {/* ✅ Loyalty Coins Earned (At bottom) */}
                                {/* {loyaltyCoinsEarned > 0 && (
                                    <tr>
                                        <td style={{ paddingTop: '10px', borderTop: '1px solid #ddd' }}>
                                            <span style={{ fontSize: '12px', color: '#555' }}>🪙 Loyalty Coins Earned:</span>
                                        </td>
                                        <td style={{ paddingTop: '10px', borderTop: '1px solid #ddd', textAlign: 'right' }}>
                                            <span style={{ color: '#28a745', fontWeight: 'bold' }}>+{loyaltyCoinsEarned} coins</span>
                                        </td>
                                    </tr>
                                )} */}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ============================================
                    AMOUNT IN WORDS
                ============================================ */}
                <div className="amount-in-words">
                    <p><strong>Amount in Words:</strong> {numberToWords(grandTotal || 0)} Only</p>
                </div>

                {/* ============================================
                    DECLARATION & TERMS
                ============================================ */}
                <div className="declaration-terms-section">
                    <div className="declaration-section">
                        <h3>Declaration</h3>
                        <p>{declaration}</p>
                    </div>
                    <div className="terms-section">
                        <h3>Terms & Conditions</h3>
                        <pre>{termsAndConditions}</pre>
                    </div>
                </div>

                {/* ============================================
                    NOTES
                ============================================ */}
                {notes && (
                    <div className="notes-section">
                        <h3>Notes</h3>
                        <p>{notes}</p>
                    </div>
                )}

                {/* ============================================
                    FOOTER
                ============================================ */}
                <div className="invoice-footer">
                    <div className="thank-you">
                        <p>Thank you for your business!</p>
                    </div>
                    <div className="signature">
                        <p>Authorized Signature</p>
                        <div className="signature-line"></div>
                    </div>
                    <div className="developer-note">
                        <p>
                            Developed by <a href="https://techorses.com" target="_blank" rel="noopener noreferrer">Techorses</a>
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default InvoicePrint;