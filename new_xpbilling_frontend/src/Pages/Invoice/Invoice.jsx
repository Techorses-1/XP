import React, { useState, useEffect } from "react";
import { toast, ToastContainer } from "react-toastify";
import {
    FaUser, FaPhone, FaEnvelope, FaBoxOpen,
    FaFlask, FaTag, FaMoneyBillWave, FaTrash,
    FaPlus, FaSave, FaList, FaTimes, FaEye,
    FaFileInvoice, FaSearch, FaBan, FaCalendarAlt,
    FaCreditCard, FaPlusCircle, FaCheck, FaWindowClose,
    FaPercentage, FaEdit, FaUndo, FaHistory, FaCoins,
    FaFilePdf, FaWhatsapp, FaDownload, FaOilCan,
    FaToggleOn, FaToggleOff
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Navbar from "../../Components/Navbar/Navbar";
import "./Invoice.scss";
import "react-toastify/dist/ReactToastify.css";
import Select from 'react-select';
import html2pdf from "html2pdf.js";
import InvoicePrint from "./Print/InvoicePrint";

// ============================================
// CONFIRMATION MODAL
// ============================================
const ConfirmationModal = ({
    show,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Yes",
    cancelText = "Cancel",
    isConfirming = false,
    type = "warning"
}) => {
    if (!show) return null;

    const getIcon = () => {
        if (type === "danger") return <FaTrash className="confirmation-icon danger" />;
        if (type === "warning") return <FaBan className="confirmation-icon warning" />;
        return <FaCheck className="confirmation-icon info" />;
    };

    const getButtonClass = () => {
        if (type === "danger") return "confirmation-btn-danger";
        if (type === "warning") return "confirmation-btn-warning";
        return "confirmation-btn-info";
    };

    return (
        <div className="confirmation-overlay" onClick={onClose}>
            <div className="confirmation-modal" onClick={(e) => e.stopPropagation()}>
                <div className="confirmation-header">
                    <div className="confirmation-title">
                        {getIcon()}
                        {title}
                    </div>
                    <button className="confirmation-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="confirmation-body">
                    <p>{message}</p>
                </div>
                <div className="confirmation-footer">
                    <button className="confirmation-btn-cancel" onClick={onClose}>
                        {cancelText}
                    </button>
                    <button
                        className={`confirmation-btn-confirm ${getButtonClass()}`}
                        onClick={onConfirm}
                        disabled={isConfirming}
                    >
                        {isConfirming ? "Processing..." : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// INVOICE DETAILS MODAL
// ============================================
const InvoiceDetailsModal = ({
    show, onClose, invoice, isLoading, formatDate, getStatusClass,
    onGeneratePDF, onWhatsApp, isExporting
}) => {
    if (!show) return null;

    // Normalize packages to array (handles old single packageItem too)
    const normalizePackages = (inv) => {
        if (!inv) return [];
        if (inv.packageItems && inv.packageItems.length > 0) {
            return inv.packageItems.map(p => {
                const o = { ...p };
                if (!o.quantity) o.quantity = 1;
                return o;
            });
        }
        if (inv.packageItem && inv.packageItem.packageId) {
            const o = { ...inv.packageItem };
            if (!o.quantity) o.quantity = 1;
            return [o];
        }
        return [];
    };

    const packages = normalizePackages(invoice);

    return (
        <div className="inv-modal-overlay" onClick={onClose}>
            <div className="inv-modal-content inv-modal-lg" onClick={(e) => e.stopPropagation()}>
                <div className="inv-modal-header">
                    <div className="inv-modal-title">
                        <FaFileInvoice /> Invoice Details
                    </div>
                    <button className="inv-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="inv-modal-body">
                    {isLoading ? (
                        <div className="inv-list-loading">
                            <div className="inv-loading-spinner-dark large"></div>
                            <p>Loading invoice details...</p>
                        </div>
                    ) : !invoice ? (
                        <div className="inv-list-empty">
                            <FaFileInvoice className="inv-list-empty-icon" />
                            <p>Unable to load invoice details</p>
                        </div>
                    ) : (
                        <>
                            <div className="inv-details-header-strip">
                                <div>
                                    <span className="inv-details-label">Invoice Number</span>
                                    <strong className="inv-details-invoice-number">{invoice.invoiceNumber}</strong>
                                </div>
                                <span className={`inv-status-badge ${getStatusClass(invoice.status)}`}>
                                    {invoice.status}
                                </span>
                            </div>

                            <div className="inv-details-section">
                                <h4><FaUser /> Customer</h4>
                                <div className="inv-details-grid">
                                    <div className="inv-details-item">
                                        <span className="inv-details-label">Name</span>
                                        <strong>{invoice.customer?.customerName}</strong>
                                    </div>
                                    <div className="inv-details-item">
                                        <span className="inv-details-label">Phone</span>
                                        <strong>{invoice.customer?.contactNumber}</strong>
                                    </div>
                                    {invoice.customer?.email && (
                                        <div className="inv-details-item">
                                            <span className="inv-details-label">Email</span>
                                            <strong>{invoice.customer.email}</strong>
                                        </div>
                                    )}
                                    <div className="inv-details-item">
                                        <span className="inv-details-label">Loyalty Coins</span>
                                        <strong>{invoice.customer?.loyaltyCoins || 0}</strong>
                                    </div>
                                    <div className="inv-details-item">
                                        <span className="inv-details-label">Invoice Date</span>
                                        <strong>{formatDate(invoice.invoiceDate)}</strong>
                                    </div>
                                </div>
                            </div>

                            {invoice.hasWorkshop && invoice.workshop && (
                                <div className="inv-details-section">
                                    <h4><FaCalendarAlt /> Workshop</h4>
                                    <div className="inv-details-grid">
                                        <div className="inv-details-item">
                                            <span className="inv-details-label">Date</span>
                                            <strong>{formatDate(invoice.workshop.date)}</strong>
                                        </div>
                                        <div className="inv-details-item">
                                            <span className="inv-details-label">Time</span>
                                            <strong>{invoice.workshop.startTime} - {invoice.workshop.endTime}</strong>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {packages.length > 0 && (
                                <>
                                    {packages.map((pkg, pkgIdx) => (
                                        <div className="inv-details-section" key={pkgIdx}>
                                            <h4><FaBoxOpen /> Package {pkgIdx + 1}{packages.length > 1 ? ` of ${packages.length}` : ''}: {pkg.packageName}</h4>
                                            <div className="inv-details-grid">
                                                <div className="inv-details-item">
                                                    <span className="inv-details-label">Quantity</span>
                                                    <strong>{pkg.quantity || 1}</strong>
                                                </div>
                                                <div className="inv-details-item">
                                                    <span className="inv-details-label">Original Price</span>
                                                    <strong>₹{pkg.pricing}</strong>
                                                </div>
                                                <div className="inv-details-item">
                                                    <span className="inv-details-label">Discount</span>
                                                    <strong>{pkg.discount}%</strong>
                                                </div>
                                                <div className="inv-details-item">
                                                    <span className="inv-details-label">Discount Amount</span>
                                                    <strong className="inv-discount-amount">-₹{pkg.discountAmount?.toFixed(2) || 0}</strong>
                                                </div>
                                                <div className="inv-details-item">
                                                    <span className="inv-details-label">Final Price (per unit)</span>
                                                    <strong className="inv-final-price">₹{pkg.finalPrice?.toFixed(2) || pkg.pricing}</strong>
                                                </div>
                                                <div className="inv-details-item">
                                                    <span className="inv-details-label">Bottle Size</span>
                                                    <strong>{pkg.bottleML}ml</strong>
                                                </div>
                                                <div className="inv-details-item">
                                                    <span className="inv-details-label">Fragrance Qty</span>
                                                    <strong>{pkg.fragranceQty}ml</strong>
                                                </div>
                                                <div className="inv-details-item">
                                                    <span className="inv-details-label">Fragrance Base</span>
                                                    <strong>{pkg.alcoholQty}ml</strong>
                                                </div>
                                            </div>

                                            {pkg.xpOilItems && pkg.xpOilItems.length > 0 && (
                                                <div className="inv-details-xp-oils">
                                                    <h5><FaOilCan /> XP Oils Used</h5>
                                                    <table className="inv-details-xp-table">
                                                        <thead>
                                                            <tr>
                                                                <th>Oil Name</th>
                                                                <th>ML</th>
                                                                <th>Density</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {pkg.xpOilItems.map((oil, idx) => (
                                                                <tr key={idx}>
                                                                    <td>{oil.productName}</td>
                                                                    <td>{oil.ml}ml</td>
                                                                    <td>{oil.density || 1000}</td>
                                                                </tr>
                                                            ))}
                                                            <tr className="inv-details-xp-total">
                                                                <td colSpan="1"><strong>Total Fragrance</strong></td>
                                                                <td><strong>{pkg.xpOilItems.reduce((sum, o) => sum + (o.ml || 0), 0)}ml</strong></td>
                                                                <td></td>
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </>
                            )}

                            {invoice.hasDispenser && invoice.dispenserItems?.length > 0 && (
                                <div className="inv-details-section">
                                    <h4><FaFlask /> Dispenser Items</h4>
                                    <div className="inv-details-table-wrap">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Product</th>
                                                    <th>ML</th>
                                                    <th>Qty</th>
                                                    <th>Unit Price</th>
                                                    <th>Discount</th>
                                                    <th>Total Price</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {invoice.dispenserItems.map((item, idx) => {
                                                    const dbPrice = item.ml === 3 ? item.sellingPrice3ml : item.sellingPrice6ml;
                                                    const unitPrice = item.unitPrice || dbPrice;
                                                    const discountPercent = item.discount || 0;
                                                    const discountAmt = (unitPrice * discountPercent) / 100;
                                                    const finalUnitPrice = unitPrice - discountAmt;
                                                    const totalPrice = finalUnitPrice * item.quantity;

                                                    return (
                                                        <tr key={idx}>
                                                            <td>{item.productName}</td>
                                                            <td>{item.ml}ml</td>
                                                            <td>{item.quantity}</td>
                                                            <td>₹{unitPrice.toFixed(2)}</td>
                                                            <td>{item.discount}%</td>
                                                            <td>₹{totalPrice.toFixed(2)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {invoice.hasPromo && invoice.promoApplied && (
                                <div className="inv-details-section">
                                    <h4><FaTag /> Promo Applied</h4>
                                    <div className="inv-details-grid">
                                        <div className="inv-details-item">
                                            <span className="inv-details-label">Code</span>
                                            <strong>{invoice.promoApplied.code}</strong>
                                        </div>
                                        <div className="inv-details-item">
                                            <span className="inv-details-label">Discount</span>
                                            <strong>{invoice.promoApplied.discount}%</strong>
                                        </div>
                                        <div className="inv-details-item">
                                            <span className="inv-details-label">Discount Amount</span>
                                            <strong className="inv-discount-amount">-₹{invoice.promoApplied.discountAmount?.toFixed(2) || 0}</strong>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {(invoice.loyaltyCoinsEarned > 0 || invoice.loyaltyCoinsUsed > 0) && (
                                <div className="inv-details-section">
                                    <h4><FaCoins /> Loyalty Coins</h4>
                                    <div className="inv-details-grid">
                                        {invoice.loyaltyCoinsEarned > 0 && (
                                            <div className="inv-details-item">
                                                <span className="inv-details-label">Coins Earned</span>
                                                <strong className="inv-loyalty-earned">+{invoice.loyaltyCoinsEarned} coins</strong>
                                            </div>
                                        )}
                                        {invoice.loyaltyCoinsUsed > 0 && (
                                            <div className="inv-details-item">
                                                <span className="inv-details-label">Coins Used</span>
                                                <strong className="inv-loyalty-used">-{invoice.loyaltyCoinsUsed} coins</strong>
                                            </div>
                                        )}
                                        {invoice.loyaltyDiscountAmount > 0 && (
                                            <div className="inv-details-item">
                                                <span className="inv-details-label">Discount from Coins</span>
                                                <strong className="inv-discount-amount">-₹{invoice.loyaltyDiscountAmount?.toFixed(2)}</strong>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="inv-details-section">
                                <h4><FaCreditCard /> Payment &amp; Totals</h4>
                                <div className="inv-details-totals">
                                    <div className="inv-details-totals-row">
                                        <span>Subtotal (incl. GST)</span>
                                        <strong>₹{invoice.subtotal?.toFixed(2)}</strong>
                                    </div>
                                    <div className="inv-details-totals-row inv-details-totals-sub">
                                        <span>Package Discount</span>
                                        <strong className="inv-discount-amount">-₹{invoice.packageDiscountAmount?.toFixed(2) || 0}</strong>
                                    </div>
                                    <div className="inv-details-totals-row inv-details-totals-sub">
                                        <span>Dispenser Discount</span>
                                        <strong className="inv-discount-amount">-₹{invoice.dispenserDiscountAmount?.toFixed(2) || 0}</strong>
                                    </div>
                                    {invoice.hasPromo && (
                                        <div className="inv-details-totals-row inv-details-totals-sub inv-details-totals-promo">
                                            <span>Promo Discount</span>
                                            <strong className="inv-discount-amount">-₹{invoice.promoDiscount?.toFixed(2)}</strong>
                                        </div>
                                    )}
                                    {invoice.loyaltyDiscountAmount > 0 && (
                                        <div className="inv-details-totals-row inv-details-totals-sub inv-details-totals-loyalty">
                                            <span>Loyalty Discount</span>
                                            <strong className="inv-discount-amount">-₹{invoice.loyaltyDiscountAmount?.toFixed(2)}</strong>
                                        </div>
                                    )}
                                    <div className="inv-details-totals-row inv-details-totals-sub">
                                        <span>Total Discount</span>
                                        <strong className="inv-discount-amount">-₹{invoice.totalDiscountAmount?.toFixed(2) || 0}</strong>
                                    </div>
                                    <div className="inv-details-totals-row inv-details-totals-sub">
                                        <span>GST ({invoice.gstRate}%)</span>
                                        <strong>₹{invoice.gstAmount?.toFixed(2)}</strong>
                                    </div>
                                    <div className="inv-details-totals-row inv-details-totals-grand">
                                        <span>Grand Total</span>
                                        <strong>₹{invoice.grandTotal?.toFixed(2)}</strong>
                                    </div>
                                    <div className="inv-details-totals-row inv-details-totals-sub">
                                        <span>Payment Method</span>
                                        <strong>{invoice.paymentStatus}</strong>
                                    </div>
                                </div>
                            </div>

                            {invoice.notes && (
                                <div className="inv-details-section">
                                    <h4>Notes</h4>
                                    <p className="inv-details-notes">{invoice.notes}</p>
                                </div>
                            )}

                            <div className="inv-details-footer-meta">
                                Created by <strong>{invoice.createdBy?.userName || 'Unknown'}</strong>
                            </div>
                        </>
                    )}
                </div>
                <div className="inv-modal-footer">
                    <button
                        className="inv-modal-btn-pdf"
                        onClick={() => onGeneratePDF(invoice)}
                        disabled={isExporting}
                    >
                        <FaFilePdf /> {isExporting ? "Generating..." : "Download PDF"}
                    </button>
                    <button
                        className="inv-modal-btn-whatsapp"
                        onClick={() => onWhatsApp(invoice)}
                    >
                        <FaWhatsapp /> Send WhatsApp
                    </button>
                    <button className="inv-modal-btn-close" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// DELETE CONFIRMATION MODAL
// ============================================
const DeleteConfirmModal = ({ show, onClose, onConfirm, invoice, isDeleting }) => {
    if (!show) return null;

    return (
        <div className="inv-modal-overlay" onClick={onClose}>
            <div className="inv-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="inv-modal-header">
                    <div className="inv-modal-title">
                        <FaTrash /> Confirm Deletion
                    </div>
                    <button className="inv-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="inv-modal-body">
                    <div className="inv-delete-warning">
                        <FaTrash className="inv-delete-icon" />
                        <h3>Are you sure you want to delete this invoice?</h3>
                        <p>This action will:</p>
                        <ul>
                            <li>Return all inventory used in this invoice</li>
                            <li>Remove the invoice from active records</li>
                            <li>Save a copy for audit purposes</li>
                            <li>Return loyalty coins used</li>
                            <li>Remove loyalty coins earned</li>
                            <li>This action <strong>CANNOT</strong> be undone easily</li>
                        </ul>
                        {invoice && (
                            <div className="inv-delete-summary">
                                <div><strong>Invoice:</strong> {invoice.invoiceNumber}</div>
                                <div><strong>Customer:</strong> {invoice.customer?.customerName}</div>
                                <div><strong>Total:</strong> ₹{invoice.grandTotal?.toFixed(2)}</div>
                                {invoice.loyaltyCoinsEarned > 0 && (
                                    <div><strong>Loyalty Earned:</strong> {invoice.loyaltyCoinsEarned} coins</div>
                                )}
                                {invoice.loyaltyCoinsUsed > 0 && (
                                    <div><strong>Loyalty Used:</strong> {invoice.loyaltyCoinsUsed} coins</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <div className="inv-modal-footer">
                    <button className="inv-modal-btn-cancel" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="inv-modal-btn-delete"
                        onClick={onConfirm}
                        disabled={isDeleting}
                    >
                        {isDeleting ? 'Deleting...' : 'Yes, Delete Invoice'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// MAIN INVOICE COMPONENT
// ============================================
const Invoice = () => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [exportingInvoices, setExportingInvoices] = useState({});
    const [isExportingAll, setIsExportingAll] = useState(false);
    const navigate = useNavigate();

    // ========== PAGE VIEW TOGGLE ==========
    const [activeView, setActiveView] = useState("create");

    // ========== EDIT MODE ==========
    const [isEditing, setIsEditing] = useState(false);
    const [editingInvoiceId, setEditingInvoiceId] = useState(null);

    // ========== CONFIRMATION MODAL ==========
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [confirmationConfig, setConfirmationConfig] = useState({
        title: "",
        message: "",
        confirmText: "Yes",
        cancelText: "Cancel",
        type: "warning",
        onConfirm: null
    });
    const [isConfirming, setIsConfirming] = useState(false);

    // ========== PDF & WHATSAPP STATE ==========
    const [invoiceForPrint, setInvoiceForPrint] = useState(null);

    // ========== DATA STATES ==========
    const [customers, setCustomers] = useState([]);
    const [workshops, setWorkshops] = useState([]);
    const [packages, setPackages] = useState([]);
    const [xpOils, setXpOils] = useState([]);
    const [dispenserOils, setDispenserOils] = useState([]);
    const [promoCodes, setPromoCodes] = useState([]);

    // ========== INVOICE FORM STATE ==========
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [newCustomerName, setNewCustomerName] = useState("");
    const [newCustomerEmail, setNewCustomerEmail] = useState("");
    const [newCustomerContact, setNewCustomerContact] = useState("");
    const [selectedWorkshop, setSelectedWorkshop] = useState(null);

    // ✅ NEW: Multiple packages array
    // Each item shape:
    // {
    //   lineId: string | null,          // backend-generated; null for new
    //   tempId: string,                  // frontend-only React key
    //   packageSelect: {value,label,data} | null,
    //   quantity: number,
    //   xpOilItems: [{ xpId, productName, ml, density, pricePerKG }],
    //   fragranceBaseML: string,
    //   discount: number,
    //   // temp inputs for adding a new XP oil in this block:
    //   xpOilSelect: {value,label,data} | null,
    //   xpOilML: string,
    // }
    const [packageItems, setPackageItems] = useState([]);

    // ✅ Package Mode Toggle (Default: false = Workshop Mode)
    const [packageMode, setPackageMode] = useState(false);

    // ✅ Dispenser items (unchanged)
    const [dispenserItems, setDispenserItems] = useState([]);
    const [selectedPromo, setSelectedPromo] = useState(null);
    const [paymentStatus, setPaymentStatus] = useState("Cash");
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState("");

    // ========== LOYALTY COINS STATE ==========
    const [useLoyaltyCoins, setUseLoyaltyCoins] = useState(false);
    const [availableLoyaltyCoins, setAvailableLoyaltyCoins] = useState(0);
    const [usableLoyaltyCoins, setUsableLoyaltyCoins] = useState(0);
    const [loyaltyCoinsUsed, setLoyaltyCoinsUsed] = useState(0);
    const [loyaltyCoinsEarned, setLoyaltyCoinsEarned] = useState(0);
    const [loyaltyDiscountAmount, setLoyaltyDiscountAmount] = useState(0);

    // ========== DISPENSER ADD FORM ==========
    const [dispenserSelect, setDispenserSelect] = useState(null);
    const [dispenserML, setDispenserML] = useState("");
    const [dispenserQty, setDispenserQty] = useState("");

    // ========== RECENT WORKSHOP ==========
    const [recentWorkshop, setRecentWorkshop] = useState(null);

    // ========== CALCULATIONS ==========
    const [packageOriginalTotal, setPackageOriginalTotal] = useState(0);
    const [packageDiscountTotal, setPackageDiscountTotal] = useState(0);
    const [packageFinalTotal, setPackageFinalTotal] = useState(0);

    const [dispenserOriginalTotal, setDispenserOriginalTotal] = useState(0);
    const [dispenserDiscountTotal, setDispenserDiscountTotal] = useState(0);
    const [dispenserFinalTotal, setDispenserFinalTotal] = useState(0);

    const [subtotal, setSubtotal] = useState(0);
    const [subtotalWithoutGST, setSubtotalWithoutGST] = useState(0);
    const [gstAmount, setGstAmount] = useState(0);
    const [promoDiscount, setPromoDiscount] = useState(0);
    const [totalDiscount, setTotalDiscount] = useState(0);
    const [grandTotal, setGrandTotal] = useState(0);

    // ========== INVOICE LIST STATE ==========
    const [allInvoices, setAllInvoices] = useState([]);
    const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
    const [invoiceSearchTerm, setInvoiceSearchTerm] = useState("");
    const [hasLoadedInvoicesOnce, setHasLoadedInvoicesOnce] = useState(false);

    const [timeFilter, setTimeFilter] = useState("all");
    const [paymentFilter, setPaymentFilter] = useState("");

    // ========== MODAL STATES ==========
    const [showInvoiceDetailsModal, setShowInvoiceDetailsModal] = useState(false);
    const [viewingInvoice, setViewingInvoice] = useState(null);
    const [isLoadingInvoiceDetails, setIsLoadingInvoiceDetails] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletingInvoice, setDeletingInvoice] = useState(null);

    // ========== GST RATE ==========
    const GST_RATE = 18;

    // ============================================
    // HELPER: new empty package block
    // ============================================
    const createEmptyPackageBlock = (packageData = null) => ({
        lineId: null,
        tempId: `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        packageSelect: packageData ? {
            value: packageData.packageId,
            label: packageData.packageName,
            data: packageData
        } : null,
        quantity: 1,
        xpOilItems: [],
        fragranceBaseML: packageData ? String(packageData.alcoholQty || "") : "",
        discount: packageData ? (packageData.discount || 0) : 0,
        xpOilSelect: null,
        xpOilML: ""
    });

    // ============================================
    // FETCH DATA
    // ============================================
    const fetchCustomers = async () => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/customer/get-customers?limit=1000`,
                { credentials: 'include' }
            );
            if (!response.ok) throw new Error('Failed to fetch customers');
            const data = await response.json();

            if (Array.isArray(data)) {
                setCustomers(data);
            } else if (data && data.data && Array.isArray(data.data)) {
                setCustomers(data.data);
            } else {
                setCustomers([]);
            }
        } catch (error) {
            console.error("Error fetching customers:", error);
            toast.error("Failed to fetch customers");
        }
    };

    const fetchPackages = async () => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/packages/get-active`,
                { credentials: 'include' }
            );
            if (!response.ok) throw new Error('Failed to fetch packages');
            const data = await response.json();
            setPackages(data);
        } catch (error) {
            console.error("Error fetching packages:", error);
            toast.error("Failed to fetch packages");
        }
    };

    const fetchXPOils = async () => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/xp/get-all?limit=1000&page=1`,
                { credentials: 'include' }
            );
            if (!response.ok) throw new Error('Failed to fetch XP oils');
            const data = await response.json();
            const oils = data.products || [];
            setXpOils(oils);
            setDispenserOils(oils);
        } catch (error) {
            console.error("Error fetching XP oils:", error);
            toast.error("Failed to fetch XP oils");
        }
    };

    const fetchPromoCodes = async () => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/promo/get-active-promos`,
                { credentials: 'include' }
            );
            if (!response.ok) throw new Error('Failed to fetch promo codes');
            const data = await response.json();
            setPromoCodes(data);
        } catch (error) {
            console.error("Error fetching promo codes:", error);
            toast.error("Failed to fetch promo codes");
        }
    };

    useEffect(() => {
        fetchCustomers();
        fetchPackages();
        fetchXPOils();
        fetchPromoCodes();
    }, []);

    // ============================================
    // FETCH WORKSHOPS FOR CUSTOMER
    // ============================================
    const fetchWorkshopsForCustomer = async (customerId) => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/workshops/get-active?filter=all&limit=100&sortBy=date&sortOrder=desc`,
                { credentials: 'include' }
            );

            if (!response.ok) {
                throw new Error('Failed to fetch workshops');
            }

            const data = await response.json();
            const workshopsArray = Array.isArray(data) ? data : data.workshops || data.data || [];

            const customerWorkshops = workshopsArray.filter(w => {
                const hasCustomer = w.customers && Array.isArray(w.customers) &&
                    w.customers.some(c => c.customerId === customerId);
                return hasCustomer;
            });

            return customerWorkshops;
        } catch (error) {
            console.error("Error fetching workshops:", error);
            toast.error("Failed to fetch workshops");
            return [];
        }
    };

    // ============================================
    // AUTO SELECT LATEST WORKSHOP (CREATE MODE)
    // ============================================
    useEffect(() => {
        const autoSelectWorkshop = async () => {
            if (!selectedCustomer || isEditing || packageMode) return;

            const customerWorkshops = await fetchWorkshopsForCustomer(selectedCustomer.value);
            setWorkshops(customerWorkshops);

            if (customerWorkshops.length > 0) {
                const latest = customerWorkshops.reduce((latestSoFar, current) => {
                    const currentDateTime = new Date(`${current.date}T${current.startTime}`);
                    const latestDateTime = new Date(`${latestSoFar.date}T${latestSoFar.startTime}`);
                    return currentDateTime > latestDateTime ? current : latestSoFar;
                }, customerWorkshops[0]);

                const customerInWorkshop = latest.customers.find(
                    c => c.customerId === selectedCustomer.value
                );

                if (customerInWorkshop && customerInWorkshop.invoiceCreated === true) {
                    toast.warning(`Latest workshop invoice already created for ${selectedCustomer.label}`);
                    setSelectedWorkshop(null);
                    setRecentWorkshop(null);
                } else {
                    setSelectedWorkshop({
                        value: latest.workshopId,
                        label: `${new Date(latest.date).toLocaleDateString()} - ${latest.startTime}`,
                        data: latest
                    });
                    setRecentWorkshop(latest);
                }
            } else {
                setSelectedWorkshop(null);
                setRecentWorkshop(null);
            }
        };

        autoSelectWorkshop();
    }, [selectedCustomer, isEditing, packageMode]);

    // ============================================
    // ✅ AUTO-ADD WORKSHOP PACKAGE AS FIRST BLOCK
    // ============================================
    useEffect(() => {
        if (selectedWorkshop && selectedCustomer && !packageMode && !isEditing) {
            const customerInWorkshop = selectedWorkshop.data.customers?.find(
                c => c.customerId === selectedCustomer.value
            );

            if (customerInWorkshop && customerInWorkshop.packageId) {
                const foundPackage = packages.find(p => p.packageId === customerInWorkshop.packageId);
                if (foundPackage) {
                    // Only auto-add if the array is empty OR has just one block that's the same workshop package
                    setPackageItems(prev => {
                        if (prev.length === 0) {
                            return [createEmptyPackageBlock(foundPackage)];
                        }
                        // If already has workshop package as first block, don't touch
                        if (prev[0]?.packageSelect?.value === foundPackage.packageId) {
                            return prev;
                        }
                        // Otherwise leave the array as user has it
                        return prev;
                    });
                }
            }
        }
    }, [selectedWorkshop, selectedCustomer, packages, packageMode, isEditing]);

    // ============================================
    // CUSTOMER SELECTION - Auto-fill new customer fields
    // ============================================
    useEffect(() => {
        if (selectedCustomer) {
            const cust = customers.find(c => c.customerId === selectedCustomer.value);
            if (cust) {
                setNewCustomerName(cust.customerName || "");
                setNewCustomerEmail(cust.email || "");
                setNewCustomerContact(cust.contactNumber || "");
            }
        } else {
            setNewCustomerName("");
            setNewCustomerEmail("");
            setNewCustomerContact("");
        }
    }, [selectedCustomer, customers]);

    // ============================================
    // CUSTOMER SELECTION - Fetch Loyalty Coins
    // ============================================
    useEffect(() => {
        if (selectedCustomer) {
            const customer = customers.find(c => c.customerId === selectedCustomer.value);
            if (customer) {
                const totalCoins = customer.loyaltyCoins || 0;
                const usable = Math.max(0, totalCoins - 50);
                setAvailableLoyaltyCoins(totalCoins);
                setUsableLoyaltyCoins(usable);
                setUseLoyaltyCoins(false);
                setLoyaltyCoinsUsed(0);
            }
        } else {
            setAvailableLoyaltyCoins(0);
            setUsableLoyaltyCoins(0);
            setUseLoyaltyCoins(false);
            setLoyaltyCoinsUsed(0);
        }
    }, [selectedCustomer, customers]);

    // ============================================
    // CALCULATE TOTALS (loops through all packages)
    // ============================================
    useEffect(() => {
        let pkgOriginalTotal = 0;
        let pkgDiscountTotal = 0;
        let pkgFinalTotal = 0;

        for (const block of packageItems) {
            const pkg = block.packageSelect?.data;
            if (!pkg) continue;
            const qty = parseInt(block.quantity) || 1;
            const discountPercent = block.discount || 0;
            const originalUnit = pkg.pricing || 0;
            const discountUnit = (originalUnit * discountPercent) / 100;
            const finalUnit = originalUnit - discountUnit;

            pkgOriginalTotal += originalUnit * qty;
            pkgDiscountTotal += discountUnit * qty;
            pkgFinalTotal += finalUnit * qty;
        }

        setPackageOriginalTotal(pkgOriginalTotal);
        setPackageDiscountTotal(pkgDiscountTotal);
        setPackageFinalTotal(pkgFinalTotal);

        let dispOriginalTotal = 0;
        let dispDiscountTotal = 0;
        let dispFinalTotal = 0;

        dispenserItems.forEach(item => {
            const price = item.ml === 3 ? item.sellingPrice3ml : item.sellingPrice6ml;
            const unitPrice = item.unitPrice || price;
            const itemDiscountPercent = item.discount || 0;
            const discountAmt = (unitPrice * itemDiscountPercent) / 100;
            const finalUnitPrice = unitPrice - discountAmt;
            const itemTotal = finalUnitPrice * item.quantity;

            dispOriginalTotal += unitPrice * item.quantity;
            dispDiscountTotal += discountAmt * item.quantity;
            dispFinalTotal += itemTotal;
        });

        setDispenserOriginalTotal(dispOriginalTotal);
        setDispenserDiscountTotal(dispDiscountTotal);
        setDispenserFinalTotal(dispFinalTotal);

        const subtotalWithGST = pkgFinalTotal + dispFinalTotal;
        setSubtotal(subtotalWithGST);

        const subtotalWithoutGSTCalc = subtotalWithGST / (1 + GST_RATE / 100);
        setSubtotalWithoutGST(subtotalWithoutGSTCalc);

        let promoDiscountAmt = 0;
        let afterPromo = subtotalWithoutGSTCalc;
        if (selectedPromo) {
            promoDiscountAmt = subtotalWithoutGSTCalc * (selectedPromo.discount / 100);
            afterPromo = subtotalWithoutGSTCalc - promoDiscountAmt;
        }
        setPromoDiscount(promoDiscountAmt);

        let loyaltyDiscountAmt = 0;
        let actualCoinsUsed = 0;
        let coinsEarned = 0;

        if (useLoyaltyCoins && usableLoyaltyCoins > 0 && !isEditing) {
            actualCoinsUsed = Math.min(usableLoyaltyCoins, afterPromo);
            loyaltyDiscountAmt = actualCoinsUsed;
            const afterLoyalty = afterPromo - loyaltyDiscountAmt;
            if (afterLoyalty > 0) {
                coinsEarned = Math.floor(afterLoyalty / 100);
            }
        } else {
            if (afterPromo > 0) {
                coinsEarned = Math.floor(afterPromo / 100);
            }
        }

        setLoyaltyCoinsUsed(actualCoinsUsed);
        setLoyaltyDiscountAmount(loyaltyDiscountAmt);
        setLoyaltyCoinsEarned(coinsEarned);

        const finalAmount = afterPromo - loyaltyDiscountAmt;
        const gst = finalAmount * (GST_RATE / 100);
        const grand = finalAmount + gst;
        const totalDiscountAmt = pkgDiscountTotal + dispDiscountTotal + promoDiscountAmt + loyaltyDiscountAmt;

        setGstAmount(gst);
        setTotalDiscount(totalDiscountAmt);
        setGrandTotal(grand);

    }, [packageItems, dispenserItems, selectedPromo, useLoyaltyCoins, usableLoyaltyCoins, isEditing, GST_RATE]);

    // ============================================
    // REFETCH INVOICES WHEN FILTERS CHANGE (LIST VIEW)
    // ============================================
    useEffect(() => {
        if (activeView === "list") {
            fetchAllInvoices();
        }
    }, [timeFilter, paymentFilter]);

    // ============================================
    // HANDLE WORKSHOP SELECTION
    // ============================================
    const handleWorkshopChange = (selected) => {
        if (!selected) {
            setSelectedWorkshop(null);
            return;
        }

        const customerInWorkshop = selected.data.customers?.find(
            c => c.customerId === selectedCustomer.value
        );

        if (customerInWorkshop && customerInWorkshop.invoiceCreated === true) {
            toast.error("This workshop already has an invoice created!");
            return;
        }

        setSelectedWorkshop(selected);
        setRecentWorkshop(selected.data);
    };

    // ============================================
    // ✅ HANDLE PACKAGE MODE TOGGLE
    // ============================================
    const handlePackageModeToggle = () => {
        const newState = !packageMode;
        setPackageMode(newState);

        if (newState) {
            setSelectedWorkshop(null);
            setRecentWorkshop(null);
            toast.info("Package Mode enabled. You can manually add packages.");
        } else {
            toast.info("Workshop Mode enabled.");
            if (selectedCustomer) {
                const autoSelect = async () => {
                    const customerWorkshops = await fetchWorkshopsForCustomer(selectedCustomer.value);
                    setWorkshops(customerWorkshops);
                    if (customerWorkshops.length > 0) {
                        const latest = customerWorkshops[0];
                        setSelectedWorkshop({
                            value: latest.workshopId,
                            label: `${new Date(latest.date).toLocaleDateString()} - ${latest.startTime}`,
                            data: latest
                        });
                        setRecentWorkshop(latest);
                    }
                };
                autoSelect();
            }
        }
    };

    // ============================================
    // ✅ ADD NEW PACKAGE BLOCK
    // ============================================
    const handleAddPackageBlock = () => {
        setPackageItems(prev => [...prev, createEmptyPackageBlock()]);
    };

    // ============================================
    // ✅ REMOVE PACKAGE BLOCK
    // ============================================
    const handleRemovePackageBlock = (tempId) => {
        setPackageItems(prev => prev.filter(b => b.tempId !== tempId));
    };

    // ============================================
    // ✅ UPDATE PACKAGE BLOCK — package select
    // ============================================
    const handleUpdatePackageSelect = (tempId, selected) => {
        setPackageItems(prev => prev.map(b => {
            if (b.tempId !== tempId) return b;
            // Reset XP oils & fragrance base when package changes
            const newBlock = {
                ...b,
                packageSelect: selected,
                xpOilItems: [],
                xpOilSelect: null,
                xpOilML: "",
                fragranceBaseML: selected?.data?.alcoholQty ? String(selected.data.alcoholQty) : "",
                discount: selected?.data?.discount || 0
            };
            return newBlock;
        }));
    };

    // ============================================
    // ✅ UPDATE PACKAGE BLOCK — quantity
    // ============================================
    const handleUpdatePackageQuantity = (tempId, newQty) => {
        const qty = parseInt(newQty);
        if (isNaN(qty) || qty < 1) return;
        setPackageItems(prev => prev.map(b => b.tempId === tempId ? { ...b, quantity: qty } : b));
    };

    // ============================================
    // ✅ UPDATE PACKAGE BLOCK — discount
    // ============================================
    const handleUpdatePackageDiscount = (tempId, newDiscount) => {
        const d = Math.min(100, Math.max(0, parseFloat(newDiscount) || 0));
        setPackageItems(prev => prev.map(b => b.tempId === tempId ? { ...b, discount: d } : b));
    };

    // ============================================
    // ✅ UPDATE PACKAGE BLOCK — fragrance base ML
    // ============================================
    const handleUpdatePackageFragranceBase = (tempId, newVal) => {
        setPackageItems(prev => prev.map(b => b.tempId === tempId ? { ...b, fragranceBaseML: newVal } : b));
    };

    // ============================================
    // ✅ UPDATE PACKAGE BLOCK — XP oil select
    // ============================================
    const handleUpdatePackageXPOilSelect = (tempId, selected) => {
        setPackageItems(prev => prev.map(b => b.tempId === tempId ? { ...b, xpOilSelect: selected } : b));
    };

    // ============================================
    // ✅ UPDATE PACKAGE BLOCK — XP oil ML input
    // ============================================
    const handleUpdatePackageXPOilML = (tempId, val) => {
        setPackageItems(prev => prev.map(b => b.tempId === tempId ? { ...b, xpOilML: val } : b));
    };

    // ============================================
    // ✅ ADD XP OIL TO A PACKAGE BLOCK
    // ============================================
    const handleAddXPOilToPackage = (tempId) => {
        setPackageItems(prev => prev.map(b => {
            if (b.tempId !== tempId) return b;

            if (!b.xpOilSelect) {
                toast.error("Please select an XP Oil");
                return b;
            }
            if (!b.xpOilML || parseFloat(b.xpOilML) <= 0) {
                toast.error("Please enter valid ML (> 0)");
                return b;
            }
            const ml = parseFloat(b.xpOilML);

            const exists = b.xpOilItems.some(x => x.xpId === b.xpOilSelect.value);
            if (exists) {
                toast.error("This XP Oil is already added to this package");
                return b;
            }

            const newItem = {
                xpId: b.xpOilSelect.value,
                productName: b.xpOilSelect.label,
                ml: ml,
                density: b.xpOilSelect.data?.density || 1000,
                pricePerKG: b.xpOilSelect.data?.avgPurchasePrice || 0
            };

            toast.success(`Added ${newItem.productName} (${ml}ml)`);

            return {
                ...b,
                xpOilItems: [...b.xpOilItems, newItem],
                xpOilSelect: null,
                xpOilML: ""
            };
        }));
    };

    // ============================================
    // ✅ REMOVE XP OIL FROM A PACKAGE BLOCK
    // ============================================
    const handleRemoveXPOilFromPackage = (tempId, xpIndex) => {
        setPackageItems(prev => prev.map(b => {
            if (b.tempId !== tempId) return b;
            return { ...b, xpOilItems: b.xpOilItems.filter((_, i) => i !== xpIndex) };
        }));
    };

    // ============================================
    // ✅ UPDATE XP OIL ML IN A PACKAGE BLOCK
    // ============================================
    const handleUpdateXPOilMLInPackage = (tempId, xpIndex, newML) => {
        const ml = parseFloat(newML);
        if (isNaN(ml) || ml <= 0) {
            toast.error("ML must be greater than 0");
            return;
        }
        setPackageItems(prev => prev.map(b => {
            if (b.tempId !== tempId) return b;
            const updated = [...b.xpOilItems];
            updated[xpIndex] = { ...updated[xpIndex], ml };
            return { ...b, xpOilItems: updated };
        }));
    };

    // ============================================
    // ✅ HANDLE ADD DISPENSER ITEM
    // ============================================
    const handleAddDispenser = () => {
        if (!dispenserSelect) {
            toast.error("Please select a dispenser oil");
            return;
        }

        if (!dispenserML) {
            toast.error("Please select ML");
            return;
        }

        if (!dispenserQty || parseInt(dispenserQty) <= 0) {
            toast.error("Please enter valid quantity");
            return;
        }

        const ml = parseInt(dispenserML);
        const qty = parseInt(dispenserQty);
        const totalML = ml * qty;

        const exists = dispenserItems.some(
            item => item.xpId === dispenserSelect.value && item.ml === ml
        );

        if (exists) {
            toast.error("This oil with same ML is already added");
            return;
        }

        const defaultUnitPrice = ml === 3 ? dispenserSelect.data?.sellingPrice3ml : dispenserSelect.data?.sellingPrice6ml;

        setDispenserItems([
            ...dispenserItems,
            {
                xpId: dispenserSelect.value,
                productName: dispenserSelect.label,
                ml: ml,
                quantity: qty,
                totalML: totalML,
                unitPrice: defaultUnitPrice || 0,
                sellingPrice3ml: dispenserSelect.data?.sellingPrice3ml || 0,
                sellingPrice6ml: dispenserSelect.data?.sellingPrice6ml || 0,
                discount: 0
            }
        ]);

        setDispenserSelect(null);
        setDispenserML("");
        setDispenserQty("");

        toast.success("Dispenser item added");
    };

    const handleUpdateDispenserUnitPrice = (index, newUnitPrice) => {
        const updatedItems = [...dispenserItems];
        const unitPrice = parseFloat(newUnitPrice);
        if (!isNaN(unitPrice) && unitPrice >= 0) {
            updatedItems[index].unitPrice = unitPrice;
            setDispenserItems(updatedItems);
        }
    };

    const handleRemoveDispenser = (index) => {
        const newItems = dispenserItems.filter((_, i) => i !== index);
        setDispenserItems(newItems);
    };

    const handleUpdateDispenserDiscount = (index, newDiscount) => {
        const updatedItems = [...dispenserItems];
        const discount = Math.min(100, Math.max(0, parseFloat(newDiscount) || 0));
        updatedItems[index].discount = discount;
        setDispenserItems(updatedItems);
    };

    const handleUpdateDispenserML = (index, newMl) => {
        const updatedItems = [...dispenserItems];
        const ml = parseInt(newMl);
        if (!isNaN(ml) && (ml === 3 || ml === 6)) {
            const item = updatedItems[index];
            const newTotalML = ml * item.quantity;
            item.ml = ml;
            item.totalML = newTotalML;
            const price = ml === 3 ? item.sellingPrice3ml : item.sellingPrice6ml;
            item.unitPrice = price || item.unitPrice || 0;
            setDispenserItems(updatedItems);
        }
    };

    const handleUpdateDispenserQuantity = (index, newQty) => {
        const updatedItems = [...dispenserItems];
        const qty = parseInt(newQty);
        if (!isNaN(qty) && qty > 0) {
            const item = updatedItems[index];
            const newTotalML = item.ml * qty;
            item.quantity = qty;
            item.totalML = newTotalML;
            setDispenserItems(updatedItems);
        }
    };

    // ============================================
    // HANDLE CLEAR
    // ============================================
    const handleAddAndCloseWorkshop = () => {
        setSelectedWorkshop(null);
        setPackageItems([]);
        setRecentWorkshop(null);
        setPackageMode(false);
        toast.info("Workshop & Packages cleared");
    };

    const handleCloseDispenser = () => {
        setDispenserItems([]);
        setDispenserSelect(null);
        setDispenserML("");
        setDispenserQty("");
        toast.info("Dispenser items cleared");
    };

    // ============================================
    // GENERATE PDF
    // ============================================
    const generatePDF = async (invoice) => {
        if (!invoice) return;

        const invoiceId = invoice.invoiceId || invoice.invoiceNumber;

        if (exportingInvoices[invoiceId]) return;

        setExportingInvoices(prev => ({ ...prev, [invoiceId]: true }));

        try {
            setInvoiceForPrint(invoice);

            await new Promise(resolve => setTimeout(resolve, 500));

            let element = document.getElementById("invoice-print");
            let attempts = 0;
            while (!element && attempts < 3) {
                await new Promise(resolve => setTimeout(resolve, 300));
                element = document.getElementById("invoice-print");
                attempts++;
            }

            if (!element) {
                toast.error("PDF element not found. Please try again.");
                setExportingInvoices(prev => ({ ...prev, [invoiceId]: false }));
                setInvoiceForPrint(null);
                return;
            }

            const opt = {
                filename: `${invoice.invoiceNumber}_${invoice.customer?.customerName || "customer"}.pdf`,
                image: { type: "jpeg", quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
                pagebreak: { mode: ['css', 'legacy'] },
                margin: [0, 0, 20, 0]
            };

            await html2pdf().set(opt).from(element).save();
            toast.success("PDF downloaded successfully!");

        } catch (error) {
            console.error("PDF generation error:", error);
            toast.error("Failed to generate PDF");
        } finally {
            setExportingInvoices(prev => ({ ...prev, [invoiceId]: false }));
            setInvoiceForPrint(null);
        }
    };

    // ============================================
    // OPEN WHATSAPP
    // ============================================
    const handleWhatsApp = (invoice) => {
        try {
            const customerMobile = invoice.customer?.contactNumber?.replace(/\D/g, '');
            if (!customerMobile) {
                toast.error("Customer mobile number not found");
                return;
            }

            const message = `Hello ${invoice.customer?.customerName || "Customer"},\n\n` +
                `Thank you for your purchase!\n` +
                `📄 Invoice: ${invoice.invoiceNumber}\n` +
                `📅 Date: ${formatDate(invoice.invoiceDate)}\n` +
                `💰 Total: ₹${invoice.grandTotal?.toFixed(2)}\n` +
                `💳 Payment: ${invoice.paymentStatus}\n\n` +
                `🪙 Loyalty Coins Earned: ${invoice.loyaltyCoinsEarned || 0}\n\n` +
                `Thank you for shopping with us! 🙏`;

            const url = `https://wa.me/${customerMobile}?text=${encodeURIComponent(message)}`;
            window.open(url, "_blank");
            toast.success("WhatsApp opened successfully!");

        } catch (error) {
            console.error("WhatsApp error:", error);
            toast.error("Failed to open WhatsApp");
        }
    };

    // ============================================
    // SHOW CONFIRMATION MODAL
    // ============================================
    const showConfirmationModal = (config) => {
        setConfirmationConfig({
            title: config.title || "Confirm",
            message: config.message || "Are you sure?",
            confirmText: config.confirmText || "Yes",
            cancelText: config.cancelText || "Cancel",
            type: config.type || "warning",
            onConfirm: config.onConfirm || null
        });
        setShowConfirmation(true);
    };

    const handleConfirmation = async () => {
        if (confirmationConfig.onConfirm) {
            setIsConfirming(true);
            try {
                await confirmationConfig.onConfirm();
            } catch (error) {
                console.error("Confirmation action failed:", error);
            } finally {
                setIsConfirming(false);
                setShowConfirmation(false);
            }
        } else {
            setShowConfirmation(false);
        }
    };

    // ============================================
    // VALIDATE PACKAGE BLOCKS (returns error msg or null)
    // ============================================
    const validatePackageBlocks = () => {
        for (let i = 0; i < packageItems.length; i++) {
            const b = packageItems[i];
            const label = `Package ${i + 1}`;

            if (!b.packageSelect) {
                return `${label}: please select a package`;
            }
            if (!b.quantity || b.quantity < 1) {
                return `${label}: quantity must be at least 1`;
            }
            if (!b.xpOilItems || b.xpOilItems.length === 0) {
                return `${label}: at least one XP Oil is required`;
            }
            if (!b.fragranceBaseML || parseFloat(b.fragranceBaseML) <= 0) {
                return `${label}: Fragrance Base ML must be greater than 0`;
            }
        }
        return null;
    };

    // ============================================
    // HANDLE CREATE INVOICE
    // ============================================
    const handleCreateInvoice = async () => {
        try {
            const isNewCustomer = !selectedCustomer;

            if (isNewCustomer) {
                if (!newCustomerName.trim()) {
                    toast.error("Please enter customer name");
                    return;
                }
                if (!newCustomerContact.trim()) {
                    toast.error("Please enter customer phone number");
                    return;
                }
                if (!/^[0-9]{10}$/.test(newCustomerContact.trim())) {
                    toast.error("Phone number must be exactly 10 digits");
                    return;
                }
                if (newCustomerEmail.trim() && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(newCustomerEmail.trim())) {
                    toast.error("Please enter a valid email address");
                    return;
                }
            }

            if (packageItems.length === 0 && dispenserItems.length === 0) {
                toast.error("Please add a package or dispenser items");
                return;
            }

            const pkgError = validatePackageBlocks();
            if (pkgError) {
                toast.error(pkgError);
                return;
            }

            setIsSubmitting(true);

            const payload = {
                customerId: selectedCustomer?.value || null,
                newCustomer: isNewCustomer ? {
                    customerName: newCustomerName.trim(),
                    email: newCustomerEmail.trim() || undefined,
                    contactNumber: newCustomerContact.trim()
                } : null,
                workshopId: packageMode ? null : (selectedWorkshop?.value || null),
                packageItems: packageItems.map(b => ({
                    lineId: b.lineId || undefined,
                    packageId: b.packageSelect.value,
                    quantity: parseInt(b.quantity) || 1,
                    xpOilItems: b.xpOilItems.map(x => ({ xpId: x.xpId, ml: x.ml })),
                    fragranceBaseML: parseFloat(b.fragranceBaseML) || 0,
                    discount: b.discount || 0
                })),
                dispenserItems: dispenserItems.map(item => ({
                    xpId: item.xpId,
                    ml: item.ml,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice || 0,
                    discount: item.discount || 0
                })),
                promoCode: selectedPromo?.code || null,
                paymentStatus: paymentStatus,
                invoiceDate: invoiceDate,
                notes: notes,
                loyaltyCoinsUsed: loyaltyCoinsUsed || 0
            };

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/invoice/create`,
                {
                    method: "POST",
                    credentials: 'include',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to create invoice");
            }

            const result = await response.json();

            let successMsg = `Invoice ${result.invoice.invoiceNumber} created successfully!`;
            if (result.loyaltyCoins) {
                successMsg += ` 🪙 Earned ${result.loyaltyCoins.earned} coins, Used ${result.loyaltyCoins.used} coins`;
            }
            toast.success(successMsg);

            setInvoiceForPrint(result.invoice);
            await generatePDF(result.invoice);
            handleWhatsApp(result.invoice);

            resetForm();
            fetchAllInvoices();

        } catch (error) {
            console.error("Error creating invoice:", error);
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ============================================
    // HANDLE UPDATE INVOICE
    // ============================================
    const handleUpdateInvoice = async () => {
        try {
            if (!editingInvoiceId) {
                toast.error("No invoice to update");
                return;
            }

            if (!selectedCustomer) {
                toast.error("Please select a customer");
                return;
            }

            if (packageItems.length === 0 && dispenserItems.length === 0) {
                toast.error("Please add a package or dispenser items");
                return;
            }

            const pkgError = validatePackageBlocks();
            if (pkgError) {
                toast.error(pkgError);
                return;
            }

            setIsUpdating(true);

            const payload = {
                packageItems: packageItems.map(b => ({
                    lineId: b.lineId || undefined,  // CRITICAL for smart diff
                    packageId: b.packageSelect.value,
                    quantity: parseInt(b.quantity) || 1,
                    xpOilItems: b.xpOilItems.map(x => ({ xpId: x.xpId, ml: x.ml })),
                    fragranceBaseML: parseFloat(b.fragranceBaseML) || 0,
                    discount: b.discount || 0
                })),
                dispenserItems: dispenserItems.map(item => ({
                    xpId: item.xpId,
                    ml: item.ml,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice || 0,
                    discount: item.discount || 0
                })),
                promoCode: selectedPromo?.code || null,
                paymentStatus: paymentStatus,
                invoiceDate: invoiceDate,
                notes: notes
            };

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/invoice/update/${editingInvoiceId}`,
                {
                    method: "PUT",
                    credentials: 'include',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to update invoice");
            }

            const result = await response.json();
            toast.success(`Invoice ${result.invoice.invoiceNumber} updated successfully!`);

            resetForm();
            setIsEditing(false);
            setEditingInvoiceId(null);
            fetchAllInvoices();

        } catch (error) {
            console.error("Error updating invoice:", error);
            toast.error(error.message);
        } finally {
            setIsUpdating(false);
        }
    };

    // ============================================
    // HANDLE DELETE INVOICE
    // ============================================
    const handleDeleteInvoice = async () => {
        if (!deletingInvoice) return;

        try {
            setIsDeleting(true);

            const invoiceId = deletingInvoice.invoiceId || deletingInvoice._id;

            if (!invoiceId) {
                toast.error("Invalid invoice ID");
                setIsDeleting(false);
                return;
            }

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/invoice/delete/${invoiceId}`,
                {
                    method: "DELETE",
                    credentials: 'include',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ deletionReason: 'Invoice deleted by user' })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to delete invoice");
            }

            const result = await response.json();
            toast.success(`Invoice ${result.deletedInvoice.invoiceNumber} deleted successfully!`);

            setShowDeleteModal(false);
            setDeletingInvoice(null);
            fetchAllInvoices();

        } catch (error) {
            console.error("Error deleting invoice:", error);
            toast.error(error.message);
        } finally {
            setIsDeleting(false);
        }
    };

    // ============================================
    // RESET FORM
    // ============================================
    const resetForm = () => {
        setSelectedCustomer(null);
        setNewCustomerName("");
        setNewCustomerEmail("");
        setNewCustomerContact("");
        setSelectedWorkshop(null);
        setPackageItems([]);
        setDispenserItems([]);
        setSelectedPromo(null);
        setPaymentStatus("Cash");
        setNotes("");

        setInvoiceDate(new Date().toISOString().split('T')[0]);
        setRecentWorkshop(null);

        setUseLoyaltyCoins(false);
        setLoyaltyCoinsUsed(0);
        setAvailableLoyaltyCoins(0);
        setUsableLoyaltyCoins(0);
        setPackageMode(false);
        setIsEditing(false);
        setEditingInvoiceId(null);
    };

    // ============================================
    // FETCH ALL INVOICES WITH FILTERS
    // ============================================
    const fetchAllInvoices = async () => {
        try {
            setIsLoadingInvoices(true);

            const params = new URLSearchParams();
            params.set('limit', '200');

            if (timeFilter && timeFilter !== 'all') {
                params.set('timeFilter', timeFilter);
            }

            if (paymentFilter) {
                params.set('paymentStatus', paymentFilter);
            }

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/invoice/get-all?${params}`,
                { credentials: 'include' }
            );

            if (!response.ok) throw new Error('Failed to fetch invoices');

            const data = await response.json();

            let filtered = data.invoices || [];
            if (invoiceSearchTerm.trim()) {
                const search = invoiceSearchTerm.trim().toLowerCase();
                filtered = filtered.filter(inv =>
                    inv.invoiceNumber?.toLowerCase().includes(search) ||
                    inv.customer?.customerName?.toLowerCase().includes(search) ||
                    inv.customer?.contactNumber?.includes(search)
                );
            }

            setAllInvoices(filtered);
            setHasLoadedInvoicesOnce(true);
        } catch (error) {
            console.error("Error fetching invoices:", error);
            toast.error("Failed to fetch invoices");
        } finally {
            setIsLoadingInvoices(false);
        }
    };

    const handleSearch = (value) => {
        setInvoiceSearchTerm(value);
        fetchAllInvoices();
    };

    // ============================================
    // HANDLE EDIT INVOICE - Load data into form
    // ============================================
    const handleEditInvoice = async (invoiceId) => {
        try {
            setIsLoadingInvoiceDetails(true);

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/invoice/${invoiceId}`,
                { credentials: 'include' }
            );

            if (!response.ok) throw new Error('Failed to fetch invoice details');

            const invoice = await response.json();

            setSelectedCustomer({
                value: invoice.customer.customerId,
                label: `${invoice.customer.customerName} - ${invoice.customer.contactNumber}`,
                data: invoice.customer
            });

            const hasWorkshop = invoice.hasWorkshop && invoice.workshop;

            if (hasWorkshop) {
                const workshopOption = {
                    value: invoice.workshop.workshopId,
                    label: `${new Date(invoice.workshop.date).toLocaleDateString()} - ${invoice.workshop.startTime}`,
                    data: {
                        workshopId: invoice.workshop.workshopId,
                        date: invoice.workshop.date,
                        startTime: invoice.workshop.startTime,
                        endTime: invoice.workshop.endTime,
                        customers: []
                    }
                };
                setSelectedWorkshop(workshopOption);
                setRecentWorkshop(invoice.workshop);

                setWorkshops([{
                    workshopId: invoice.workshop.workshopId,
                    date: invoice.workshop.date,
                    startTime: invoice.workshop.startTime,
                    endTime: invoice.workshop.endTime,
                    customers: []
                }]);
                setPackageMode(false);
            } else {
                const customerWorkshops = await fetchWorkshopsForCustomer(invoice.customer.customerId);
                const availableWorkshops = customerWorkshops.filter(w => {
                    const customerInWorkshop = w.customers?.find(
                        c => c.customerId === invoice.customer.customerId
                    );
                    return !(customerInWorkshop && customerInWorkshop.invoiceCreated === true);
                });
                setWorkshops(availableWorkshops);
                setSelectedWorkshop(null);
                setRecentWorkshop(null);
                setPackageMode(true);
            }

            // Normalize packages to array
            let incomingPackages = [];
            if (invoice.packageItems && invoice.packageItems.length > 0) {
                incomingPackages = invoice.packageItems.map(p => {
                    const o = { ...p };
                    if (!o.quantity) o.quantity = 1;
                    return o;
                });
            } else if (invoice.packageItem && invoice.packageItem.packageId) {
                const o = { ...invoice.packageItem };
                if (!o.quantity) o.quantity = 1;
                incomingPackages = [o];
            }

            const loadedBlocks = incomingPackages.map(pkg => {
                const foundPackage = packages.find(p => p.packageId === pkg.packageId) || {
                    packageId: pkg.packageId,
                    packageName: pkg.packageName,
                    pricing: pkg.pricing,
                    oilCount: pkg.oilCount,
                    discount: pkg.discount,
                    bottleML: pkg.bottleML,
                    fillingLevel: pkg.fillingLevel,
                    fragranceQty: pkg.fragranceQty,
                    alcoholQty: pkg.alcoholQty
                };

                const loadedXP = (pkg.xpOilItems || []).map(item => ({
                    xpId: item.xpId,
                    productName: item.productName,
                    ml: item.ml,
                    density: item.density || 1000,
                    pricePerKG: item.pricePerKG || 0
                }));

                // Fallback for very old invoices with single xpOil
                if (loadedXP.length === 0 && pkg.xpOil && pkg.xpOil.xpId) {
                    loadedXP.push({
                        xpId: pkg.xpOil.xpId,
                        productName: pkg.xpOil.productName,
                        ml: (pkg.xpOil.quantity || 0) * 1000,
                        density: pkg.xpOil.density || 1000,
                        pricePerKG: 0
                    });
                }

                return {
                    lineId: pkg.lineId || null,
                    tempId: `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    packageSelect: {
                        value: foundPackage.packageId,
                        label: foundPackage.packageName,
                        data: foundPackage
                    },
                    quantity: pkg.quantity || 1,
                    xpOilItems: loadedXP,
                    fragranceBaseML: String(pkg.alcoholQty || 0),
                    discount: pkg.discount || 0,
                    xpOilSelect: null,
                    xpOilML: ""
                };
            });

            setPackageItems(loadedBlocks);

            // Load dispenser items
            if (invoice.hasDispenser && invoice.dispenserItems.length > 0) {
                const items = invoice.dispenserItems.map(item => ({
                    xpId: item.xpId,
                    productName: item.productName,
                    ml: item.ml,
                    quantity: item.quantity,
                    totalML: item.totalML,
                    unitPrice: item.unitPrice || (item.ml === 3 ? item.sellingPrice3ml : item.sellingPrice6ml),
                    sellingPrice3ml: item.sellingPrice3ml || 0,
                    sellingPrice6ml: item.sellingPrice6ml || 0,
                    discount: item.discount || 0
                }));
                setDispenserItems(items);
            }

            if (invoice.hasPromo && invoice.promoApplied) {
                setSelectedPromo({
                    value: invoice.promoApplied.promoId,
                    label: `${invoice.promoApplied.code} - ${invoice.promoApplied.discount}%`,
                    code: invoice.promoApplied.code,
                    discount: invoice.promoApplied.discount,
                    data: invoice.promoApplied
                });
            }

            setPaymentStatus(invoice.paymentStatus || 'Cash');
            setInvoiceDate(invoice.invoiceDate ? new Date(invoice.invoiceDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
            setNotes(invoice.notes || '');

            setActiveView("create");
            setIsEditing(true);
            setEditingInvoiceId(invoiceId);

            toast.info(`Editing invoice ${invoice.invoiceNumber}`);

        } catch (error) {
            console.error("Error loading invoice for edit:", error);
            toast.error("Failed to load invoice for editing");
        } finally {
            setIsLoadingInvoiceDetails(false);
        }
    };

    // ============================================
    // SWITCH VIEWS
    // ============================================
    const handleSwitchToListView = () => {
        setActiveView("list");
        setInvoiceSearchTerm("");
        setTimeFilter("all");
        setPaymentFilter("");
        fetchAllInvoices();
    };

    const handleSwitchToCreateView = () => {
        if (isEditing) {
            showConfirmationModal({
                title: "Cancel Editing?",
                message: "You have unsaved changes. Are you sure you want to cancel editing?",
                confirmText: "Yes, Cancel",
                cancelText: "Keep Editing",
                type: "warning",
                onConfirm: () => {
                    resetForm();
                    setActiveView("create");
                }
            });
        } else {
            setActiveView("create");
        }
    };

    // ============================================
    // VIEW/DELETE/EXPORT
    // ============================================
    const handleViewInvoice = async (invoiceId) => {
        try {
            setViewingInvoice(null);
            setShowInvoiceDetailsModal(true);
            setIsLoadingInvoiceDetails(true);

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/invoice/${invoiceId}`,
                { credentials: 'include' }
            );

            if (!response.ok) throw new Error('Failed to fetch invoice details');

            const data = await response.json();
            setViewingInvoice(data);
        } catch (error) {
            console.error("Error fetching invoice details:", error);
            toast.error("Failed to fetch invoice details");
        } finally {
            setIsLoadingInvoiceDetails(false);
        }
    };

    const handleDeleteClick = (invoice) => {
        setDeletingInvoice(invoice);
        setShowDeleteModal(true);
    };

    const handleExportAll = async () => {
        try {
            setIsExportingAll(true);

            const params = new URLSearchParams();

            if (invoiceSearchTerm.trim()) {
                params.set('search', invoiceSearchTerm.trim());
            }

            if (timeFilter && timeFilter !== 'all') {
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                let startDate, endDate;

                switch (timeFilter) {
                    case 'today':
                        startDate = new Date(today);
                        endDate = new Date(today);
                        endDate.setDate(endDate.getDate() + 1);
                        break;
                    case 'yesterday': {
                        const yesterday = new Date(today);
                        yesterday.setDate(yesterday.getDate() - 1);
                        startDate = new Date(yesterday);
                        endDate = new Date(today);
                        break;
                    }
                    case 'thisWeek': {
                        const startOfWeek = new Date(today);
                        const day = today.getDay();
                        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                        startOfWeek.setDate(diff);
                        startOfWeek.setHours(0, 0, 0, 0);
                        startDate = new Date(startOfWeek);
                        endDate = new Date(today);
                        endDate.setDate(endDate.getDate() + 1);
                        break;
                    }
                    case 'thisMonth': {
                        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                        endDate = new Date(today);
                        endDate.setDate(endDate.getDate() + 1);
                        break;
                    }
                    case 'thisYear': {
                        startDate = new Date(today.getFullYear(), 0, 1);
                        endDate = new Date(today);
                        endDate.setDate(endDate.getDate() + 1);
                        break;
                    }
                    case 'lastYear': {
                        startDate = new Date(today.getFullYear() - 1, 0, 1);
                        endDate = new Date(today.getFullYear(), 0, 1);
                        break;
                    }
                    default:
                        break;
                }

                if (startDate) {
                    params.set('startDate', startDate.toISOString().split('T')[0]);
                }
                if (endDate) {
                    params.set('endDate', endDate.toISOString().split('T')[0]);
                }
            }

            if (paymentFilter) {
                params.set('paymentStatus', paymentFilter);
            }

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/invoice/export?${params}`,
                { credentials: 'include' }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to export invoices');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `invoices_export_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast.success('Invoices exported successfully!');

        } catch (error) {
            console.error("Error exporting invoices:", error);
            toast.error(error.message || 'Failed to export invoices');
        } finally {
            setIsExportingAll(false);
        }
    };

    // ============================================
    // HELPERS
    // ============================================
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const getStatusClass = (status) => {
        if (status === 'Active') return 'inv-status-active';
        if (status === 'Cancelled') return 'inv-status-cancelled';
        return 'inv-status-default';
    };

    const filteredInvoices = allInvoices;

    // ============================================
    // CUSTOM SELECT STYLES
    // ============================================
    const customSelectStyles = {
        control: (provided, state) => ({
            ...provided,
            border: '1.5px solid #e3e8f0',
            borderRadius: '8px',
            padding: '2px 4px',
            fontFamily: "'Open Sans', sans-serif",
            fontSize: '14px',
            minHeight: '42px',
            boxShadow: state.isFocused ? '0 0 0 3px rgba(106, 106, 197, 0.12)' : 'none',
            borderColor: state.isFocused ? '#6a6ac5' : '#e3e8f0',
            '&:hover': {
                borderColor: '#6a6ac5'
            },
            backgroundColor: '#fafbfc',
            cursor: 'text'
        }),
        placeholder: (provided) => ({
            ...provided,
            color: '#bfc5ce',
            fontSize: '14px'
        }),
        option: (provided, state) => ({
            ...provided,
            backgroundColor: state.isSelected ? '#3f3f91' : state.isFocused ? '#f0f0fb' : 'white',
            color: state.isSelected ? 'white' : '#333',
            fontFamily: "'Open Sans', sans-serif",
            fontSize: '13.5px',
            padding: '10px 14px',
            cursor: 'pointer',
            '&:hover': {
                backgroundColor: state.isSelected ? '#3f3f91' : '#f0f0fb'
            }
        }),
        menu: (provided) => ({
            ...provided,
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
            zIndex: 100,
            marginTop: '4px'
        }),
        menuList: (provided) => ({
            ...provided,
            maxHeight: '200px',
            padding: '4px 0'
        }),
        dropdownIndicator: (provided) => ({
            ...provided,
            color: '#aab0bc',
            '&:hover': {
                color: '#3f3f91'
            }
        }),
        clearIndicator: (provided) => ({
            ...provided,
            color: '#aab0bc',
            '&:hover': {
                color: '#dc3545'
            }
        }),
        input: (provided) => ({
            ...provided,
            fontFamily: "'Open Sans', sans-serif",
            fontSize: '14px',
            color: '#333',
            margin: '0'
        }),
        singleValue: (provided) => ({
            ...provided,
            color: '#333',
            fontFamily: "'Open Sans', sans-serif",
            fontSize: '14px'
        }),
        noOptionsMessage: (provided) => ({
            ...provided,
            fontFamily: "'Open Sans', sans-serif",
            fontSize: '13px',
            color: '#aab0bc',
            padding: '12px 14px'
        })
    };

    // ============================================
    // OPTION FORMATTERS
    // ============================================
    const customerOptions = customers.map(c => ({
        value: c.customerId,
        label: `${c.customerName} - ${c.contactNumber}`,
        data: c
    }));

    const packageOptions = packages.map(p => ({
        value: p.packageId,
        label: `${p.packageName} - ₹${p.pricing}`,
        data: p
    }));

    const xpOilOptions = xpOils.map(o => ({
        value: o.xpId,
        label: `${o.productName} (${o.quantity} KG)`,
        data: o
    }));

    const dispenserOptions = dispenserOils.map(o => {
        return {
            value: o.xpId,
            label: `${o.productName} ${o.sellingPrice3ml > 0 ? `(3ml: ₹${o.sellingPrice3ml})` : ''} ${o.sellingPrice6ml > 0 ? `(6ml: ₹${o.sellingPrice6ml})` : ''}`,
            data: o
        };
    });

    const promoOptions = promoCodes.map(p => ({
        value: p.promoId,
        label: `${p.code} - ${p.discount}%`,
        data: p,
        code: p.code,
        discount: p.discount
    }));

    const workshopOptions = workshops.map(w => ({
        value: w.workshopId,
        label: `${new Date(w.date).toLocaleDateString()} - ${w.startTime}`,
        data: w
    }));

    // ============================================
    // RENDER
    // ============================================
    return (
        <Navbar>
            <ToastContainer position="top-center" autoClose={3000} />
            <div className="inv-main">

                {/* Page Header */}
                <div className="inv-page-header">
                    <h2>
                        {isEditing ? "Edit Invoice" : activeView === "create" ? "Create Invoice" : "All Invoices"}
                        {isEditing && editingInvoiceId && (
                            <span className="inv-editing-badge">
                                <FaEdit /> Editing
                            </span>
                        )}
                    </h2>
                    <div className="inv-right-section">
                        <div className="inv-view-toggle">
                            <button
                                className={`inv-toggle-btn ${activeView === "create" ? "inv-toggle-active" : ""}`}
                                onClick={handleSwitchToCreateView}
                            >
                                <FaPlusCircle /> {isEditing ? "Edit Invoice" : "Create Invoice"}
                            </button>
                            <button
                                className={`inv-toggle-btn ${activeView === "list" ? "inv-toggle-active" : ""}`}
                                onClick={handleSwitchToListView}
                            >
                                <FaList /> View Invoices
                            </button>
                        </div>
                    </div>
                </div>

                {/* ============================================ */}
                {/* CREATE/EDIT INVOICE VIEW */}
                {/* ============================================ */}
                {activeView === "create" && (
                    <div className="inv-form-container">

                        {/* SECTION 1: SELECT CUSTOMER */}
                        <div className="inv-section">
                            <h3 className="inv-section-title">
                                <FaUser /> Select Customer
                            </h3>
                            <div className="inv-form-row">
                                <div className="inv-form-field">
                                    <label>Search &amp; Select Customer</label>
                                    <Select
                                        options={customerOptions}
                                        value={selectedCustomer}
                                        onChange={setSelectedCustomer}
                                        placeholder="🔍 Type to search customers... (or fill below to add new)"
                                        isClearable
                                        styles={customSelectStyles}
                                        noOptionsMessage={() => "No customers found — fill details below to add new"}
                                        isDisabled={isEditing}
                                    />
                                    {isEditing && selectedCustomer && (
                                        <small className="inv-hint">Customer cannot be changed in edit mode</small>
                                    )}
                                    {!isEditing && !selectedCustomer && (
                                        <small className="inv-hint inv-warning-hint">
                                            No customer selected — fill the fields below to create a new customer
                                        </small>
                                    )}
                                    {!isEditing && selectedCustomer && (
                                        <small className="inv-hint">
                                            Existing customer selected — fields below are read-only
                                        </small>
                                    )}
                                </div>
                            </div>

                            <div className="inv-form-row">
                                <div className="inv-form-field">
                                    <label>Customer Name *</label>
                                    <input
                                        type="text"
                                        value={newCustomerName}
                                        onChange={(e) => setNewCustomerName(e.target.value)}
                                        placeholder="Enter customer name"
                                        autoComplete="off"
                                        disabled={!!selectedCustomer || isEditing}
                                    />
                                </div>
                                <div className="inv-form-field">
                                    <label>Email (Optional)</label>
                                    <input
                                        type="email"
                                        value={newCustomerEmail}
                                        onChange={(e) => setNewCustomerEmail(e.target.value)}
                                        placeholder="Enter email"
                                        autoComplete="off"
                                        disabled={!!selectedCustomer || isEditing}
                                    />
                                </div>
                                <div className="inv-form-field">
                                    <label>Phone Number *</label>
                                    <input
                                        type="tel"
                                        value={newCustomerContact}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                            setNewCustomerContact(val);
                                        }}
                                        placeholder="10-digit mobile number"
                                        autoComplete="off"
                                        disabled={!!selectedCustomer || isEditing}
                                        maxLength={10}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* SECTION 2: WORKSHOP & PACKAGES */}
                        <div className="inv-section inv-workshop-section">
                            <div className="inv-section-header-with-actions">
                                <h3 className="inv-section-title">
                                    <FaBoxOpen /> Workshop &amp; Packages
                                </h3>
                                <div className="inv-section-actions">
                                    <button
                                        className={`inv-package-mode-btn ${packageMode ? 'inv-package-active' : ''}`}
                                        onClick={handlePackageModeToggle}
                                        type="button"
                                        disabled={isEditing}
                                        title={packageMode ? "Switch to Workshop Mode" : "Switch to Package Mode"}
                                    >
                                        {packageMode ? <FaToggleOn /> : <FaToggleOff />}
                                        {packageMode ? "Package Mode ON" : "Workshop Mode"}
                                    </button>
                                    <button
                                        className="inv-add-close-btn"
                                        onClick={handleAddAndCloseWorkshop}
                                        type="button"
                                    >
                                        <FaWindowClose /> Clear
                                    </button>
                                </div>
                            </div>

                            {/* Workshop Select */}
                            {!packageMode && selectedCustomer && (
                                <div className="inv-form-row">
                                    <div className="inv-form-field">
                                        <label>Select Workshop</label>
                                        <Select
                                            options={workshopOptions}
                                            value={selectedWorkshop}
                                            onChange={handleWorkshopChange}
                                            placeholder={workshops.length === 0 ? "No workshops found" : "Workshop auto-selected"}
                                            isClearable
                                            styles={customSelectStyles}
                                            noOptionsMessage={() => "No workshops found"}
                                            isDisabled={true}
                                        />
                                        {selectedWorkshop && (
                                            <small className="inv-hint">
                                                Workshop auto-selected: {selectedWorkshop.label}
                                            </small>
                                        )}
                                        {workshops.length === 0 && (
                                            <small className="inv-hint inv-warning-hint">
                                                ⚠️ No workshops found. Switch to "Package Mode" to manually select packages.
                                            </small>
                                        )}
                                    </div>
                                </div>
                            )}

                            {packageMode && (
                                <div className="inv-package-mode-info">
                                    <small className="inv-hint inv-package-hint">
                                        📦 Package Mode: Manual selection enabled
                                    </small>
                                </div>
                            )}

                            {/* ✅ PACKAGES LIST */}
                            {packageItems.length > 0 && (
                                <div className="inv-packages-list">
                                    {packageItems.map((block, pkgIdx) => (
                                        <div className="inv-package-block" key={block.tempId}>

                                            <div className="inv-package-block-header">
                                                <h4 className="inv-section-subtitle">
                                                    <FaBoxOpen /> Package {pkgIdx + 1}
                                                    {block.lineId && <span className="inv-lineid-badge" title="Existing package (kept as-is)">Saved</span>}
                                                </h4>
                                                <button
                                                    className="inv-remove-btn"
                                                    onClick={() => handleRemovePackageBlock(block.tempId)}
                                                    type="button"
                                                    title="Remove package"
                                                >
                                                    <FaTrash /> Remove
                                                </button>
                                            </div>

                                            {/* Package select + qty */}
                                            <div className="inv-form-row">
                                                <div className="inv-form-field">
                                                    <label>Select Package *</label>
                                                    <Select
                                                        options={packageOptions}
                                                        value={block.packageSelect}
                                                        onChange={(sel) => handleUpdatePackageSelect(block.tempId, sel)}
                                                        placeholder="Select a package"
                                                        isClearable
                                                        styles={customSelectStyles}
                                                        noOptionsMessage={() => "No active packages found"}
                                                    />
                                                    {block.packageSelect && (
                                                        <small className="inv-hint">
                                                            ML: {block.packageSelect.data?.bottleML}ml |
                                                            Fragrance: {block.packageSelect.data?.fragranceQty}g |
                                                            Fragrance Base: {block.packageSelect.data?.alcoholQty}ml
                                                        </small>
                                                    )}
                                                </div>
                                                <div className="inv-form-field inv-form-field-narrow">
                                                    <label>Quantity *</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={block.quantity}
                                                        onChange={(e) => handleUpdatePackageQuantity(block.tempId, e.target.value)}
                                                        autoComplete="off"
                                                    />
                                                </div>
                                                <div className="inv-form-field inv-form-field-narrow">
                                                    <label><FaPercentage /> Discount (%)</label>
                                                    <div className="inv-discount-input-group">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            step="0.01"
                                                            value={block.discount}
                                                            onChange={(e) => handleUpdatePackageDiscount(block.tempId, e.target.value)}
                                                            className="inv-discount-input-full"
                                                        />
                                                        <span className="inv-discount-percent-label">%</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* XP oils sub-section for this block */}
                                            {block.packageSelect && (
                                                <div className="inv-section inv-xp-oil-section">
                                                    <div className="inv-section-header-with-actions">
                                                        <h4 className="inv-section-subtitle">
                                                            <FaOilCan /> XP Oils for Fragrance
                                                        </h4>
                                                        <div className="inv-section-actions">
                                                            <button
                                                                className="inv-add-close-btn inv-close-xp-btn"
                                                                onClick={() => {
                                                                    setPackageItems(prev => prev.map(b => {
                                                                        if (b.tempId !== block.tempId) return b;
                                                                        return { ...b, xpOilItems: [], xpOilSelect: null, xpOilML: "" };
                                                                    }));
                                                                    toast.info("XP Oils cleared");
                                                                }}
                                                                type="button"
                                                            >
                                                                <FaWindowClose /> Clear All
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="inv-form-row inv-form-row-xp">
                                                        <div className="inv-form-field">
                                                            <label>Select XP Oil</label>
                                                            <Select
                                                                options={xpOilOptions}
                                                                value={block.xpOilSelect}
                                                                onChange={(sel) => handleUpdatePackageXPOilSelect(block.tempId, sel)}
                                                                placeholder="Select XP oil..."
                                                                isClearable
                                                                styles={customSelectStyles}
                                                                noOptionsMessage={() => "No XP oils available"}
                                                            />
                                                        </div>
                                                        <div className="inv-form-field inv-form-field-narrow">
                                                            <label>ML *</label>
                                                            <input
                                                                type="number"
                                                                step="0.1"
                                                                min="0.1"
                                                                value={block.xpOilML}
                                                                onChange={(e) => handleUpdatePackageXPOilML(block.tempId, e.target.value)}
                                                                placeholder="Enter ml"
                                                                autoComplete="off"
                                                            />
                                                        </div>
                                                        <div className="inv-add-btn-wrap">
                                                            <button
                                                                className="inv-add-xp-btn"
                                                                onClick={() => handleAddXPOilToPackage(block.tempId)}
                                                                type="button"
                                                            >
                                                                <FaPlus /> Add
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {block.xpOilItems.length > 0 && (
                                                        <div className="inv-xp-list">
                                                            <h5>Added XP Oils</h5>
                                                            <div className="inv-xp-table-wrap">
                                                                <table className="inv-xp-table">
                                                                    <thead>
                                                                        <tr>
                                                                            <th>XP Oil</th>
                                                                            <th>ML</th>
                                                                            <th>Density</th>
                                                                            <th>Action</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {block.xpOilItems.map((item, xpIdx) => (
                                                                            <tr key={xpIdx}>
                                                                                <td>{item.productName}</td>
                                                                                <td>
                                                                                    <input
                                                                                        type="number"
                                                                                        step="0.1"
                                                                                        min="0.1"
                                                                                        value={item.ml}
                                                                                        onChange={(e) => handleUpdateXPOilMLInPackage(block.tempId, xpIdx, e.target.value)}
                                                                                        className="inv-edit-input inv-edit-input-small"
                                                                                    />
                                                                                </td>
                                                                                <td>{item.density || 1000}</td>
                                                                                <td>
                                                                                    <button
                                                                                        className="inv-remove-btn"
                                                                                        onClick={() => handleRemoveXPOilFromPackage(block.tempId, xpIdx)}
                                                                                        type="button"
                                                                                    >
                                                                                        <FaTrash />
                                                                                    </button>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                        <tr className="inv-xp-table-total">
                                                                            <td><strong>Total</strong></td>
                                                                            <td><strong>{block.xpOilItems.reduce((sum, item) => sum + (item.ml || 0), 0).toFixed(2)}ml</strong></td>
                                                                            <td></td>
                                                                            <td></td>
                                                                        </tr>
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="inv-form-row inv-fragrance-base-row">
                                                        <div className="inv-form-field">
                                                            <label><FaPercentage /> Fragrance Base (ml) *</label>
                                                            <input
                                                                type="number"
                                                                min="0.1"
                                                                step="0.1"
                                                                value={block.fragranceBaseML}
                                                                onChange={(e) => handleUpdatePackageFragranceBase(block.tempId, e.target.value)}
                                                                placeholder="Enter Fragrance Base ML"
                                                                autoComplete="off"
                                                            />
                                                            <small className="inv-hint">
                                                                Default from package: {block.packageSelect.data?.alcoholQty || 0}ml. You can change it.
                                                            </small>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add Package Button */}
                            <div className="inv-form-row">
                                <button
                                    className="inv-add-package-btn"
                                    onClick={handleAddPackageBlock}
                                    type="button"
                                >
                                    <FaPlus /> Add {packageItems.length === 0 ? 'Package' : 'Another Package'}
                                </button>
                            </div>

                        </div>

                        {/* SECTION 3: DISPENSER ITEMS */}
                        <div className="inv-section inv-dispenser-section">
                            <div className="inv-section-header-with-actions">
                                <h3 className="inv-section-title">
                                    <FaFlask /> Dispenser Items
                                </h3>
                                <div className="inv-section-actions">
                                    <button
                                        className="inv-add-close-btn inv-close-dispenser-btn"
                                        onClick={handleCloseDispenser}
                                        type="button"
                                    >
                                        <FaWindowClose /> Clear All
                                    </button>
                                </div>
                            </div>

                            <div className="inv-form-row inv-form-row-dispenser">
                                <div className="inv-form-field">
                                    <label>Select Oil</label>
                                    <Select
                                        options={dispenserOptions}
                                        value={dispenserSelect}
                                        onChange={setDispenserSelect}
                                        placeholder="Select oil..."
                                        isClearable
                                        styles={customSelectStyles}
                                        noOptionsMessage={() => "No oils available"}
                                    />
                                </div>
                                <div className="inv-form-field inv-form-field-narrow">
                                    <label>ML *</label>
                                    <select
                                        value={dispenserML}
                                        onChange={(e) => setDispenserML(e.target.value)}
                                        className="inv-form-select"
                                    >
                                        <option value="">Select ML</option>
                                        <option value="3">3 ml</option>
                                        <option value="6">6 ml</option>
                                    </select>
                                </div>
                                <div className="inv-form-field inv-form-field-narrow">
                                    <label>Quantity *</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={dispenserQty}
                                        onChange={(e) => setDispenserQty(e.target.value)}
                                        placeholder="Enter quantity"
                                        autoComplete="off"
                                    />
                                </div>
                                <div className="inv-add-btn-wrap">
                                    <button
                                        className="inv-add-dispenser-btn"
                                        onClick={handleAddDispenser}
                                        type="button"
                                    >
                                        <FaPlus /> Add
                                    </button>
                                </div>
                            </div>

                            {dispenserItems.length > 0 && (
                                <div className="inv-dispenser-list">
                                    <h4>Added Items</h4>
                                    <div className="inv-dispenser-table-wrap">
                                        <table className="inv-dispenser-table">
                                            <thead>
                                                <tr>
                                                    <th>Product</th>
                                                    <th>ML</th>
                                                    <th>Qty</th>
                                                    <th>Unit Price (₹)</th>
                                                    <th>Discount %</th>
                                                    <th>Total Price (₹)</th>
                                                    <th>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {dispenserItems.map((item, index) => {
                                                    const price = item.ml === 3 ? item.sellingPrice3ml : item.sellingPrice6ml;
                                                    const unitPrice = item.unitPrice || price;
                                                    const discountAmt = (unitPrice * (item.discount || 0)) / 100;
                                                    const finalUnitPrice = unitPrice - discountAmt;
                                                    const totalPrice = finalUnitPrice * item.quantity;

                                                    return (
                                                        <tr key={index}>
                                                            <td>{item.productName}</td>
                                                            <td>{item.ml}ml</td>
                                                            <td>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    value={item.quantity}
                                                                    onChange={(e) => handleUpdateDispenserQuantity(index, e.target.value)}
                                                                    className="inv-edit-input"
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    value={unitPrice}
                                                                    onChange={(e) => handleUpdateDispenserUnitPrice(index, e.target.value)}
                                                                    className="inv-edit-input inv-unit-price-input"
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="100"
                                                                    step="0.01"
                                                                    value={item.discount || 0}
                                                                    onChange={(e) => handleUpdateDispenserDiscount(index, e.target.value)}
                                                                    className="inv-discount-input"
                                                                />
                                                                <span className="inv-discount-percent">%</span>
                                                            </td>
                                                            <td className="inv-final-price-cell">
                                                                ₹{totalPrice.toFixed(2)}
                                                                {item.discount > 0 && (
                                                                    <span className="inv-original-price-small">
                                                                        (₹{(unitPrice * item.quantity).toFixed(2)})
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td>
                                                                <button
                                                                    className="inv-remove-btn"
                                                                    onClick={() => handleRemoveDispenser(index)}
                                                                    type="button"
                                                                >
                                                                    <FaTrash />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* SECTION 4: PROMO CODE & PAYMENT */}
                        <div className="inv-section">
                            <h3 className="inv-section-title">
                                <FaTag /> Promo Code &amp; Payment
                            </h3>

                            <div className="inv-form-row">
                                <div className="inv-form-field">
                                    <label>Promo Code</label>
                                    <Select
                                        options={promoOptions}
                                        value={selectedPromo}
                                        onChange={setSelectedPromo}
                                        placeholder="Select promo code"
                                        isClearable
                                        styles={customSelectStyles}
                                        noOptionsMessage={() => "No active promo codes available"}
                                    />
                                    {selectedPromo && (
                                        <small className="inv-hint inv-promo-hint">
                                            {selectedPromo.code} - {selectedPromo.discount}% discount applied
                                        </small>
                                    )}
                                </div>
                                <div className="inv-form-field">
                                    <label>Payment Method *</label>
                                    <select
                                        value={paymentStatus}
                                        onChange={(e) => setPaymentStatus(e.target.value)}
                                        className="inv-form-select"
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="UPI">UPI</option>
                                        <option value="Card">Card</option>
                                    </select>
                                </div>
                            </div>

                            <div className="inv-form-row">
                                <div className="inv-form-field">
                                    <label>Invoice Date</label>
                                    <input
                                        type="date"
                                        value={invoiceDate}
                                        onChange={(e) => setInvoiceDate(e.target.value)}
                                    />
                                </div>
                                <div className="inv-form-field">
                                    <label>Notes</label>
                                    <input
                                        type="text"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Add notes..."
                                        autoComplete="off"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* SECTION 5: LOYALTY COINS */}
                        {selectedCustomer && !isEditing && usableLoyaltyCoins > 0 && (
                            <div className="inv-section inv-loyalty-section">
                                <h3 className="inv-section-title">
                                    <FaCoins /> Loyalty Coins
                                </h3>
                                <div className="inv-loyalty-container">
                                    <div className="inv-loyalty-info">
                                        <div className="inv-loyalty-available">
                                            <span>Available Coins:</span>
                                            <strong>{availableLoyaltyCoins}</strong>
                                        </div>
                                        <div className="inv-loyalty-usable">
                                            <span>Usable Coins:</span>
                                            <strong>{usableLoyaltyCoins} (1 Coin = ₹1)</strong>
                                        </div>
                                        <div className="inv-loyalty-earned-preview">
                                            <span>Will Earn:</span>
                                            <strong className="inv-loyalty-earned-value">+{loyaltyCoinsEarned} coins</strong>
                                        </div>
                                    </div>
                                    <label className="inv-loyalty-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={useLoyaltyCoins}
                                            onChange={(e) => setUseLoyaltyCoins(e.target.checked)}
                                        />
                                        <span>Use Loyalty Coins (Maximum: {usableLoyaltyCoins} coins)</span>
                                    </label>
                                    {useLoyaltyCoins && loyaltyCoinsUsed > 0 && (
                                        <div className="inv-loyalty-used-info">
                                            <span>Using: <strong>{loyaltyCoinsUsed}</strong> coins (₹{loyaltyDiscountAmount.toFixed(2)} discount)</span>
                                        </div>
                                    )}
                                    {!useLoyaltyCoins && (
                                        <div className="inv-loyalty-hint">
                                            <small>Check to use loyalty coins. Minimum 50 coins must remain in account.</small>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {selectedCustomer && !isEditing && availableLoyaltyCoins > 0 && usableLoyaltyCoins === 0 && (
                            <div className="inv-section inv-loyalty-section">
                                <h3 className="inv-section-title">
                                    <FaCoins /> Loyalty Coins
                                </h3>
                                <div className="inv-loyalty-container">
                                    <div className="inv-loyalty-info">
                                        <div className="inv-loyalty-available">
                                            <span>Available Coins:</span>
                                            <strong>{availableLoyaltyCoins}</strong>
                                        </div>
                                        <div className="inv-loyalty-usable">
                                            <span>Usable Coins:</span>
                                            <strong>0</strong>
                                        </div>
                                        <div className="inv-loyalty-earned-preview">
                                            <span>Will Earn:</span>
                                            <strong className="inv-loyalty-earned-value">+{loyaltyCoinsEarned} coins</strong>
                                        </div>
                                    </div>
                                    <div className="inv-loyalty-message">
                                        <small>Minimum 50 coins required to use loyalty rewards. Need {50 - availableLoyaltyCoins} more coins.</small>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedCustomer && !isEditing && availableLoyaltyCoins === 0 && (
                            <div className="inv-section inv-loyalty-section">
                                <h3 className="inv-section-title">
                                    <FaCoins /> Loyalty Coins
                                </h3>
                                <div className="inv-loyalty-container">
                                    <div className="inv-loyalty-info">
                                        <div className="inv-loyalty-available">
                                            <span>Available Coins:</span>
                                            <strong>0</strong>
                                        </div>
                                        <div className="inv-loyalty-earned-preview">
                                            <span>Will Earn:</span>
                                            <strong className="inv-loyalty-earned-value">+{loyaltyCoinsEarned} coins</strong>
                                        </div>
                                    </div>
                                    <div className="inv-loyalty-message">
                                        <small>No loyalty coins available. Earn coins by making purchases!</small>
                                    </div>
                                </div>
                            </div>
                        )}

                        {isEditing && selectedCustomer && (
                            <div className="inv-section inv-loyalty-section">
                                <h3 className="inv-section-title">
                                    <FaCoins /> Loyalty Coins
                                </h3>
                                <div className="inv-loyalty-container">
                                    <div className="inv-loyalty-info">
                                        <div className="inv-loyalty-available">
                                            <span>Available Coins:</span>
                                            <strong>{availableLoyaltyCoins}</strong>
                                        </div>
                                        <div className="inv-loyalty-earned-preview">
                                            <span>Will Earn:</span>
                                            <strong className="inv-loyalty-earned-value">+{loyaltyCoinsEarned} coins</strong>
                                        </div>
                                    </div>
                                    <div className="inv-loyalty-edit-mode-message">
                                        <small>⛔ Loyalty coins cannot be changed in edit mode. Coins will be recalculated automatically.</small>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SECTION 6: SUMMARY & CALCULATION */}
                        <div className="inv-section inv-summary-section">
                            <h3 className="inv-section-title">
                                <FaMoneyBillWave /> Summary &amp; Calculation
                            </h3>

                            <div className="inv-summary-grid">
                                <div className="inv-summary-item">
                                    <span>Packages Original Total</span>
                                    <span className="inv-summary-value">₹{packageOriginalTotal.toFixed(2)}</span>
                                </div>
                                {packageDiscountTotal > 0 && (
                                    <div className="inv-summary-item inv-summary-detail inv-summary-discount">
                                        <span>Packages Discount</span>
                                        <span className="inv-summary-value inv-discount-amount">
                                            -₹{packageDiscountTotal.toFixed(2)}
                                        </span>
                                    </div>
                                )}
                                <div className="inv-summary-item">
                                    <span>Packages Final Total</span>
                                    <span className="inv-summary-value inv-final-price">
                                        ₹{packageFinalTotal.toFixed(2)}
                                    </span>
                                </div>

                                <div className="inv-summary-item">
                                    <span>Dispenser Original</span>
                                    <span className="inv-summary-value">₹{dispenserOriginalTotal.toFixed(2)}</span>
                                </div>
                                {dispenserDiscountTotal > 0 && (
                                    <div className="inv-summary-item inv-summary-detail inv-summary-discount">
                                        <span>Dispenser Discount</span>
                                        <span className="inv-summary-value inv-discount-amount">
                                            -₹{dispenserDiscountTotal.toFixed(2)}
                                        </span>
                                    </div>
                                )}
                                <div className="inv-summary-item">
                                    <span>Dispenser Final</span>
                                    <span className="inv-summary-value inv-final-price">
                                        ₹{dispenserFinalTotal.toFixed(2)}
                                    </span>
                                </div>

                                <div className="inv-summary-item inv-summary-total">
                                    <span>Subtotal (incl. GST)</span>
                                    <span className="inv-summary-value">₹{subtotal.toFixed(2)}</span>
                                </div>
                                {totalDiscount > 0 && (
                                    <div className="inv-summary-item inv-summary-detail inv-summary-discount">
                                        <span>Total Discount</span>
                                        <span className="inv-summary-value inv-discount-amount">
                                            -₹{totalDiscount.toFixed(2)}
                                        </span>
                                    </div>
                                )}
                                <div className="inv-summary-item inv-summary-detail">
                                    <span>GST ({GST_RATE}%)</span>
                                    <span className="inv-summary-value">₹{gstAmount.toFixed(2)}</span>
                                </div>
                                {selectedPromo && (
                                    <div className="inv-summary-item inv-summary-detail inv-summary-promo">
                                        <span>Promo Discount ({selectedPromo.discount}%)</span>
                                        <span className="inv-summary-value inv-discount-amount">
                                            -₹{promoDiscount.toFixed(2)}
                                        </span>
                                    </div>
                                )}
                                {loyaltyDiscountAmount > 0 && (
                                    <div className="inv-summary-item inv-summary-detail inv-summary-loyalty">
                                        <span>Loyalty Discount ({loyaltyCoinsUsed} coins)</span>
                                        <span className="inv-summary-value inv-discount-amount">
                                            -₹{loyaltyDiscountAmount.toFixed(2)}
                                        </span>
                                    </div>
                                )}
                                {loyaltyCoinsEarned > 0 && (
                                    <div className="inv-summary-item inv-summary-detail inv-summary-earned">
                                        <span>🪙 Loyalty Coins Earned</span>
                                        <span className="inv-summary-value inv-loyalty-earned">
                                            +{loyaltyCoinsEarned} coins
                                        </span>
                                    </div>
                                )}
                                <div className="inv-summary-item inv-summary-grand-total">
                                    <span>Grand Total</span>
                                    <span className="inv-summary-value">₹{grandTotal.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* ACTION BUTTONS */}
                        <div className="inv-form-actions">
                            <button
                                className="inv-cancel-btn"
                                onClick={() => {
                                    if (isEditing) {
                                        showConfirmationModal({
                                            title: "Cancel Editing?",
                                            message: "You have unsaved changes. Are you sure you want to cancel editing?",
                                            confirmText: "Yes, Cancel",
                                            cancelText: "Keep Editing",
                                            type: "warning",
                                            onConfirm: resetForm
                                        });
                                    } else {
                                        navigate('/');
                                    }
                                }}
                                type="button"
                            >
                                {isEditing ? 'Cancel Edit' : 'Cancel'}
                            </button>
                            <button
                                className={isEditing ? "inv-update-btn" : "inv-submit-btn"}
                                onClick={isEditing ? handleUpdateInvoice : handleCreateInvoice}
                                disabled={
                                    isSubmitting ||
                                    isUpdating ||
                                    (!selectedCustomer && !newCustomerName.trim()) ||
                                    (!selectedCustomer && !newCustomerContact.trim())
                                }
                                type="button"
                            >
                                {isEditing ? (
                                    isUpdating ? (
                                        <>
                                            <div className="inv-loading-spinner small"></div>
                                            Updating...
                                        </>
                                    ) : (
                                        <>
                                            <FaSave /> Update Invoice
                                        </>
                                    )
                                ) : (
                                    isSubmitting ? (
                                        <>
                                            <div className="inv-loading-spinner small"></div>
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            <FaSave /> Create Invoice
                                        </>
                                    )
                                )}
                            </button>
                        </div>

                    </div>
                )}

                {/* ============================================ */}
                {/* VIEW INVOICES */}
                {/* ============================================ */}
                {activeView === "list" && (
                    <div className="inv-list-container">
                        <div className="inv-list-filter-bar">
                            <div className="inv-list-search">
                                <FaSearch className="inv-list-search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search by invoice, customer or phone..."
                                    value={invoiceSearchTerm}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    autoComplete="off"
                                />
                            </div>

                            <select
                                className="inv-filter-time"
                                value={timeFilter}
                                onChange={(e) => setTimeFilter(e.target.value)}
                            >
                                <option value="all">📅 All Time</option>
                                <option value="today">📆 Today</option>
                                <option value="yesterday">📆 Yesterday</option>
                                <option value="thisWeek">📆 This Week</option>
                                <option value="thisMonth">📆 This Month</option>
                                <option value="thisYear">📆 This Year</option>
                                <option value="lastYear">📆 Last Year</option>
                            </select>

                            <select
                                className="inv-filter-payment"
                                value={paymentFilter}
                                onChange={(e) => setPaymentFilter(e.target.value)}
                            >
                                <option value="">💳 All Payments</option>
                                <option value="Cash">Cash</option>
                                <option value="UPI">UPI</option>
                                <option value="Card">Card</option>
                            </select>

                            <button
                                className="inv-export-btn"
                                onClick={handleExportAll}
                                disabled={isExportingAll || allInvoices.length === 0}
                                title="Export filtered invoices to Excel"
                            >
                                <FaDownload /> {isExportingAll ? "Exporting..." : "Export"}
                            </button>

                            {!isLoadingInvoices && (
                                <span className="inv-list-result-count">{allInvoices.length} invoices</span>
                            )}
                        </div>

                        {isLoadingInvoices ? (
                            <div className="inv-list-loading">
                                <div className="inv-loading-spinner-dark large"></div>
                                <p>Loading invoices...</p>
                            </div>
                        ) : allInvoices.length === 0 ? (
                            <div className="inv-list-empty">
                                <FaFileInvoice className="inv-list-empty-icon" />
                                <p>No invoices found</p>
                            </div>
                        ) : (
                            <div className="inv-list-table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Invoice #</th>
                                            <th>Customer</th>
                                            <th>Date</th>
                                            <th>Payment</th>
                                            <th>Total</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allInvoices.map((inv) => (
                                            <tr key={inv.invoiceId}>
                                                <td className="inv-list-number-cell">{inv.invoiceNumber}</td>
                                                <td>
                                                    <div className="inv-list-customer-name">{inv.customer?.customerName}</div>
                                                    <div className="inv-list-customer-phone">{inv.customer?.contactNumber}</div>
                                                </td>
                                                <td className="inv-list-date-cell">{formatDate(inv.invoiceDate)}</td>
                                                <td>
                                                    <span className="inv-payment-pill">{inv.paymentStatus}</span>
                                                </td>
                                                <td className="inv-list-total-cell">₹{inv.grandTotal?.toFixed(2)}</td>
                                                <td>
                                                    <div className="inv-list-actions">
                                                        <button
                                                            className="inv-list-view-btn"
                                                            onClick={() => handleViewInvoice(inv.invoiceId)}
                                                            title="View Details"
                                                        >
                                                            <FaEye />
                                                        </button>
                                                        <button
                                                            className="inv-list-pdf-btn"
                                                            onClick={() => generatePDF(inv)}
                                                            title="Download PDF"
                                                            disabled={exportingInvoices[inv.invoiceId || inv.invoiceNumber]}
                                                        >
                                                            {exportingInvoices[inv.invoiceId || inv.invoiceNumber] ? (
                                                                <div className="inv-loading-spinner-small"></div>
                                                            ) : (
                                                                <FaFilePdf />
                                                            )}
                                                        </button>
                                                        <button
                                                            className="inv-list-edit-btn"
                                                            onClick={() => handleEditInvoice(inv.invoiceId)}
                                                            title="Edit Invoice"
                                                        >
                                                            <FaEdit />
                                                        </button>
                                                        <button
                                                            className="inv-list-delete-btn"
                                                            onClick={() => handleDeleteClick(inv)}
                                                            title="Delete Invoice"
                                                        >
                                                            <FaTrash />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Invoice Details Modal */}
                <InvoiceDetailsModal
                    show={showInvoiceDetailsModal}
                    onClose={() => {
                        setShowInvoiceDetailsModal(false);
                        setViewingInvoice(null);
                    }}
                    invoice={viewingInvoice}
                    isLoading={isLoadingInvoiceDetails}
                    formatDate={formatDate}
                    getStatusClass={getStatusClass}
                    onGeneratePDF={(invoice) => {
                        setInvoiceForPrint(invoice);
                        setTimeout(() => generatePDF(invoice), 300);
                    }}
                    onWhatsApp={handleWhatsApp}
                    isExporting={viewingInvoice ? exportingInvoices[viewingInvoice.invoiceId || viewingInvoice.invoiceNumber] : false}
                />

                {/* Delete Confirmation Modal */}
                <DeleteConfirmModal
                    show={showDeleteModal}
                    onClose={() => {
                        setShowDeleteModal(false);
                        setDeletingInvoice(null);
                    }}
                    onConfirm={handleDeleteInvoice}
                    invoice={deletingInvoice}
                    isDeleting={isDeleting}
                />

                {/* Custom Confirmation Modal */}
                <ConfirmationModal
                    show={showConfirmation}
                    onClose={() => {
                        if (!isConfirming) {
                            setShowConfirmation(false);
                        }
                    }}
                    onConfirm={handleConfirmation}
                    title={confirmationConfig.title}
                    message={confirmationConfig.message}
                    confirmText={confirmationConfig.confirmText}
                    cancelText={confirmationConfig.cancelText}
                    type={confirmationConfig.type}
                    isConfirming={isConfirming}
                />

                {/* Hidden Invoice Print Component */}
                <div style={{ position: "absolute", left: "-9999px", top: 0, visibility: "hidden" }}>
                    {invoiceForPrint && <InvoicePrint invoice={invoiceForPrint} />}
                </div>

            </div>
        </Navbar>
    );
};

export default Invoice;