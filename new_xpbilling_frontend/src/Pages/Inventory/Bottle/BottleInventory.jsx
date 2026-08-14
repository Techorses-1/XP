import React, { useState, useEffect, useRef } from "react";
import { toast, ToastContainer } from "react-toastify";
import {
    FaBox, FaPlus, FaSearch, FaFileExcel,
    FaUpload, FaDownload, FaTimes, FaBell,
    FaCheckCircle, FaTimesCircle, FaChevronLeft, FaChevronRight,
    FaChevronRight as FaExpandChevron, FaHistory, FaArrowUp, FaArrowDown,
    FaUser, FaCalendarAlt, FaClock, FaTag, FaInfoCircle, FaTrashAlt,
    FaEye, FaChevronDown, FaFilter, FaMoneyBillWave
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Navbar from "../../../Components/Navbar/Navbar";
import "./BottleInventory.scss";
import "react-toastify/dist/ReactToastify.css";
import * as XLSX from 'xlsx';

// ============================================
// ADD STOCK MODAL - WITH PURCHASE PRICE
// ============================================
const AddStockModal = ({
    show, onClose, mlSizes, itemTypes,
    addStockData, setAddStockData, isSubmitting, onSubmit,
    isLoadingItems
}) => {
    if (!show) return null;

    if (isLoadingItems) {
        return (
            <div className="bi-modal-overlay" onClick={onClose}>
                <div className="bi-modal-content" onClick={(e) => e.stopPropagation()}>
                    <div className="bi-modal-header">
                        <div className="bi-modal-title">
                            <FaPlus /> Add Stock
                        </div>
                        <button className="bi-modal-close" onClick={onClose}>
                            <FaTimes />
                        </button>
                    </div>
                    <div className="bi-modal-body">
                        <div className="bi-loading-products">
                            <div className="bi-loading-spinner small"></div>
                            <p>Loading inventory...</p>
                        </div>
                    </div>
                    <div className="bi-modal-footer">
                        <button className="bi-btn-cancel" onClick={onClose}>
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bi-modal-overlay" onClick={onClose}>
            <div className="bi-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="bi-modal-header">
                    <div className="bi-modal-title">
                        <FaPlus /> Add Stock
                    </div>
                    <button className="bi-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="bi-modal-body">
                    <div className="bi-form-row">
                        <div className="bi-form-field">
                            <label>ML Size *</label>
                            <select
                                value={addStockData.mlSize}
                                onChange={(e) => setAddStockData({ ...addStockData, mlSize: e.target.value })}
                            >
                                <option value="">Select ML Size</option>
                                {mlSizes.map(ml => (
                                    <option key={ml} value={ml}>{ml}</option>
                                ))}
                            </select>
                            <small className="bi-hint">{mlSizes.length} ML sizes available</small>
                        </div>
                        <div className="bi-form-field">
                            <label>Item Type *</label>
                            <select
                                value={addStockData.itemType}
                                onChange={(e) => setAddStockData({ ...addStockData, itemType: e.target.value })}
                            >
                                <option value="">Select Item Type</option>
                                {itemTypes.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                            <small className="bi-hint">{itemTypes.length} item types available</small>
                        </div>
                    </div>
                    <div className="bi-form-row">
                        <div className="bi-form-field">
                            <label>Quantity *</label>
                            <input
                                type="number"
                                min="1"
                                value={addStockData.quantity}
                                onChange={(e) => setAddStockData({ ...addStockData, quantity: e.target.value })}
                                placeholder="Enter quantity"
                                autoComplete="off"
                            />
                        </div>
                        <div className="bi-form-field">
                            <label><FaMoneyBillWave /> Purchase Price (per item) *</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={addStockData.purchasePrice}
                                onChange={(e) => setAddStockData({ ...addStockData, purchasePrice: e.target.value })}
                                placeholder="Enter purchase price"
                                autoComplete="off"
                            />
                            <small className="bi-hint">Price per single item</small>
                        </div>
                    </div>
                    <div className="bi-form-row">
                        <div className="bi-form-field">
                            <label>Reason</label>
                            <select
                                value={addStockData.reason}
                                onChange={(e) => setAddStockData({ ...addStockData, reason: e.target.value })}
                            >
                                <option value="Purchase">Purchase</option>
                                <option value="Return">Return</option>
                                <option value="Adjustment">Adjustment</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div className="bi-form-field">
                            <label>Notes</label>
                            <input
                                type="text"
                                value={addStockData.notes || ''}
                                onChange={(e) => setAddStockData({ ...addStockData, notes: e.target.value })}
                                placeholder="Optional notes"
                                autoComplete="off"
                            />
                        </div>
                    </div>
                </div>
                <div className="bi-modal-footer">
                    <button className="bi-btn-cancel" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="bi-btn-primary" onClick={onSubmit} disabled={isSubmitting}>
                        {isSubmitting ? "Adding..." : "Add Stock"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// ADD ML MODAL
// ============================================
const AddMLModal = ({ show, onClose, newML, setNewML, isSubmitting, onSubmit }) => {
    if (!show) return null;

    return (
        <div className="bi-modal-overlay" onClick={onClose}>
            <div className="bi-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="bi-modal-header">
                    <div className="bi-modal-title">
                        <FaPlus /> Add ML Size
                    </div>
                    <button className="bi-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="bi-modal-body">
                    <div className="bi-form-row">
                        <div className="bi-form-field">
                            <label>ML Size *</label>
                            <input
                                type="text"
                                value={newML}
                                onChange={(e) => {
                                    // ✅ ONLY allow numbers
                                    const value = e.target.value.replace(/[^0-9]/g, '');
                                    setNewML(value);
                                }}
                                placeholder="Enter ML size (e.g., 200)"
                                autoComplete="off"
                            />
                            <small className="bi-field-hint">
                                This will create entries for all existing item types with 0 stock
                            </small>
                        </div>
                    </div>
                </div>
                <div className="bi-modal-footer">
                    <button className="bi-btn-cancel" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="bi-btn-primary" onClick={onSubmit} disabled={isSubmitting || !newML.trim()}>
                        {isSubmitting ? "Adding..." : "Add ML Size"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// ADD ITEM TYPE MODAL
// ============================================
const AddItemModal = ({ show, onClose, newItemType, setNewItemType, isSubmitting, onSubmit }) => {
    if (!show) return null;

    return (
        <div className="bi-modal-overlay" onClick={onClose}>
            <div className="bi-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="bi-modal-header">
                    <div className="bi-modal-title">
                        <FaPlus /> Add Item Type
                    </div>
                    <button className="bi-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="bi-modal-body">
                    <div className="bi-form-row">
                        <div className="bi-form-field">
                            <label>Item Type *</label>
                            <input
                                type="text"
                                value={newItemType}
                                onChange={(e) => setNewItemType(e.target.value)}
                                placeholder="Enter item type (e.g., Label)"
                                autoComplete="off"
                            />
                            <small className="bi-field-hint">
                                This will create entries for all existing ML sizes with 0 stock
                            </small>
                        </div>
                    </div>
                </div>
                <div className="bi-modal-footer">
                    <button className="bi-btn-cancel" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="bi-btn-primary" onClick={onSubmit} disabled={isSubmitting || !newItemType.trim()}>
                        {isSubmitting ? "Adding..." : "Add Item Type"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// BULK UPLOAD MODAL - WITH PURCHASE PRICE
// ============================================
const BulkUploadModal = ({
    show, onClose, fileInputRef, selectedFile, onFileChange,
    onDownloadTemplate, isSubmitting, onSubmit
}) => {
    if (!show) return null;

    return (
        <div className="bi-modal-overlay" onClick={onClose}>
            <div className="bi-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="bi-modal-header">
                    <div className="bi-modal-title">
                        <FaUpload /> Bulk Upload
                    </div>
                    <button className="bi-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="bi-modal-body">
                    <div className="bi-upload-area">
                        <p>Upload Excel file with inventory data</p>
                        <p className="bi-upload-hint">
                            File should have columns: ML Size, Item Type, Quantity, Purchase Price
                        </p>
                        <div className="bi-file-drop">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={onFileChange}
                            />
                            {selectedFile && (
                                <div className="bi-file-info">
                                    <FaFileExcel /> {selectedFile.name}
                                </div>
                            )}
                        </div>
                        <button className="bi-btn-download" onClick={onDownloadTemplate}>
                            <FaDownload /> Download Template
                        </button>
                    </div>
                </div>
                <div className="bi-modal-footer">
                    <button className="bi-btn-cancel" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="bi-btn-primary" onClick={onSubmit} disabled={isSubmitting || !selectedFile}>
                        {isSubmitting ? "Uploading..." : "Upload"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// ERROR MODAL - WITH PURCHASE PRICE
// ============================================
const ErrorModal = ({
    show,
    onClose,
    bulkSuccessCount,
    bulkErrorCount,
    bulkSuccessDetails,
    bulkErrors,
    onDownloadErrorExcel
}) => {
    if (!show) return null;

    const hasErrors = bulkErrors && bulkErrors.length > 0;
    const hasSuccess = bulkSuccessCount > 0;

    return (
        <div className="bi-modal-overlay" onClick={onClose}>
            <div className="bi-modal-content bi-modal-lg" onClick={(e) => e.stopPropagation()}>
                <div className="bi-modal-header">
                    <div className="bi-modal-title">
                        <FaFileExcel /> Bulk Upload Results
                    </div>
                    <button className="bi-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="bi-modal-body">
                    <div className="bi-upload-summary">
                        <div className="bi-summary-success">
                            <FaCheckCircle />
                            <strong>Success:</strong> {bulkSuccessCount} items added
                        </div>
                        <div className={`bi-summary-error ${hasErrors ? 'has-errors' : 'no-errors'}`}>
                            <FaTimesCircle />
                            <strong>Failed:</strong> {bulkErrorCount} items
                        </div>
                    </div>

                    {hasSuccess && bulkSuccessDetails && bulkSuccessDetails.length > 0 && (
                        <div className="bi-result-section">
                            <h4 className="bi-result-heading bi-result-success">
                                <FaCheckCircle /> Successfully Added ({bulkSuccessDetails.length})
                            </h4>
                            <div className="bi-result-table-wrap">
                                <table className="bi-result-table bi-success-table">
                                    <thead>
                                        <tr>
                                            <th>Row</th>
                                            <th>ML Size</th>
                                            <th>Item Type</th>
                                            <th>Quantity</th>
                                            <th>Purchase Price</th>
                                            <th>New Stock</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bulkSuccessDetails.map((item, index) => (
                                            <tr key={index}>
                                                <td>{item.row}</td>
                                                <td>{item.mlSize}</td>
                                                <td>{item.itemType}</td>
                                                <td>{item.quantity}</td>
                                                <td>₹{item.purchasePrice || 0}</td>
                                                <td className="bi-success-cell">{item.newStock}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {hasErrors && (
                        <div className="bi-result-section">
                            <h4 className="bi-result-heading bi-result-error">
                                <FaTimesCircle /> Failed ({bulkErrors.length})
                            </h4>
                            <div className="bi-result-table-wrap">
                                <table className="bi-result-table bi-error-table">
                                    <thead>
                                        <tr>
                                            <th>Row</th>
                                            <th>ML Size</th>
                                            <th>Item Type</th>
                                            <th>Quantity</th>
                                            <th>Purchase Price</th>
                                            <th>Error</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bulkErrors.map((err, index) => (
                                            <tr key={index}>
                                                <td>{err.row}</td>
                                                <td>{err.mlSize || '-'}</td>
                                                <td>{err.itemType || '-'}</td>
                                                <td>{err.quantity || '-'}</td>
                                                <td>{err.purchasePrice || '-'}</td>
                                                <td className="bi-error-cell">{err.error}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {hasErrors && (
                        <button className="bi-btn-download-error" onClick={onDownloadErrorExcel}>
                            <FaDownload /> Download Error Report
                        </button>
                    )}
                </div>
                <div className="bi-modal-footer">
                    <button className="bi-btn-primary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// ALERT MODAL
// ============================================
const AlertModal = ({ show, onClose, alerts }) => {
    if (!show) return null;

    const lowStockItems = alerts.filter(item => item.quantity > 0 && item.quantity <= item.minStock);
    const emptyItems = alerts.filter(item => item.quantity === 0);

    return (
        <div className="bi-modal-overlay" onClick={onClose}>
            <div className="bi-modal-content bi-modal-lg" onClick={(e) => e.stopPropagation()}>
                <div className="bi-modal-header">
                    <div className="bi-modal-title">
                        <FaBell /> Stock Alerts
                    </div>
                    <button className="bi-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="bi-modal-body">
                    {alerts.length === 0 ? (
                        <div className="bi-alert-empty-state">
                            <FaBell />
                            <p>All stock levels are healthy!</p>
                        </div>
                    ) : (
                        <>
                            {emptyItems.length > 0 && (
                                <div className="bi-alert-section">
                                    <h4 className="bi-alert-heading-empty">Empty Stock (0)</h4>
                                    <div className="bi-alert-list">
                                        {emptyItems.map((item, index) => (
                                            <div key={index} className="bi-alert-item bi-alert-empty">
                                                <span>{item.mlSize} - {item.itemType}</span>
                                                <span>Quantity: {item.quantity}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {lowStockItems.length > 0 && (
                                <div className="bi-alert-section">
                                    <h4 className="bi-alert-heading-low">Low Stock (Below {alerts[0]?.minStock || 5})</h4>
                                    <div className="bi-alert-list">
                                        {lowStockItems.map((item, index) => (
                                            <div key={index} className="bi-alert-item bi-alert-low">
                                                <span>{item.mlSize} - {item.itemType}</span>
                                                <span>Quantity: {item.quantity} / Min: {item.minStock}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
                <div className="bi-modal-footer">
                    <button className="bi-btn-primary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// DISPOSAL HISTORY PANEL - SINGLE ROW
// ============================================
const DisposalHistoryPanel = ({ disposals, isLoading, onClose }) => {
    const formatDateTime = (dateString) => {
        const date = new Date(dateString);
        return {
            date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
            time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        };
    };

    if (isLoading) {
        return (
            <div className="bi-disposal-panel">
                <div className="bi-disposal-loading">
                    <div className="bi-loading-spinner tiny"></div>
                    Loading disposal history...
                </div>
            </div>
        );
    }

    if (!disposals || disposals.length === 0) {
        return (
            <div className="bi-disposal-panel">
                <div className="bi-disposal-header">
                    <h5><FaTrashAlt /> Disposal History</h5>
                    <button className="bi-disposal-close-btn" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="bi-disposal-empty">No disposal records found for this item.</div>
            </div>
        );
    }

    return (
        <div className="bi-disposal-panel">
            <div className="bi-disposal-header">
                <h5><FaTrashAlt /> Disposal History ({disposals.length})</h5>
                <button className="bi-disposal-close-btn" onClick={onClose}>
                    <FaTimes />
                </button>
            </div>
            <div className="bi-disposal-list">
                {disposals.map((d, idx) => {
                    const { date, time } = formatDateTime(d.disposedAt);
                    return (
                        <div key={d.disposalEntryId || idx} className="bi-disposal-item">
                            <div className="bi-disposal-row">
                                <span className="bi-disposal-label"><FaUser /> Disposed By:</span>
                                <span className="bi-disposal-value">{d.performedBy?.userName || 'Unknown'}</span>

                                <span className="bi-disposal-separator">|</span>

                                <span className="bi-disposal-label"><FaTag /> Reason:</span>
                                <span className="bi-disposal-value bi-disposal-reason">{d.reason || 'N/A'}</span>

                                <span className="bi-disposal-separator">|</span>

                                <span className="bi-disposal-label"><FaCalendarAlt /> Date:</span>
                                <span className="bi-disposal-value">{date}</span>

                                <span className="bi-disposal-separator">|</span>

                                <span className="bi-disposal-label"><FaClock /> Time:</span>
                                <span className="bi-disposal-value">{time}</span>

                                <span className="bi-disposal-separator">|</span>

                                <span className="bi-disposal-label"><FaTrashAlt /> Quantity:</span>
                                <span className="bi-disposal-value bi-disposal-qty">-{d.disposedQuantity}</span>

                                {d.notes && (
                                    <>
                                        <span className="bi-disposal-separator">|</span>
                                        <span className="bi-disposal-label"><FaInfoCircle /> Notes:</span>
                                        <span className="bi-disposal-value">{d.notes}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ============================================
// FULL TRANSACTION MODAL (IN + OUT with Toggle) - WITH PURCHASE PRICE
// ============================================
const FullTransactionModal = ({
    show, onClose, mlSize, itemType, transactions, isLoading,
    activeTab, setActiveTab
}) => {
    if (!show) return null;

    const inTransactions = transactions?.filter(t => t.transactionType === 'IN') || [];
    const outTransactions = transactions?.filter(t => t.transactionType === 'OUT') || [];

    const currentTransactions = activeTab === 'in' ? inTransactions : outTransactions;

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const formatTime = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    };

    const getReasonLabel = (reason, bulkUploadId) => {
        if (bulkUploadId) return 'Bulk Upload';
        if (reason === 'Purchase') return 'Manual Add';
        if (reason === 'Invoice') return 'Invoice Created';
        if (reason === 'Invoice Return') return 'Invoice Deleted/Restored';
        if (reason === 'Invoice Edit - Return') return 'Invoice Edit - Returned';
        if (reason === 'Invoice Edit - New Reduction') return 'Invoice Edit - Reduced';
        if (reason === 'Invoice Deletion - Return') return 'Invoice Deleted - Returned';
        return reason || 'Unknown';
    };

    return (
        <div className="bi-modal-overlay" onClick={onClose}>
            <div className="bi-modal-content bi-modal-lg" onClick={(e) => e.stopPropagation()}>
                <div className="bi-modal-header">
                    <div className="bi-modal-title">
                        <FaHistory /> Transaction History - {mlSize} - {itemType}
                    </div>
                    <button className="bi-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="bi-modal-body">
                    {isLoading ? (
                        <div className="bi-transaction-loading">
                            <div className="bi-loading-spinner large"></div>
                            <p>Loading transactions...</p>
                        </div>
                    ) : transactions?.length === 0 ? (
                        <div className="bi-transaction-empty">No transactions found for this item.</div>
                    ) : (
                        <>
                            <div className="bi-transaction-tabs">
                                <button
                                    className={`bi-tab-btn ${activeTab === 'in' ? 'bi-tab-active' : ''}`}
                                    onClick={() => setActiveTab('in')}
                                >
                                    <FaArrowUp /> IN ({inTransactions.length})
                                </button>
                                <button
                                    className={`bi-tab-btn ${activeTab === 'out' ? 'bi-tab-active' : ''}`}
                                    onClick={() => setActiveTab('out')}
                                >
                                    <FaArrowDown /> OUT ({outTransactions.length})
                                </button>
                            </div>

                            <div className="bi-full-transaction-list">
                                {currentTransactions.length === 0 ? (
                                    <div className="bi-transaction-empty">
                                        No {activeTab === 'in' ? 'IN' : 'OUT'} transactions found.
                                    </div>
                                ) : (
                                    currentTransactions.map((t, idx) => {
                                        const isIn = t.transactionType === 'IN';
                                        const reasonLabel = getReasonLabel(t.reason, t.bulkUploadId);

                                        return (
                                            <div key={t.transactionId || idx} className={`bi-full-txn-item ${isIn ? 'bi-txn-in' : 'bi-txn-out'}`}>
                                                <div className="bi-full-txn-header">
                                                    <span className="bi-full-txn-type">
                                                        {isIn ? <FaArrowUp className="bi-txn-in-icon" /> : <FaArrowDown className="bi-txn-out-icon" />}
                                                        {isIn ? '+' : '-'}{t.quantity}
                                                    </span>
                                                    <span className="bi-full-txn-reason">{reasonLabel}</span>
                                                    <span className="bi-full-txn-date">
                                                        <FaCalendarAlt /> {formatDate(t.createdAt)}
                                                    </span>
                                                    <span className="bi-full-txn-time">
                                                        <FaClock /> {formatTime(t.createdAt)}
                                                    </span>
                                                </div>
                                                <div className="bi-full-txn-details">
                                                    <div className="bi-full-txn-row">
                                                        <span className="bi-full-txn-label">Performed By:</span>
                                                        <span className="bi-full-txn-value">{t.performedBy?.userName || 'Unknown'}</span>
                                                    </div>
                                                    <div className="bi-full-txn-row">
                                                        <span className="bi-full-txn-label">Stock Change:</span>
                                                        <span className="bi-full-txn-value">
                                                            {t.previousStock} → <strong>{t.newStock}</strong>
                                                        </span>
                                                    </div>
                                                    {t.purchasePrice !== undefined && t.purchasePrice > 0 && (
                                                        <div className="bi-full-txn-row">
                                                            <span className="bi-full-txn-label"><FaMoneyBillWave /> Purchase Price:</span>
                                                            <span className="bi-full-txn-value bi-txn-price">₹{t.purchasePrice.toFixed(2)} / item</span>
                                                        </div>
                                                    )}
                                                    {t.notes && (
                                                        <div className="bi-full-txn-row">
                                                            <span className="bi-full-txn-label">Notes:</span>
                                                            <span className="bi-full-txn-value">{t.notes}</span>
                                                        </div>
                                                    )}
                                                    {t.bulkUploadId && (
                                                        <div className="bi-full-txn-row">
                                                            <span className="bi-full-txn-label">Bulk Upload ID:</span>
                                                            <span className="bi-full-txn-value bi-txn-bulk-id">{t.bulkUploadId}</span>
                                                        </div>
                                                    )}
                                                    {t.reason && t.reason.includes('Invoice') && (
                                                        <div className="bi-full-txn-row">
                                                            <span className="bi-full-txn-label">Invoice Related:</span>
                                                            <span className="bi-full-txn-value bi-txn-invoice-tag">Yes</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </>
                    )}
                </div>
                <div className="bi-modal-footer">
                    <button className="bi-btn-primary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// TRANSACTION PANEL - WITH PURCHASE PRICE
// ============================================
const TransactionPanel = ({
    transactions,
    isLoading,
    onViewDisposal,
    hasDisposal,
    onViewAllTransactions
}) => {
    const formatDateTime = (dateString) => {
        const date = new Date(dateString);
        return {
            date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
            time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        };
    };

    const inTransactions = transactions?.filter(t => t.transactionType === 'IN') || [];

    if (isLoading) {
        return (
            <div className="bi-transaction-panel">
                <div className="bi-transaction-loading">
                    <div className="bi-loading-spinner tiny"></div>
                    Loading transaction history...
                </div>
            </div>
        );
    }

    if (inTransactions.length === 0) {
        return (
            <div className="bi-transaction-panel">
                <div className="bi-transaction-panel-header">
                    <h5><FaHistory /> Transaction History</h5>
                    <div className="bi-transaction-actions">
                        {hasDisposal && (
                            <button className="bi-view-disposal-btn" onClick={onViewDisposal}>
                                <FaTrashAlt /> View Disposals
                            </button>
                        )}
                        <button className="bi-view-all-transactions-btn" onClick={onViewAllTransactions}>
                            <FaEye /> View All Transactions
                        </button>
                    </div>
                </div>
                <div className="bi-transaction-empty">No stock IN transactions recorded yet for this item.</div>
            </div>
        );
    }

    return (
        <div className="bi-transaction-panel">
            <div className="bi-transaction-panel-header">
                <h5><FaHistory /> Transaction History ({inTransactions.length})</h5>
                <div className="bi-transaction-actions">
                    {hasDisposal && (
                        <button className="bi-view-disposal-btn" onClick={onViewDisposal}>
                            <FaTrashAlt /> View Disposals
                        </button>
                    )}
                    <button className="bi-view-all-transactions-btn" onClick={onViewAllTransactions}>
                        <FaEye /> View All Transactions
                    </button>
                </div>
            </div>
            <div className="bi-transaction-list">
                {inTransactions.map((t, idx) => {
                    const { date, time } = formatDateTime(t.createdAt);
                    const isBulk = t.bulkUploadId && t.bulkUploadId !== '';
                    const reasonLabel = isBulk ? 'Bulk Upload' : t.reason || 'Manual Add';

                    return (
                        <div key={t.transactionId || idx} className="bi-transaction-item">
                            <div className="bi-transaction-row">
                                <span className="bi-txn-label"><FaUser /> Name:</span>
                                <span className="bi-txn-value">{t.performedBy?.userName || 'Unknown'}</span>

                                <span className="bi-txn-separator">|</span>

                                <span className="bi-txn-label"><FaTag /> Reason:</span>
                                <span className="bi-txn-value bi-txn-reason">{reasonLabel}</span>

                                <span className="bi-txn-separator">|</span>

                                <span className="bi-txn-label"><FaCalendarAlt /> Date:</span>
                                <span className="bi-txn-value">{date}</span>

                                <span className="bi-txn-separator">|</span>

                                <span className="bi-txn-label"><FaClock /> Time:</span>
                                <span className="bi-txn-value">{time}</span>

                                <span className="bi-txn-separator">|</span>

                                <span className="bi-txn-label"><FaArrowUp /> Quantity:</span>
                                <span className="bi-txn-value bi-txn-qty">+{t.quantity}</span>

                                {t.purchasePrice !== undefined && t.purchasePrice > 0 && (
                                    <>
                                        <span className="bi-txn-separator">|</span>
                                        <span className="bi-txn-label"><FaMoneyBillWave /> Price:</span>
                                        <span className="bi-txn-value bi-txn-price">₹{t.purchasePrice.toFixed(2)}</span>
                                    </>
                                )}

                                <span className="bi-txn-separator">|</span>

                                <span className="bi-txn-label"><FaBox /> Stock:</span>
                                <span className="bi-txn-value bi-txn-stock">
                                    {t.previousStock} → <strong>{t.newStock}</strong>
                                </span>

                                {t.notes && (
                                    <>
                                        <span className="bi-txn-separator">|</span>
                                        <span className="bi-txn-label"><FaInfoCircle /> Notes:</span>
                                        <span className="bi-txn-value">{t.notes}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================
const BottleInventory = () => {
    const [inventory, setInventory] = useState([]);
    const [filteredInventory, setFilteredInventory] = useState([]);
    const [allInventory, setAllInventory] = useState([]);
    const [isLoadingAllInventory, setIsLoadingAllInventory] = useState(false);
    const [mlSizes, setMlSizes] = useState([]);
    const [itemTypes, setItemTypes] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedML, setSelectedML] = useState("");
    const [selectedItemType, setSelectedItemType] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [showAddStockModal, setShowAddStockModal] = useState(false);
    const [showAddMLModal, setShowAddMLModal] = useState(false);
    const [showAddItemModal, setShowAddItemModal] = useState(false);
    const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [showAlertModal, setShowAlertModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState({
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
    });

    // Form states - ✅ ADDED purchasePrice
    const [addStockData, setAddStockData] = useState({
        mlSize: "",
        itemType: "",
        quantity: "",
        purchasePrice: "",
        reason: "Purchase",
        notes: ""
    });
    const [newML, setNewML] = useState("");
    const [newItemType, setNewItemType] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);
    const [bulkErrors, setBulkErrors] = useState([]);
    const [bulkSuccessCount, setBulkSuccessCount] = useState(0);
    const [bulkErrorCount, setBulkErrorCount] = useState(0);
    const [bulkSuccessDetails, setBulkSuccessDetails] = useState([]);
    const [bulkUploadId, setBulkUploadId] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Row expansion / transaction history states
    const [expandedRowKey, setExpandedRowKey] = useState(null);
    const [transactionsByRowKey, setTransactionsByRowKey] = useState({});
    const [loadingTransactionsKey, setLoadingTransactionsKey] = useState(null);

    // Disposal states
    const [showDisposalPanel, setShowDisposalPanel] = useState(false);
    const [disposalData, setDisposalData] = useState(null);
    const [loadingDisposal, setLoadingDisposal] = useState(false);
    const [currentDisposalRowKey, setCurrentDisposalRowKey] = useState(null);

    // Full Transaction Modal state
    const [showFullTransactionModal, setShowFullTransactionModal] = useState(false);
    const [fullTransactions, setFullTransactions] = useState([]);
    const [loadingFullTransactions, setLoadingFullTransactions] = useState(false);
    const [fullTransactionMlSize, setFullTransactionMlSize] = useState('');
    const [fullTransactionItemType, setFullTransactionItemType] = useState('');
    const [fullTransactionActiveTab, setFullTransactionActiveTab] = useState('in');

    const fileInputRef = useRef(null);
    const navigate = useNavigate();

    // ============================================
    // ROW KEY HELPER
    // ============================================
    const getRowKey = (item) => `${item.mlSize}__${item.itemType}`;

    // ============================================
    // FETCH ALL INVENTORY FOR DROPDOWN
    // ============================================
    const fetchAllInventory = async () => {
        try {
            setIsLoadingAllInventory(true);
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/bottles/get-all?limit=9999&search=`,
                { credentials: 'include' }
            );

            if (!response.ok) {
                throw new Error('Failed to fetch all inventory');
            }

            const data = await response.json();
            setAllInventory(data.inventory || []);

            const allMlSizes = [...new Set((data.inventory || []).map(item => item.mlSize))].sort();
            const allItemTypes = [...new Set((data.inventory || []).map(item => item.itemType))].sort();

            if (allMlSizes.length > 0) setMlSizes(allMlSizes);
            if (allItemTypes.length > 0) setItemTypes(allItemTypes);
        } catch (error) {
            console.error("Error fetching all inventory:", error);
            setAllInventory([]);
        } finally {
            setIsLoadingAllInventory(false);
        }
    };

    // ============================================
    // FETCH DATA WITH PAGINATION
    // ============================================
    const fetchInventory = async (page = 1, search = '', mlSize = '', itemType = '', status = 'all') => {
        try {
            setIsLoading(true);
            const queryParams = new URLSearchParams({
                page: page,
                limit: 20,
                search: search,
                mlSize: mlSize,
                itemType: itemType
            });

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/bottles/get-all?${queryParams}`,
                { credentials: 'include' }
            );

            if (!response.ok) {
                if (response.status === 401) navigate('/login');
                throw new Error('Failed to fetch inventory');
            }

            const data = await response.json();

            let items = data.inventory || [];

            if (status === 'low') {
                items = items.filter(item => item.quantity > 0 && item.quantity <= (item.minStock || 5));
            } else if (status === 'out-of-stock') {
                items = items.filter(item => item.quantity === 0);
            }

            setInventory(items);
            setFilteredInventory(items);
            setPagination({
                ...data.pagination,
                total: items.length,
                totalPages: Math.ceil(items.length / 20)
            });
            setCurrentPage(data.pagination?.page || 1);

        } catch (error) {
            console.error("Error fetching inventory:", error);
            toast.error("Failed to fetch inventory");
            setInventory([]);
            setFilteredInventory([]);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchMLSizes = async () => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/bottles/get-ml-sizes`,
                { credentials: 'include' }
            );
            if (!response.ok) throw new Error('Failed to fetch ML sizes');
            const data = await response.json();
            setMlSizes(data);
        } catch (error) {
            console.error("Error fetching ML sizes:", error);
        }
    };

    const fetchItemTypes = async () => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/bottles/get-item-types`,
                { credentials: 'include' }
            );
            if (!response.ok) throw new Error('Failed to fetch item types');
            const data = await response.json();
            setItemTypes(data);
        } catch (error) {
            console.error("Error fetching item types:", error);
        }
    };

    const fetchAlerts = async () => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/bottles/get-alerts?page=1&limit=100`,
                { credentials: 'include' }
            );
            if (!response.ok) throw new Error('Failed to fetch alerts');
            const data = await response.json();
            setAlerts(data.alerts || []);
        } catch (error) {
            console.error("Error fetching alerts:", error);
        }
    };

    useEffect(() => {
        fetchInventory(1, '', '', '', statusFilter);
        fetchMLSizes();
        fetchItemTypes();
        fetchAlerts();
        fetchAllInventory();
    }, []);

    // ============================================
    // HANDLE SEARCH
    // ============================================
    const handleSearch = (term) => {
        setSearchTerm(term);
        fetchInventory(1, term, selectedML, selectedItemType, statusFilter);
    };

    // ============================================
    // HANDLE FILTER CHANGE
    // ============================================
    const handleFilterChange = (mlSize, itemType) => {
        setSelectedML(mlSize);
        setSelectedItemType(itemType);
        fetchInventory(1, searchTerm, mlSize, itemType, statusFilter);
    };

    // ============================================
    // HANDLE STATUS FILTER
    // ============================================
    const handleStatusFilter = (status) => {
        setStatusFilter(status);
        fetchInventory(1, searchTerm, selectedML, selectedItemType, status);
    };

    // ============================================
    // HANDLE PAGE CHANGE
    // ============================================
    const handlePageChange = (newPage) => {
        if (newPage < 1 || newPage > pagination.totalPages) return;
        setCurrentPage(newPage);
        fetchInventory(newPage, searchTerm, selectedML, selectedItemType, statusFilter);
    };

    // ============================================
    // EXPORT TO EXCEL
    // ============================================
    const handleExport = async () => {
        try {
            setIsExporting(true);

            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (searchTerm.trim()) params.set('search', searchTerm.trim());
            if (selectedML) params.set('mlSize', selectedML);
            if (selectedItemType) params.set('itemType', selectedItemType);

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/bottles/export?${params}`,
                { credentials: 'include' }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to export');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bottles_inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast.success('Export completed successfully!');

        } catch (error) {
            console.error("Error exporting:", error);
            toast.error(error.message || 'Failed to export');
        } finally {
            setIsExporting(false);
        }
    };

    // ============================================
    // FETCH TRANSACTIONS FOR ROW
    // ============================================
    const fetchTransactionsForRow = async (item) => {
        const rowKey = getRowKey(item);
        try {
            setLoadingTransactionsKey(rowKey);
            const queryParams = new URLSearchParams({
                mlSize: item.mlSize,
                itemType: item.itemType,
                limit: 100,
                page: 1,
                hideInvoice: 'true'
            });

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/bottles/get-transactions?${queryParams}`,
                { credentials: 'include' }
            );
            if (!response.ok) throw new Error('Failed to fetch transaction history');
            const data = await response.json();

            const sorted = [...(data.transactions || [])].sort(
                (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
            );

            setTransactionsByRowKey(prev => ({ ...prev, [rowKey]: sorted }));
        } catch (error) {
            console.error("Error fetching transactions:", error);
            toast.error("Failed to load transaction history");
            setTransactionsByRowKey(prev => ({ ...prev, [rowKey]: [] }));
        } finally {
            setLoadingTransactionsKey(null);
        }
    };

    // ============================================
    // FETCH FULL TRANSACTIONS
    // ============================================
    const fetchFullTransactions = async (mlSize, itemType) => {
        try {
            setLoadingFullTransactions(true);
            setFullTransactionMlSize(mlSize);
            setFullTransactionItemType(itemType);
            setFullTransactionActiveTab('in');

            const queryParams = new URLSearchParams({
                mlSize: mlSize,
                itemType: itemType,
                limit: 500,
                page: 1,
                hideInvoice: 'false'
            });

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/bottles/get-transactions?${queryParams}`,
                { credentials: 'include' }
            );

            if (!response.ok) throw new Error('Failed to fetch transactions');

            const data = await response.json();
            const sorted = [...(data.transactions || [])].sort(
                (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
            );

            setFullTransactions(sorted);
            setShowFullTransactionModal(true);
        } catch (error) {
            console.error("Error fetching full transactions:", error);
            toast.error("Failed to load transactions");
            setFullTransactions([]);
        } finally {
            setLoadingFullTransactions(false);
        }
    };

    // ============================================
    // FETCH DISPOSAL HISTORY
    // ============================================
    const fetchDisposalHistory = async (item) => {
        const rowKey = getRowKey(item);
        try {
            setLoadingDisposal(true);
            setCurrentDisposalRowKey(rowKey);

            const bottleItemId = item.bottleItemId;

            if (!bottleItemId) {
                toast.error("Cannot fetch disposal history: No item ID found");
                setDisposalData(null);
                return;
            }

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/disposal/get-by-product/${bottleItemId}`,
                { credentials: 'include' }
            );

            if (!response.ok) throw new Error('Failed to fetch disposal history');

            const data = await response.json();
            setDisposalData(data.data);
            setShowDisposalPanel(true);
        } catch (error) {
            console.error("Error fetching disposal history:", error);
            toast.error("Failed to load disposal history");
            setDisposalData(null);
        } finally {
            setLoadingDisposal(false);
        }
    };

    const handleRowClick = async (item) => {
        const rowKey = getRowKey(item);

        if (expandedRowKey === rowKey) {
            setExpandedRowKey(null);
            setShowDisposalPanel(false);
            setDisposalData(null);
            return;
        }

        setExpandedRowKey(rowKey);

        if (!transactionsByRowKey[rowKey]) {
            await fetchTransactionsForRow(item);
        }
    };

    // ============================================
    // OPEN ADD STOCK MODAL
    // ============================================
    const openAddStockModal = async () => {
        // Reset form with purchasePrice
        setAddStockData({
            mlSize: "",
            itemType: "",
            quantity: "",
            purchasePrice: "",
            reason: "Purchase",
            notes: ""
        });
        setShowAddStockModal(true);
        await fetchAllInventory();
    };

    // ============================================
    // ADD STOCK - WITH PURCHASE PRICE
    // ============================================
    const handleAddStock = async () => {
        try {
            if (!addStockData.mlSize) {
                toast.error("Please select ML size");
                return;
            }
            if (!addStockData.itemType) {
                toast.error("Please select item type");
                return;
            }
            if (!addStockData.quantity || parseInt(addStockData.quantity) <= 0) {
                toast.error("Please enter valid quantity");
                return;
            }
            if (addStockData.purchasePrice === undefined || addStockData.purchasePrice === null || parseFloat(addStockData.purchasePrice) < 0) {
                toast.error("Please enter valid purchase price (must be >= 0)");
                return;
            }

            setIsSubmitting(true);

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/bottles/add-stock`,
                {
                    method: "POST",
                    credentials: 'include',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        mlSize: addStockData.mlSize,
                        itemType: addStockData.itemType,
                        quantity: parseInt(addStockData.quantity),
                        purchasePrice: parseFloat(addStockData.purchasePrice),
                        reason: addStockData.reason,
                        notes: addStockData.notes || ''
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to add stock");
            }

            const result = await response.json();
            toast.success(result.message);

            const updatedRowKey = `${addStockData.mlSize}__${addStockData.itemType}`;

            setAddStockData({
                mlSize: "",
                itemType: "",
                quantity: "",
                purchasePrice: "",
                reason: "Purchase",
                notes: ""
            });
            setShowAddStockModal(false);
            await fetchInventory(currentPage, searchTerm, selectedML, selectedItemType, statusFilter);
            await fetchAlerts();
            await fetchAllInventory();

            if (expandedRowKey === updatedRowKey) {
                const updatedItem = inventory.find(
                    inv => inv.mlSize === addStockData.mlSize && inv.itemType === addStockData.itemType
                ) || { mlSize: addStockData.mlSize, itemType: addStockData.itemType };
                fetchTransactionsForRow(updatedItem);
            } else {
                setTransactionsByRowKey(prev => {
                    const next = { ...prev };
                    delete next[updatedRowKey];
                    return next;
                });
            }

        } catch (error) {
            console.error("Error adding stock:", error);
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ============================================
    // ADD ML SIZE
    // ============================================
    const handleAddML = async () => {
        try {
            if (!newML.trim()) {
                toast.error("Please enter ML size");
                return;
            }

            setIsSubmitting(true);

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/bottles/add-ml`,
                {
                    method: "POST",
                    credentials: 'include',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mlSize: newML.trim() })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to add ML size");
            }

            const result = await response.json();
            toast.success(result.message);

            setNewML("");
            setShowAddMLModal(false);
            await fetchInventory(currentPage, searchTerm, selectedML, selectedItemType, statusFilter);
            await fetchMLSizes();
            await fetchAllInventory();

        } catch (error) {
            console.error("Error adding ML:", error);
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ============================================
    // ADD ITEM TYPE
    // ============================================
    const handleAddItemType = async () => {
        try {
            if (!newItemType.trim()) {
                toast.error("Please enter item type");
                return;
            }

            setIsSubmitting(true);

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/bottles/add-item-type`,
                {
                    method: "POST",
                    credentials: 'include',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ itemType: newItemType.trim() })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to add item type");
            }

            const result = await response.json();
            toast.success(result.message);

            setNewItemType("");
            setShowAddItemModal(false);
            await fetchInventory(currentPage, searchTerm, selectedML, selectedItemType, statusFilter);
            await fetchItemTypes();
            await fetchAllInventory();

        } catch (error) {
            console.error("Error adding item type:", error);
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ============================================
    // BULK UPLOAD
    // ============================================
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const handleBulkUpload = async () => {
        try {
            if (!selectedFile) {
                toast.error("Please select a file");
                return;
            }

            const formData = new FormData();
            formData.append('file', selectedFile);

            setIsSubmitting(true);

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/bottles/bulk-upload`,
                {
                    method: "POST",
                    credentials: 'include',
                    body: formData
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Bulk upload failed");
            }

            const result = await response.json();

            if (result.success && result.success.details) {
                setBulkSuccessDetails(result.success.details);
                setBulkSuccessCount(result.success.count || 0);
            }

            if (result.errors && result.errors.details) {
                setBulkErrors(result.errors.details);
                setBulkErrorCount(result.errors.count || 0);
            }

            setBulkUploadId(result.bulkUploadId || "");
            setShowErrorModal(true);

            toast.success(result.message || "Bulk upload completed");

            setSelectedFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            setShowBulkUploadModal(false);
            await fetchInventory(currentPage, searchTerm, selectedML, selectedItemType, statusFilter);
            await fetchAlerts();
            await fetchAllInventory();

            setTransactionsByRowKey({});
            if (expandedRowKey) {
                const [mlSize, itemType] = expandedRowKey.split('__');
                fetchTransactionsForRow({ mlSize, itemType });
            }

        } catch (error) {
            console.error("Error in bulk upload:", error);
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDownloadErrorExcel = () => {
        try {
            if (!bulkErrors || bulkErrors.length === 0) {
                toast.error("No errors to download");
                return;
            }

            const errorData = bulkErrors.map(err => ({
                'ML Size': err.mlSize || '',
                'Item Type': err.itemType || '',
                'Quantity': err.quantity || '',
                'Purchase Price': err.purchasePrice || '',
                'Error Reason': err.error || 'Unknown error'
            }));

            const worksheetData = [
                ['ML Size', 'Item Type', 'Quantity', 'Purchase Price', 'Error Reason'],
                ...errorData.map(item => [item['ML Size'], item['Item Type'], item['Quantity'], item['Purchase Price'], item['Error Reason']])
            ];

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(worksheetData);

            ws['!cols'] = [
                { wch: 15 },
                { wch: 15 },
                { wch: 12 },
                { wch: 18 },
                { wch: 40 }
            ];

            XLSX.utils.book_append_sheet(wb, ws, 'Errors');

            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/octet-stream' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'bulk_upload_errors.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast.success("Error report downloaded successfully");

        } catch (error) {
            console.error("Error downloading error file:", error);
            toast.error("Failed to download error file");
        }
    };

    const handleDownloadTemplate = async () => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/bottles/download-template`,
                { credentials: 'include' }
            );

            if (!response.ok) throw new Error('Failed to download template');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'bottles_inventory_template.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error("Error downloading template:", error);
            toast.error("Failed to download template");
        }
    };

    // ============================================
    // FORMAT HELPERS
    // ============================================
    const getStockStatus = (quantity, minStock) => {
        if (quantity <= 0) return { status: 'empty', label: 'Empty' };
        if (quantity <= minStock) return { status: 'low', label: 'Low Stock' };
        return { status: 'healthy', label: 'In Stock' };
    };

    // ============================================
    // RENDER
    // ============================================
    return (
        <Navbar>
            <ToastContainer position="top-center" autoClose={3000} />
            <div className="bi-main">

                {/* Page Header */}
                <div className="bi-page-header">
                    <h2></h2>
                    <div className="bi-right-section">
                        <div className="bi-search-container">
                            <FaSearch className="bi-search-icon" />
                            <input
                                type="text"
                                placeholder="Search by ML or Item Type..."
                                value={searchTerm}
                                onChange={(e) => handleSearch(e.target.value)}
                                autoComplete="off"
                            />
                        </div>
                        <div className="bi-action-buttons-group">
                            <div className="bi-status-filter">
                                <FaFilter className="bi-filter-icon" />
                                <select
                                    value={statusFilter}
                                    onChange={(e) => handleStatusFilter(e.target.value)}
                                    className="bi-status-select"
                                >
                                    <option value="all">All Items</option>
                                    <option value="low">Low Stock</option>
                                    <option value="out-of-stock">Out of Stock</option>
                                </select>
                            </div>

                            <button
                                className="bi-alert-btn"
                                onClick={() => setShowAlertModal(true)}
                                title="View Stock Alerts"
                            >
                                <FaBell />
                                {alerts.length > 0 && <span className="bi-alert-badge">{alerts.length}</span>}
                            </button>
                            <button className="bi-add-ml-btn" onClick={() => setShowAddMLModal(true)}>
                                <FaPlus /> Add ML
                            </button>
                            <button className="bi-add-item-btn" onClick={() => setShowAddItemModal(true)}>
                                <FaPlus /> Add Item
                            </button>
                            <button className="bi-upload-btn" onClick={() => setShowBulkUploadModal(true)}>
                                <FaUpload /> Bulk Upload
                            </button>
                            <button
                                className="bi-export-btn"
                                onClick={handleExport}
                                disabled={isExporting}
                                title="Export to Excel"
                            >
                                <FaDownload /> {isExporting ? "Exporting..." : "Export"}
                            </button>
                            <button
                                className="bi-add-stock-btn"
                                onClick={openAddStockModal}
                                title="Add stock to an item"
                            >
                                <FaPlus /> Add Stock
                            </button>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bi-filters">
                    <div className="bi-filter-group">
                        <label>Filter by ML:</label>
                        <select
                            value={selectedML}
                            onChange={(e) => handleFilterChange(e.target.value, selectedItemType)}
                        >
                            <option value="">All ML Sizes</option>
                            {mlSizes.map(ml => (
                                <option key={ml} value={ml}>{ml}</option>
                            ))}
                        </select>
                    </div>
                    <div className="bi-filter-group">
                        <label>Filter by Item:</label>
                        <select
                            value={selectedItemType}
                            onChange={(e) => handleFilterChange(selectedML, e.target.value)}
                        >
                            <option value="">All Item Types</option>
                            {itemTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Inventory Table */}
                <div className="bi-data-table">
                    {isLoading ? (
                        <div className="bi-loading-container">
                            <div className="bi-loading-spinner large"></div>
                            <p>Loading inventory...</p>
                        </div>
                    ) : (
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: '34px' }}></th>
                                    <th>ML Size</th>
                                    <th>Item Type</th>
                                    <th>Quantity</th>
                                    <th>Min Stock</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredInventory.length === 0 ? (
                                    <tr>
                                        <td colSpan="6">
                                            <div className="bi-empty-state">
                                                <FaBox className="bi-empty-icon" />
                                                <p>No inventory found</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredInventory.map((item) => {
                                        const status = getStockStatus(item.quantity, item.minStock);
                                        const rowKey = getRowKey(item);
                                        const isExpanded = expandedRowKey === rowKey;

                                        return (
                                            <React.Fragment key={item._id || rowKey}>
                                                <tr
                                                    className={`bi-product-row ${isExpanded ? 'bi-row-expanded' : ''}`}
                                                    onClick={() => handleRowClick(item)}
                                                >
                                                    <td className="bi-expand-toggle-cell">
                                                        {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
                                                    </td>
                                                    <td className="bi-ml-cell">
                                                        <span className="bi-ml-cell-content">
                                                            {item.mlSize}
                                                        </span>
                                                    </td>
                                                    <td className="bi-item-cell">
                                                        <span className="bi-item-icon"><FaBox /></span>
                                                        {item.itemType}
                                                    </td>
                                                    <td className="bi-qty-cell">{item.quantity}</td>
                                                    <td className="bi-min-cell">{item.minStock}</td>
                                                    <td>
                                                        <span className={`bi-status-badge bi-status-${status.status}`}>
                                                            <span className="bi-status-dot"></span>
                                                            {status.label}
                                                        </span>
                                                    </td>
                                                </tr>

                                                {isExpanded && (
                                                    <>
                                                        <tr className="bi-transaction-row">
                                                            <td colSpan="6">
                                                                <TransactionPanel
                                                                    transactions={transactionsByRowKey[rowKey]}
                                                                    isLoading={loadingTransactionsKey === rowKey}
                                                                    onViewDisposal={() => fetchDisposalHistory(item)}
                                                                    hasDisposal={true}
                                                                    onViewAllTransactions={() => fetchFullTransactions(item.mlSize, item.itemType)}
                                                                />
                                                            </td>
                                                        </tr>

                                                        {showDisposalPanel && currentDisposalRowKey === rowKey && (
                                                            <tr className="bi-transaction-row">
                                                                <td colSpan="6">
                                                                    <DisposalHistoryPanel
                                                                        disposals={disposalData?.disposals || []}
                                                                        isLoading={loadingDisposal}
                                                                        onClose={() => {
                                                                            setShowDisposalPanel(false);
                                                                            setDisposalData(null);
                                                                            setCurrentDisposalRowKey(null);
                                                                        }}
                                                                    />
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </>
                                                )}
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination */}
                {!isLoading && pagination.totalPages > 0 && (
                    <div className="bi-pagination">
                        <div className="bi-pagination-info">
                            Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} items
                        </div>
                        <div className="bi-pagination-controls">
                            <button
                                className="bi-pagination-btn"
                                onClick={() => handlePageChange(pagination.page - 1)}
                                disabled={!pagination.hasPrevPage}
                            >
                                <FaChevronLeft />
                            </button>

                            <div className="bi-pagination-pages">
                                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                    let pageNum;
                                    if (pagination.totalPages <= 5) {
                                        pageNum = i + 1;
                                    } else if (pagination.page <= 3) {
                                        pageNum = i + 1;
                                    } else if (pagination.page >= pagination.totalPages - 2) {
                                        pageNum = pagination.totalPages - 4 + i;
                                    } else {
                                        pageNum = pagination.page - 2 + i;
                                    }

                                    return (
                                        <button
                                            key={pageNum}
                                            className={`bi-pagination-page ${pagination.page === pageNum ? 'bi-pagination-active' : ''}`}
                                            onClick={() => handlePageChange(pageNum)}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                className="bi-pagination-btn"
                                onClick={() => handlePageChange(pagination.page + 1)}
                                disabled={!pagination.hasNextPage}
                            >
                                <FaChevronRight />
                            </button>
                        </div>
                    </div>
                )}

                {/* Modals */}
                <AddStockModal
                    show={showAddStockModal}
                    onClose={() => setShowAddStockModal(false)}
                    mlSizes={mlSizes}
                    itemTypes={itemTypes}
                    addStockData={addStockData}
                    setAddStockData={setAddStockData}
                    isSubmitting={isSubmitting}
                    onSubmit={handleAddStock}
                    isLoadingItems={isLoadingAllInventory}
                />

                <AddMLModal
                    show={showAddMLModal}
                    onClose={() => setShowAddMLModal(false)}
                    newML={newML}
                    setNewML={setNewML}
                    isSubmitting={isSubmitting}
                    onSubmit={handleAddML}
                />

                <AddItemModal
                    show={showAddItemModal}
                    onClose={() => setShowAddItemModal(false)}
                    newItemType={newItemType}
                    setNewItemType={setNewItemType}
                    isSubmitting={isSubmitting}
                    onSubmit={handleAddItemType}
                />

                <BulkUploadModal
                    show={showBulkUploadModal}
                    onClose={() => setShowBulkUploadModal(false)}
                    fileInputRef={fileInputRef}
                    selectedFile={selectedFile}
                    onFileChange={handleFileChange}
                    onDownloadTemplate={handleDownloadTemplate}
                    isSubmitting={isSubmitting}
                    onSubmit={handleBulkUpload}
                />

                <ErrorModal
                    show={showErrorModal}
                    onClose={() => setShowErrorModal(false)}
                    bulkSuccessCount={bulkSuccessCount}
                    bulkErrorCount={bulkErrorCount}
                    bulkSuccessDetails={bulkSuccessDetails}
                    bulkErrors={bulkErrors}
                    onDownloadErrorExcel={handleDownloadErrorExcel}
                />

                <AlertModal
                    show={showAlertModal}
                    onClose={() => setShowAlertModal(false)}
                    alerts={alerts}
                />

                <FullTransactionModal
                    show={showFullTransactionModal}
                    onClose={() => {
                        setShowFullTransactionModal(false);
                        setFullTransactions([]);
                    }}
                    mlSize={fullTransactionMlSize}
                    itemType={fullTransactionItemType}
                    transactions={fullTransactions}
                    isLoading={loadingFullTransactions}
                    activeTab={fullTransactionActiveTab}
                    setActiveTab={setFullTransactionActiveTab}
                />

            </div>
        </Navbar>
    );
};

export default BottleInventory;