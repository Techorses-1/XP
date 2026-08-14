import React, { useState, useEffect, useMemo, useRef } from "react";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { toast, ToastContainer } from "react-toastify";
import {
  FaUser, FaEnvelope, FaPhone, FaPlus,
  FaFileExport, FaFileExcel, FaSearch,
  FaEdit, FaSave, FaTrash, FaFileInvoice,
  FaEye, FaTimes, FaCalendarAlt, FaMoneyBillWave,
  FaBoxOpen, FaFlask, FaTag, FaCreditCard, FaList
} from "react-icons/fa";
import html2pdf from "html2pdf.js";
import * as XLSX from "xlsx";
import Navbar from "../../Components/Navbar/Navbar";
import "../Form/Form.scss";
import "./Customer.scss";
import "react-toastify/dist/ReactToastify.css";

// ============================================
// INVOICE DETAILS MODAL (Reused from Invoice page)
// ============================================
const InvoiceDetailsModal = ({
  show, onClose, invoice, isLoading, formatDate, getStatusClass
}) => {
  if (!show) return null;

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
              <div className="loading-spinner large"></div>
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

              {invoice.hasPackage && invoice.packageItem && (
                <div className="inv-details-section">
                  <h4><FaBoxOpen /> Package</h4>
                  <div className="inv-details-grid">
                    <div className="inv-details-item">
                      <span className="inv-details-label">Package</span>
                      <strong>{invoice.packageItem.packageName}</strong>
                    </div>
                    <div className="inv-details-item">
                      <span className="inv-details-label">Price</span>
                      <strong>₹{invoice.packageItem.pricing}</strong>
                    </div>
                    <div className="inv-details-item">
                      <span className="inv-details-label">Bottle Size</span>
                      <strong>{invoice.packageItem.bottleML}ml</strong>
                    </div>
                    <div className="inv-details-item">
                      <span className="inv-details-label">Oil Count</span>
                      <strong>{invoice.packageItem.oilCount}</strong>
                    </div>
                    <div className="inv-details-item">
                      <span className="inv-details-label">Fragrance Qty</span>
                      <strong>{invoice.packageItem.fragranceQty}g</strong>
                    </div>
                    <div className="inv-details-item">
                      <span className="inv-details-label">Fragrance Base Qty</span>
                      <strong>{invoice.packageItem.alcoholQty}ml</strong>
                    </div>
                    {invoice.packageItem.xpOil && (
                      <div className="inv-details-item">
                        <span className="inv-details-label">XP Oil Used</span>
                        <strong>{invoice.packageItem.xpOil.productName}</strong>
                      </div>
                    )}
                  </div>
                </div>
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
                          <th>Total ML</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.dispenserItems.map((item, idx) => (
                          <tr key={idx}>
                            <td>{item.productName}</td>
                            <td>{item.ml}ml</td>
                            <td>{item.quantity}</td>
                            <td>{item.totalML}ml</td>
                          </tr>
                        ))}
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
                    <span>GST ({invoice.gstRate}%)</span>
                    <strong>₹{invoice.gstAmount?.toFixed(2)}</strong>
                  </div>
                  {invoice.hasPromo && (
                    <div className="inv-details-totals-row inv-details-totals-sub inv-details-totals-promo">
                      <span>Promo Discount</span>
                      <strong>-₹{invoice.promoDiscount?.toFixed(2)}</strong>
                    </div>
                  )}
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
          <button className="inv-modal-btn-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// CUSTOMER INVOICES MODAL
// ============================================
const CustomerInvoicesModal = ({
  customer,
  onClose,
  onViewInvoice,
  formatDate,
  getStatusClass
}) => {
  const [invoices, setInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [summary, setSummary] = useState({
    totalInvoices: 0,
    totalSpent: 0,
    averageSpent: 0
  });

  const fetchInvoices = async (page = 1) => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/customer/${customer.customerId}/invoices?page=${page}&limit=10`,
        { credentials: 'include' }
      );

      if (!response.ok) throw new Error('Failed to fetch invoices');

      const data = await response.json();
      setInvoices(data.data.invoices || []);
      setPagination(data.data.pagination || {});
      setSummary(data.data.summary || {});
    } catch (error) {
      console.error("Error fetching customer invoices:", error);
      toast.error("Failed to fetch invoices");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices(1);
  }, [customer.customerId]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchInvoices(newPage);
    }
  };

  if (!customer) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <FaFileInvoice /> Invoices - {customer.customerName}
          </div>
          <button className="modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="modal-body">
          {/* Summary Cards */}
          <div className="inv-summary-cards">
            <div className="inv-summary-card">
              <span className="inv-summary-label">Total Invoices</span>
              <span className="inv-summary-number">{summary.totalInvoices}</span>
            </div>
            <div className="inv-summary-card">
              <span className="inv-summary-label">Total Spent</span>
              <span className="inv-summary-number">₹{summary.totalSpent?.toFixed(2)}</span>
            </div>
            <div className="inv-summary-card">
              <span className="inv-summary-label">Average</span>
              <span className="inv-summary-number">₹{summary.averageSpent?.toFixed(2)}</span>
            </div>
          </div>

          {isLoading ? (
            <div className="inv-list-loading">
              <div className="loading-spinner large"></div>
              <p>Loading invoices...</p>
            </div>
          ) : invoices.length === 0 ? (
            <div className="inv-list-empty">
              <FaFileInvoice className="inv-list-empty-icon" />
              <p>No invoices found for this customer</p>
            </div>
          ) : (
            <>
              <div className="inv-list-table-wrap">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Payment</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.invoiceId}>
                        <td className="inv-number-cell">{inv.invoiceNumber}</td>
                        <td>{formatDate(inv.invoiceDate)}</td>
                        <td className="inv-total-cell">₹{inv.grandTotal?.toFixed(2)}</td>
                        <td>
                          <span className="inv-payment-pill">{inv.paymentStatus}</span>
                        </td>
                        <td>
                          <span className={`inv-status-badge ${getStatusClass(inv.status)}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td>
                          <button
                            className="inv-view-btn"
                            onClick={() => onViewInvoice(inv.invoiceId)}
                          >
                            <FaEye /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="inv-pagination">
                  <button
                    className="inv-page-btn"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={!pagination.hasPrevPage}
                  >
                    Previous
                  </button>
                  <span className="inv-page-info">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    className="inv-page-btn"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={!pagination.hasNextPage}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN CUSTOMER COMPONENT
// ============================================
const Customer = () => {
  const [showForm, setShowForm] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(9);
  const [isLoading, setIsLoading] = useState(true);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [isBulkImportLoading, setIsBulkImportLoading] = useState(false);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);

  // Invoice modals state
  const [showInvoicesModal, setShowInvoicesModal] = useState(false);
  const [showInvoiceDetailsModal, setShowInvoiceDetailsModal] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [isLoadingInvoiceDetails, setIsLoadingInvoiceDetails] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Debounce logic
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim().toLowerCase());
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch customers with pagination
  const fetchCustomers = async (page = 1, search = '') => {
    try {
      setIsLoading(true);
      const url = new URL(`${import.meta.env.VITE_API_URL}/customer/get-customers`);
      url.searchParams.append('page', page);
      url.searchParams.append('limit', 50);
      if (search) {
        url.searchParams.append('search', search);
      }

      const response = await fetch(url, { credentials: 'include' });
      const data = await response.json();

      if (data.success) {
        setCustomers(data.data || []);
        // Store pagination info if needed
      } else {
        throw new Error(data.message || 'Failed to fetch customers');
      }
    } catch (err) {
      console.error("Error fetching customers:", err);
      toast.error("Failed to fetch customers");
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchCustomers(1);
  }, []);

  // Fetch when search changes
  useEffect(() => {
    fetchCustomers(1, debouncedSearch);
  }, [debouncedSearch]);

  // Handle row selection
  const selectCustomer = (customerId) => {
    setSelectedCustomer((prev) => (prev === customerId ? null : customerId));
  };

  // Export single customer as PDF
  const exportAsPdf = () => {
    if (!selectedCustomer) {
      toast.warning("Please select a customer first");
      return;
    }

    const customer = customers.find((c) => c.customerId === selectedCustomer);

    const content = `
<div style="font-family: 'Arial', sans-serif; padding: 30px; background: #fff; max-width: 600px; margin: 0 auto;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #3f3f91; margin: 0; font-size: 28px; font-weight: bold;">Customer Details</h1>
    <div style="height: 3px; background: linear-gradient(90deg, #3f3f91, #6a6ac5); width: 100px; margin: 10px auto;"></div>
  </div>
  
  <div style="border: 2px solid #3f3f91; border-radius: 10px; overflow: hidden; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
    <div style="background: #3f3f91; padding: 15px; color: white;">
      <h2 style="margin: 0; font-size: 22px;">${customer.customerName || 'N/A'}</h2>
    </div>
    
    <div style="padding: 25px;">
      <div style="display: grid; grid-template-columns: 1fr; gap: 20px; margin-bottom: 20px;">
        <div>
          <h3 style="color: #3f3f91; margin: 0 0 15px 0; font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 8px;">Contact Information</h3>
          
          <div style="margin-bottom: 12px;">
            <div style="font-weight: bold; color: #555; margin-bottom: 4px;">Email</div>
            <div>${customer.email || 'N/A'}</div>
          </div>
          
          <div style="margin-bottom: 12px;">
            <div style="font-weight: bold; color: #555; margin-bottom: 4px;">Mobile Number</div>
            <div>${customer.contactNumber || 'N/A'}</div>
          </div>
          
          <div style="margin-bottom: 12px;">
            <div style="font-weight: bold; color: #555; margin-bottom: 4px;">Loyalty Coins</div>
            <div>${customer.loyaltyCoins || 0}</div>
          </div>
          
          <div style="margin-bottom: 12px;">
            <div style="font-weight: bold; color: #555; margin-bottom: 4px;">Created Date</div>
            <div>${new Date(customer.createdAt || customer._id?.getTimestamp()).toLocaleDateString()}</div>
          </div>
        </div>
      </div>
      
      <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; text-align: center; margin-top: 20px; border: 1px dashed #ddd;">
        <div style="font-style: italic; color: #777;">Generated on ${new Date().toLocaleDateString()}</div>
      </div>
    </div>
  </div>
</div>`;

    const opt = {
      margin: 10,
      filename: `${customer.customerName}_details.pdf`,
      image: { type: "jpeg", quality: 1 },
      html2canvas: { scale: 3 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    html2pdf().from(content).set(opt).save();
  };

  // Export all customers as Excel
  const exportAllAsExcel = () => {
    const dataToExport = customers;

    if (dataToExport.length === 0) {
      toast.warning("No customers to export");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(
      dataToExport.map((customer) => ({
        Name: customer.customerName,
        Email: customer.email,
        "Mobile Number": customer.contactNumber,
        "Loyalty Coins": customer.loyaltyCoins || 0,
      }))
    );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");

    const fileName = debouncedSearch ? "filtered_customers.xlsx" : "all_customers.xlsx";
    XLSX.writeFile(workbook, fileName);
  };

  const handleBulkImport = async (file) => {
    try {
      setIsBulkImportLoading(true);
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          const customers = jsonData.map((row) => {
            const customerName = row['Customer Name'] || row['customerName'] || row['Name'] || '';
            const email = row['Email'] || row['email'] || '';
            const contactNumber = row['Mobile Number'] || row['contactNumber'] || row['Mobile'] || '';

            return {
              customerName: customerName.toString().trim(),
              email: email ? email.toString().trim() : '',
              contactNumber: contactNumber.toString().trim()
            };
          }).filter(customer => customer.customerName && customer.contactNumber);

          if (customers.length === 0) {
            toast.error("No valid customer data found in the file");
            setIsBulkImportLoading(false);
            return;
          }

          const response = await fetch(
            `${import.meta.env.VITE_API_URL}/customer/bulk-create-customers`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ customers }),
            }
          );

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.message || "Failed to import customers");
          }

          toast.success(
            `Import completed: ${result.results.successful.length} successful, ${result.results.failed.length} failed`
          );

          if (result.results.successful.length > 0) {
            fetchCustomers(1, debouncedSearch);
          }

          setShowBulkImport(false);

        } catch (error) {
          console.error("Error processing file:", error);
          toast.error(error.message || "Error processing the file");
        } finally {
          setIsBulkImportLoading(false);
        }
      };

      reader.onerror = () => {
        toast.error("Error reading file");
        setIsBulkImportLoading(false);
      };

      reader.readAsArrayBuffer(file);

    } catch (error) {
      console.error("Error in bulk import:", error);
      toast.error("Failed to import customers");
      setIsBulkImportLoading(false);
    }
  };

  // Form handlers
  const initialValues = {
    customerName: "",
    email: "",
    contactNumber: "",
  };

  const validationSchema = Yup.object({
    customerName: Yup.string()
      .required("Customer Name is required")
      .matches(/^[a-zA-Z\s]*$/, "Customer Name cannot contain numbers"),
    email: Yup.string().email("Invalid email"),
    contactNumber: Yup.string()
      .required("Mobile Number is required")
      .matches(/^[0-9]+$/, "Must be only digits")
      .min(10, "Must be exactly 10 digits")
      .max(10, "Must be exactly 10 digits"),
  });

  const handleSubmit = async (values, { resetForm, setFieldError }) => {
    try {
      setIsFormSubmitting(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/customer/create-customer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.field === "email") {
          setFieldError("email", "Customer with this email already exists");
          toast.error("Customer with this email already exists");
        } else {
          throw new Error(data.message || "Failed to add customer");
        }
        return;
      }

      toast.success("Customer added successfully!");
      resetForm();
      setShowForm(false);
      fetchCustomers(1, debouncedSearch);
    } catch (error) {
      console.error("Error adding customer:", error);
      toast.error(error.message || "Error creating customer");
    } finally {
      setIsFormSubmitting(false);
    }
  };

  const handleUpdateCustomer = async (updatedCustomer) => {
    try {
      const customerId = updatedCustomer.customerId;
      const dataToSend = { ...updatedCustomer };
      delete dataToSend.createdAt;
      delete dataToSend.updatedAt;

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/customer/update-customer/${customerId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dataToSend),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update customer");
      }

      toast.success("Customer updated successfully!");
      fetchCustomers(1, debouncedSearch);
    } catch (error) {
      console.error("Error updating customer:", error);
      toast.error(error.message || "Error updating customer");
    }
  };

  const handleDeleteCustomer = async (customerId) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/customer/delete-customer/${customerId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Failed to delete customer");
      }

      setSelectedCustomer(null);
      toast.success("Customer deleted successfully!");
      fetchCustomers(1, debouncedSearch);
    } catch (error) {
      console.error("Error deleting customer:", error);
      toast.error(error.message || "Error deleting customer");
    }
  };

  // ============================================
  // HANDLE VIEW INVOICE (for Customer Invoices Modal)
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

  // ============================================
  // CUSTOMER MODAL COMPONENT
  // ============================================
  const CustomerModal = ({ customer, onClose, onExport, onUpdate, onDelete }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedCustomer, setEditedCustomer] = useState({});
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [errors, setErrors] = useState({});

    useEffect(() => {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'auto';
      };
    }, []);

    useEffect(() => {
      if (customer) {
        setEditedCustomer({ ...customer });
        setErrors({});
      }
    }, [customer]);

    const validateForm = (values) => {
      const newErrors = {};

      if (!values.customerName) newErrors.customerName = "Customer Name is required";
      else if (!/^[a-zA-Z\s]*$/.test(values.customerName)) newErrors.customerName = "Customer Name cannot contain numbers";

      if (values.email && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(values.email))
        newErrors.email = "Invalid email address";

      if (!values.contactNumber) newErrors.contactNumber = "Mobile Number is required";
      else if (!/^[0-9]+$/.test(values.contactNumber)) newErrors.contactNumber = "Must be only digits";
      else if (values.contactNumber.length !== 10) newErrors.contactNumber = "Must be exactly 10 digits";

      return newErrors;
    };

    const handleInputChange = (e) => {
      const { name, value } = e.target;
      setEditedCustomer(prev => ({ ...prev, [name]: value }));
      const fieldErrors = validateForm({ ...editedCustomer, [name]: value });
      setErrors(prev => ({ ...prev, [name]: fieldErrors[name] }));
    };

    const handleSave = async () => {
      const formErrors = validateForm(editedCustomer);
      if (Object.keys(formErrors).length > 0) {
        setErrors(formErrors);
        toast.error("Please fix the errors before saving");
        return;
      }

      try {
        await onUpdate(editedCustomer);
        setIsEditing(false);
        setErrors({});
      } catch (error) {
        console.error("Error updating customer:", error);
      }
    };

    const handleViewInvoices = () => {
      setShowInvoicesModal(true);
    };

    if (!customer) return null;

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">
              {isEditing ? "Edit Customer" : `Customer Details: ${customer.customerName}`}
            </div>
            <button className="modal-close" onClick={onClose}>
              &times;
            </button>
          </div>

          <div className="modal-body">
            <div className="wo-details-grid">
              <div className="detail-row">
                <span className="detail-label">Customer Name *</span>
                {isEditing ? (
                  <div className="edit-field-container">
                    <input
                      type="text"
                      name="customerName"
                      value={editedCustomer.customerName || ''}
                      onChange={handleInputChange}
                      className={`edit-input ${errors.customerName ? 'error' : ''}`}
                    />
                    {errors.customerName && <div className="error-message">{errors.customerName}</div>}
                  </div>
                ) : (
                  <span className="detail-value">{customer.customerName}</span>
                )}
              </div>

              <div className="detail-row">
                <span className="detail-label">Email </span>
                {isEditing ? (
                  <div className="edit-field-container">
                    <input
                      type="email"
                      name="email"
                      value={editedCustomer.email || ''}
                      onChange={handleInputChange}
                      className={`edit-input ${errors.email ? 'error' : ''}`}
                    />
                    {errors.email && <div className="error-message">{errors.email}</div>}
                  </div>
                ) : (
                  <span className="detail-value">{customer.email || 'N/A'}</span>
                )}
              </div>

              <div className="detail-row">
                <span className="detail-label">Mobile Number *</span>
                {isEditing ? (
                  <div className="edit-field-container">
                    <input
                      type="text"
                      name="contactNumber"
                      value={editedCustomer.contactNumber || ''}
                      onChange={handleInputChange}
                      className={`edit-input ${errors.contactNumber ? 'error' : ''}`}
                    />
                    {errors.contactNumber && <div className="error-message">{errors.contactNumber}</div>}
                  </div>
                ) : (
                  <span className="detail-value">{customer.contactNumber || 'N/A'}</span>
                )}
              </div>

              <div className="detail-row">
                <span className="detail-label">Created At:</span>
                <span className="detail-value">
                  {new Date(customer.createdAt || customer._id?.getTimestamp()).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button className="invoices-btn" onClick={handleViewInvoices}>
              <FaList /> All Invoices
            </button>
            <button className="export-btn" onClick={onExport}>
              <FaFileExport /> Export PDF
            </button>
            <button
              className={`update-btn ${isEditing ? 'save-btn' : ''}`}
              onClick={isEditing ? handleSave : () => setIsEditing(true)}
            >
              {isEditing ? <FaSave /> : <FaEdit />}
              {isEditing ? "Save" : "Update"}
            </button>
            <button
              className="delete-btn"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <FaTrash /> Delete
            </button>
          </div>
        </div>

        {showDeleteConfirm && (
          <div className="confirm-dialog-overlay">
            <div className="confirm-dialog">
              <h3>Confirm Deletion</h3>
              <p>Are you sure you want to delete {customer.customerName}? This action cannot be undone.</p>
              <div className="confirm-buttons">
                <button className="confirm-cancel" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </button>
                <button className="confirm-delete" onClick={() => {
                  onDelete(customer.customerId);
                  setShowDeleteConfirm(false);
                }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // BULK IMPORT MODAL
  // ============================================
  const BulkImportModal = ({ onClose, onImport, isLoading }) => {
    const [file, setFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileSelect = (selectedFile) => {
      if (selectedFile && !isLoading) {
        const validTypes = [
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv'
        ];

        if (!validTypes.includes(selectedFile.type)) {
          toast.error("Please select a valid Excel file (.xlsx, .xls, .csv)");
          return;
        }
        setFile(selectedFile);
      }
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      if (!isLoading) setIsDragging(true);
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const handleDrop = (e) => {
      e.preventDefault();
      if (!isLoading) {
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        handleFileSelect(droppedFile);
      }
    };

    const handleImport = () => {
      if (!file || isLoading) return;
      onImport(file);
    };

    return (
      <div className="modal-overlay" onClick={!isLoading ? onClose : undefined}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">
              {isLoading ? "Importing Customers..." : "Bulk Import Customers"}
            </div>
            {!isLoading && (
              <button className="modal-close" onClick={onClose}>&times;</button>
            )}
          </div>

          <div className="modal-body">
            {isLoading ? (
              <div className="import-loading">
                <div className="loading-spinner large"></div>
                <p>Importing customers, please wait...</p>
                <div className="loading-progress">
                  <div className="progress-bar">
                    <div className="progress-fill"></div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="import-instructions">
                  <h4>File Requirements:</h4>
                  <ul>
                    <li>File format: Excel (.xlsx, .xls) or CSV</li>
                    <li>Required columns: <strong>Customer Name</strong>, <strong>Mobile Number</strong></li>
                    <li>Optional columns: Email</li>
                    <li>Maximum 1000 records per file</li>
                  </ul>
                </div>

                <div
                  className={`file-drop-zone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !isLoading && fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => handleFileSelect(e.target.files[0])}
                    disabled={isLoading}
                  />

                  {file ? (
                    <div className="file-selected">
                      <FaFileExcel className="file-icon" />
                      <div className="file-info">
                        <div className="file-name">{file.name}</div>
                        <div className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                      </div>
                      {!isLoading && (
                        <button
                          className="remove-file"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFile(null);
                          }}
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="file-placeholder">
                      <FaFileExcel className="upload-icon" />
                      <p>Drop Excel file here or click to browse</p>
                      <small>Supports .xlsx, .xls, .csv files</small>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            {!isLoading && (
              <button className="cancel-btn" onClick={onClose}>
                Cancel
              </button>
            )}
            <button
              className={`import-btn ${isLoading ? 'loading' : ''}`}
              onClick={handleImport}
              disabled={!file || isLoading}
            >
              {isLoading ? (
                <>
                  <div className="loading-spinner small"></div>
                  Importing...
                </>
              ) : (
                <>
                  <FaFileExcel /> Import Customers
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // MAIN RENDER
  // ============================================
  return (
    <Navbar>
      <ToastContainer position="top-center" autoClose={3000} />
      <div className="main">
        <div className="page-header">
          <div className="right-section">
            <div className="search-container">
              <FaSearch className="search-icon" />
              <input
                type="text"
                placeholder="Search Customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="action-buttons-group">
              <button className="export-all-btn" onClick={exportAllAsExcel}>
                <FaFileExcel /> Export All
              </button>
              <button className="add-btn" onClick={() => setShowForm(!showForm)}>
                <FaPlus /> {showForm ? "Close" : "Add Customer"}
              </button>
            </div>
          </div>
        </div>

        {showForm && (
          <div className="form-container premium">
            <h2>Add Customer</h2>
            <Formik
              initialValues={initialValues}
              validationSchema={validationSchema}
              onSubmit={handleSubmit}
            >
              <Form>
                <div className="form-row">
                  <div className="form-field">
                    <label><FaUser /> Customer Name *</label>
                    <Field name="customerName" type="text" />
                    <ErrorMessage name="customerName" component="div" className="error" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label><FaEnvelope /> Email</label>
                    <Field name="email" type="email" />
                    <ErrorMessage name="email" component="div" className="error" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label><FaPhone /> Mobile Number *</label>
                    <Field name="contactNumber" type="text" />
                    <ErrorMessage name="contactNumber" component="div" className="error" />
                  </div>
                </div>

                <button type="submit" disabled={isFormSubmitting}>
                  {isFormSubmitting ? (
                    <>
                      <div className="loading-spinner small"></div>
                      Adding...
                    </>
                  ) : (
                    "Submit"
                  )}
                </button>
              </Form>
            </Formik>
          </div>
        )}

        <div className="data-table">
          {isLoading ? (
            <div className="loading-container">
              <div className="loading-spinner large"></div>
              <p>Loading customers...</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Mobile Number</th>
                  <th style={{ textAlign: 'center' }}>🪙 Loyalty Coins</th>  {/* ✅ NEW COLUMN */}
                </tr>
              </thead>
              <tbody>
                {customers.map((cust, index) => (
                  <tr
                    key={cust.customerId || index}
                    className={selectedCustomer === cust.customerId ? "selected" : ""}
                    onClick={() => selectCustomer(cust.customerId)}
                  >
                    <td>{cust.customerName}</td>
                    <td>{cust.email}</td>
                    <td>{cust.contactNumber}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="loyalty-coins-badge">
                        {cust.loyaltyCoins || 0}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selectedCustomer && (
          <CustomerModal
            customer={customers.find(c => c.customerId === selectedCustomer)}
            onClose={() => setSelectedCustomer(null)}
            onExport={exportAsPdf}
            onUpdate={handleUpdateCustomer}
            onDelete={handleDeleteCustomer}
          />
        )}

        {showBulkImport && (
          <BulkImportModal
            onClose={() => setShowBulkImport(false)}
            onImport={handleBulkImport}
            isLoading={isBulkImportLoading}
          />
        )}

        {/* Customer Invoices Modal */}
        {showInvoicesModal && selectedCustomer && (
          <CustomerInvoicesModal
            customer={customers.find(c => c.customerId === selectedCustomer)}
            onClose={() => setShowInvoicesModal(false)}
            onViewInvoice={handleViewInvoice}
            formatDate={formatDate}
            getStatusClass={getStatusClass}
          />
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
        />
      </div>
    </Navbar>
  );
};

export default Customer;