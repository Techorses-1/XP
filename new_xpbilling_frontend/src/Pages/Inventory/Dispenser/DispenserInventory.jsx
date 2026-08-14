import React, { useState, useEffect, useRef } from "react";
import { toast, ToastContainer } from "react-toastify";
import {
  FaBox, FaPlus, FaSearch, FaFileExcel,
  FaUpload, FaDownload, FaEdit, FaTrash,
  FaTimes, FaBell,
  FaCheckCircle, FaTimesCircle, FaMoneyBillWave,
  FaChevronDown, FaChevronUp, FaHistory, FaUser, FaCalendarAlt, FaArrowUp, FaArrowDown,
  FaChevronLeft, FaChevronRight, FaTag, FaClock, FaInfoCircle, FaTrashAlt,
  FaEye, FaFilter , FaToggleOff , FaToggleOn 
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Navbar from "../../../Components/Navbar/Navbar";
import "./DispenserInventory.scss";
import "react-toastify/dist/ReactToastify.css";
import * as XLSX from 'xlsx';
import Select from 'react-select';

// ============================================
// ADD PRODUCT MODAL
// ============================================
const AddProductModal = ({
  show, onClose, newProduct, setNewProduct,
  isSubmitting, onSubmit
}) => {
  if (!show) return null;

  return (
    <div className="di-modal-overlay" onClick={onClose}>
      <div className="di-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="di-modal-header">
          <div className="di-modal-title">
            <FaPlus /> Add Product
          </div>
          <button className="di-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="di-modal-body">
          <div className="di-form-row">
            <div className="di-form-field">
              <label>Product Name *</label>
              <input
                type="text"
                value={newProduct.productName}
                onChange={(e) => setNewProduct({ ...newProduct, productName: e.target.value })}
                placeholder="Enter product name"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="di-form-row">
            <div className="di-form-field">
              <label>Selling Price 3ml (₹/KG) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={newProduct.sellingPrice3ml}
                onChange={(e) => setNewProduct({ ...newProduct, sellingPrice3ml: e.target.value })}
                placeholder="Enter selling price for 3ml"
                autoComplete="off"
              />
            </div>
            <div className="di-form-field">
              <label>Selling Price 6ml (₹/KG) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={newProduct.sellingPrice6ml}
                onChange={(e) => setNewProduct({ ...newProduct, sellingPrice6ml: e.target.value })}
                placeholder="Enter selling price for 6ml"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="di-form-row">
            <div className="di-form-field">
              <label>Discount (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={newProduct.discount}
                onChange={(e) => setNewProduct({ ...newProduct, discount: e.target.value })}
                placeholder="Enter discount (0-100)"
                autoComplete="off"
              />
            </div>
          </div>
        </div>
        <div className="di-modal-footer">
          <button className="di-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="di-btn-primary"
            onClick={onSubmit}
            disabled={isSubmitting || !newProduct.productName.trim() || !newProduct.sellingPrice3ml || !newProduct.sellingPrice6ml}
          >
            {isSubmitting ? "Adding..." : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// ADD STOCK MODAL - UPDATED TO USE allProducts
// ============================================
const AddStockModal = ({
  show, onClose, products, addStockData, setAddStockData,
  isSubmitting, onSubmit, isLoadingProducts
}) => {
  if (!show) return null;

  const selectedProduct = products.find(p => p.dispenserId === addStockData.dispenserId);

  const productOptions = products.map(p => ({
    value: p.dispenserId,
    label: `${p.productName}`,
    product: p
  }));

  const handleProductSelect = (selectedOption) => {
    if (selectedOption) {
      const product = selectedOption.product;
      setAddStockData({
        ...addStockData,
        dispenserId: product.dispenserId,
        productName: product.productName,
        sellingPrice3ml: product.sellingPrice3ml || '',
        sellingPrice6ml: product.sellingPrice6ml || '',
        discount: product.discount || ''
      });
    } else {
      setAddStockData({
        ...addStockData,
        dispenserId: "",
        productName: "",
        sellingPrice3ml: "",
        sellingPrice6ml: "",
        discount: ""
      });
    }
  };

  const currentSelectedOption = productOptions.find(
    opt => opt.value === addStockData.dispenserId
  );

  const customSelectStyles = {
    control: (provided, state) => ({
      ...provided,
      border: '1.5px solid #e3e8f0',
      borderRadius: '8px',
      padding: '2px 2px',
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

  if (isLoadingProducts) {
    return (
      <div className="di-modal-overlay" onClick={onClose}>
        <div className="di-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="di-modal-header">
            <div className="di-modal-title">
              <FaPlus /> Add Stock
            </div>
            <button className="di-modal-close" onClick={onClose}>
              <FaTimes />
            </button>
          </div>
          <div className="di-modal-body">
            <div className="di-loading-products">
              <div className="di-loading-spinner small"></div>
              <p>Loading products...</p>
            </div>
          </div>
          <div className="di-modal-footer">
            <button className="di-btn-cancel" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="di-modal-overlay" onClick={onClose}>
      <div className="di-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="di-modal-header">
          <div className="di-modal-title">
            <FaPlus /> Add Stock
          </div>
          <button className="di-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="di-modal-body">
          <div className="di-form-row">
            <div className="di-form-field">
              <label>Search & Select Product *</label>
              <Select
                options={productOptions}
                value={currentSelectedOption}
                onChange={handleProductSelect}
                placeholder="🔍 Type to search products..."
                isClearable
                styles={customSelectStyles}
                noOptionsMessage={() => "No products found"}
                isDisabled={isSubmitting}
              />
            </div>
          </div>

          {selectedProduct && (
            <div className="di-current-stock-info">
              <span>Current Stock: <strong>{selectedProduct.quantity} KG</strong></span>
              <span>Avg Price: <strong>₹{selectedProduct.avgPurchasePrice?.toFixed(2) || '0.00'}/KG</strong></span>
              <span>Selling Price 3ml: <strong>₹{selectedProduct.sellingPrice3ml}/KG</strong></span>
              <span>Selling Price 6ml: <strong>₹{selectedProduct.sellingPrice6ml}/KG</strong></span>
              <span>Discount: <strong>{selectedProduct.discount || 0}%</strong></span>
            </div>
          )}

          <div className="di-form-row">
            <div className="di-form-field">
              <label>Quantity (KG) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={addStockData.quantity}
                onChange={(e) => setAddStockData({ ...addStockData, quantity: e.target.value })}
                placeholder="Enter quantity in KG"
                autoComplete="off"
                disabled={isSubmitting}
              />
            </div>
            <div className="di-form-field">
              <label>Purchase Price (₹/KG) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={addStockData.purchasePrice}
                onChange={(e) => setAddStockData({ ...addStockData, purchasePrice: e.target.value })}
                placeholder="Enter price per KG"
                autoComplete="off"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="di-form-row">
            <div className="di-form-field">
              <label>Notes (Optional)</label>
              <input
                type="text"
                value={addStockData.notes}
                onChange={(e) => setAddStockData({ ...addStockData, notes: e.target.value })}
                placeholder="Add notes..."
                autoComplete="off"
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>
        <div className="di-modal-footer">
          <button className="di-btn-cancel" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className="di-btn-primary"
            onClick={onSubmit}
            disabled={isSubmitting || !addStockData.dispenserId || !addStockData.quantity || !addStockData.purchasePrice}
          >
            {isSubmitting ? "Adding..." : "Add Stock"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// EDIT PRODUCT MODAL
// ============================================
const EditProductModal = ({
  show, onClose, editData, setEditData,
  isSubmitting, onSubmit
}) => {
  if (!show) return null;

  return (
    <div className="di-modal-overlay" onClick={onClose}>
      <div className="di-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="di-modal-header">
          <div className="di-modal-title">
            <FaEdit /> Edit Product
          </div>
          <button className="di-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="di-modal-body">
          <div className="di-form-row">
            <div className="di-form-field">
              <label>Product Name *</label>
              <input
                type="text"
                value={editData.productName}
                onChange={(e) => setEditData({ ...editData, productName: e.target.value })}
                placeholder="Enter product name"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="di-form-row">
            <div className="di-form-field">
              <label>Selling Price 3ml (₹/KG) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={editData.sellingPrice3ml}
                onChange={(e) => setEditData({ ...editData, sellingPrice3ml: e.target.value })}
                placeholder="Enter selling price for 3ml"
                autoComplete="off"
              />
            </div>
            <div className="di-form-field">
              <label>Selling Price 6ml (₹/KG) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={editData.sellingPrice6ml}
                onChange={(e) => setEditData({ ...editData, sellingPrice6ml: e.target.value })}
                placeholder="Enter selling price for 6ml"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="di-form-row">
            <div className="di-form-field">
              <label>Discount (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={editData.discount}
                onChange={(e) => setEditData({ ...editData, discount: e.target.value })}
                placeholder="Enter discount (0-100)"
                autoComplete="off"
              />
            </div>
          </div>
        </div>
        <div className="di-modal-footer">
          <button className="di-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="di-btn-primary"
            onClick={onSubmit}
            disabled={isSubmitting || !editData.productName.trim() || !editData.sellingPrice3ml || !editData.sellingPrice6ml}
          >
            {isSubmitting ? "Updating..." : "Update Product"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// BULK UPLOAD MODAL
// ============================================
const BulkUploadModal = ({
  show, onClose, fileInputRef, selectedFile, onFileChange,
  onDownloadTemplate, isSubmitting, onSubmit, uploadType,
  setUploadType
}) => {
  if (!show) return null;

  return (
    <div className="di-modal-overlay" onClick={onClose}>
      <div className="di-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="di-modal-header">
          <div className="di-modal-title">
            <FaUpload /> Bulk Upload
          </div>
          <button className="di-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="di-modal-body">
          <div className="di-upload-area">
            <div className="di-form-row">
              <div className="di-form-field">
                <label>Upload Type *</label>
                <select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                >
                  <option value="products">Products (Name + Selling Prices + Discount)</option>
                  <option value="inventory">Inventory (Name + Qty + Purchase Price)</option>
                </select>
              </div>
            </div>

            <p className="di-upload-hint">
              {uploadType === 'products'
                ? 'File should have columns: Product Name, Selling Price 3ml, Selling Price 6ml, Discount (optional)'
                : 'File should have columns: Product Name, Quantity, Purchase Price'}
            </p>

            <div className="di-file-drop">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={onFileChange}
              />
              {selectedFile && (
                <div className="di-file-info">
                  <FaFileExcel /> {selectedFile.name}
                </div>
              )}
            </div>

            <button className="di-btn-download" onClick={onDownloadTemplate}>
              <FaDownload /> Download Template
            </button>
          </div>
        </div>
        <div className="di-modal-footer">
          <button className="di-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="di-btn-primary"
            onClick={onSubmit}
            disabled={isSubmitting || !selectedFile}
          >
            {isSubmitting ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// ERROR MODAL
// ============================================
const ErrorModal = ({
  show, onClose, bulkSuccessCount, bulkErrorCount,
  bulkSuccessDetails, bulkErrors, onDownloadErrorExcel
}) => {
  if (!show) return null;

  const hasErrors = bulkErrors && bulkErrors.length > 0;
  const hasSuccess = bulkSuccessCount > 0;

  return (
    <div className="di-modal-overlay" onClick={onClose}>
      <div className="di-modal-content di-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="di-modal-header">
          <div className="di-modal-title">
            <FaFileExcel /> Bulk Upload Results
          </div>
          <button className="di-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="di-modal-body">
          <div className="di-upload-summary">
            <div className="di-summary-success">
              <FaCheckCircle />
              <strong>Success:</strong> {bulkSuccessCount} items added
            </div>
            <div className={`di-summary-error ${hasErrors ? 'has-errors' : 'no-errors'}`}>
              <FaTimesCircle />
              <strong>Failed:</strong> {bulkErrorCount} items
            </div>
          </div>

          {hasSuccess && bulkSuccessDetails && bulkSuccessDetails.length > 0 && (
            <div className="di-result-section">
              <h4 className="di-result-heading di-result-success">
                <FaCheckCircle /> Successfully Added ({bulkSuccessDetails.length})
              </h4>
              <div className="di-result-table-wrap">
                <table className="di-result-table di-success-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Product Name</th>
                      {bulkSuccessDetails[0]?.quantity !== undefined ? (
                        <>
                          <th>Quantity</th>
                          <th>Purchase Price</th>
                          <th>New Stock</th>
                        </>
                      ) : (
                        <>
                          <th>Selling Price 3ml</th>
                          <th>Selling Price 6ml</th>
                          <th>Discount</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkSuccessDetails.map((item, index) => (
                      <tr key={index}>
                        <td>{item.row}</td>
                        <td>{item.productName}</td>
                        {item.quantity !== undefined ? (
                          <>
                            <td>{item.quantity} KG</td>
                            <td>₹{item.purchasePrice}/KG</td>
                            <td className="di-success-cell">{item.newStock} KG</td>
                          </>
                        ) : (
                          <>
                            <td className="di-success-cell">₹{item.sellingPrice3ml}/KG</td>
                            <td className="di-success-cell">₹{item.sellingPrice6ml}/KG</td>
                            <td className="di-success-cell">{item.discount || 0}%</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {hasErrors && (
            <div className="di-result-section">
              <h4 className="di-result-heading di-result-error">
                <FaTimesCircle /> Failed ({bulkErrors.length})
              </h4>
              <div className="di-result-table-wrap">
                <table className="di-result-table di-error-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Product Name</th>
                      {bulkErrors[0]?.quantity !== undefined ? (
                        <>
                          <th>Quantity</th>
                          <th>Purchase Price</th>
                        </>
                      ) : (
                        <>
                          <th>Selling Price 3ml</th>
                          <th>Selling Price 6ml</th>
                          <th>Discount</th>
                        </>
                      )}
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkErrors.map((err, index) => (
                      <tr key={index}>
                        <td>{err.row}</td>
                        <td>{err.productName || '-'}</td>
                        {err.quantity !== undefined ? (
                          <>
                            <td>{err.quantity || '-'}</td>
                            <td>{err.purchasePrice || '-'}</td>
                          </>
                        ) : (
                          <>
                            <td>{err.sellingPrice3ml || '-'}</td>
                            <td>{err.sellingPrice6ml || '-'}</td>
                            <td>{err.discount !== undefined ? err.discount : '-'}</td>
                          </>
                        )}
                        <td className="di-error-cell">{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {hasErrors && (
            <button className="di-btn-download-error" onClick={onDownloadErrorExcel}>
              <FaDownload /> Download Error Report
            </button>
          )}
        </div>
        <div className="di-modal-footer">
          <button className="di-btn-primary" onClick={onClose}>
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
    <div className="di-modal-overlay" onClick={onClose}>
      <div className="di-modal-content di-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="di-modal-header">
          <div className="di-modal-title">
            <FaBell /> Stock Alerts
          </div>
          <button className="di-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="di-modal-body">
          {alerts.length === 0 ? (
            <div className="di-alert-empty-state">
              <FaBell />
              <p>All stock levels are healthy!</p>
            </div>
          ) : (
            <>
              {emptyItems.length > 0 && (
                <div className="di-alert-section">
                  <h4 className="di-alert-heading-empty">Empty Stock (0)</h4>
                  <div className="di-alert-list">
                    {emptyItems.map((item, index) => (
                      <div key={index} className="di-alert-item di-alert-empty">
                        <span>{item.productName}</span>
                        <span>Quantity: {item.quantity} KG</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {lowStockItems.length > 0 && (
                <div className="di-alert-section">
                  <h4 className="di-alert-heading-low">Low Stock (Below {alerts[0]?.minStock || 5} KG)</h4>
                  <div className="di-alert-list">
                    {lowStockItems.map((item, index) => (
                      <div key={index} className="di-alert-item di-alert-low">
                        <span>{item.productName}</span>
                        <span>Quantity: {item.quantity} KG / Min: {item.minStock} KG</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="di-modal-footer">
          <button className="di-btn-primary" onClick={onClose}>
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
const DeleteConfirmModal = ({ show, onClose, product, onConfirm, isDeleting }) => {
  if (!show || !product) return null;

  return (
    <div className="di-modal-overlay" onClick={onClose}>
      <div className="di-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="di-modal-header di-modal-header-danger">
          <div className="di-modal-title">
            <FaTrash /> Confirm Delete
          </div>
          <button className="di-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="di-modal-body">
          <div className="di-delete-body">
            <div className="di-delete-icon">
              <FaTrash />
            </div>
            <h3>Are you sure?</h3>
            <p>
              You are about to delete <strong>"{product.productName}"</strong>.
              This will also delete all stock and transaction history for this product.
              <br /><br />
              <strong style={{ color: '#dc3545' }}>This action cannot be undone!</strong>
            </p>
          </div>
        </div>
        <div className="di-modal-footer">
          <button className="di-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="di-btn-delete"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Permanently"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// DISPOSAL HISTORY PANEL
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
      <div className="di-disposal-panel">
        <div className="di-disposal-loading">
          <div className="di-loading-spinner tiny"></div>
          Loading disposal history...
        </div>
      </div>
    );
  }

  if (!disposals || disposals.length === 0) {
    return (
      <div className="di-disposal-panel">
        <div className="di-disposal-header">
          <h5><FaTrashAlt /> Disposal History</h5>
          <button className="di-disposal-close-btn" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="di-disposal-empty">No disposal records found for this product.</div>
      </div>
    );
  }

  return (
    <div className="di-disposal-panel">
      <div className="di-disposal-header">
        <h5><FaTrashAlt /> Disposal History ({disposals.length})</h5>
        <button className="di-disposal-close-btn" onClick={onClose}>
          <FaTimes />
        </button>
      </div>
      <div className="di-disposal-list">
        {disposals.map((d, idx) => {
          const { date, time } = formatDateTime(d.disposedAt);
          return (
            <div key={d.disposalEntryId || idx} className="di-disposal-item">
              <div className="di-disposal-row">
                <span className="di-disposal-label"><FaUser /> Disposed By:</span>
                <span className="di-disposal-value">{d.performedBy?.userName || 'Unknown'}</span>

                <span className="di-disposal-separator">|</span>

                <span className="di-disposal-label"><FaTag /> Reason:</span>
                <span className="di-disposal-value di-disposal-reason">{d.reason || 'N/A'}</span>

                <span className="di-disposal-separator">|</span>

                <span className="di-disposal-label"><FaCalendarAlt /> Date:</span>
                <span className="di-disposal-value">{date}</span>

                <span className="di-disposal-separator">|</span>

                <span className="di-disposal-label"><FaClock /> Time:</span>
                <span className="di-disposal-value">{time}</span>

                <span className="di-disposal-separator">|</span>

                <span className="di-disposal-label"><FaTrashAlt /> Quantity:</span>
                <span className="di-disposal-value di-disposal-qty">-{d.disposedQuantity} KG</span>

                {d.notes && (
                  <>
                    <span className="di-disposal-separator">|</span>
                    <span className="di-disposal-label"><FaInfoCircle /> Notes:</span>
                    <span className="di-disposal-value">{d.notes}</span>
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
// FULL TRANSACTION MODAL (IN + OUT with Toggle)
// ============================================
const FullTransactionModal = ({
  show, onClose, productName, transactions, isLoading,
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
    <div className="di-modal-overlay" onClick={onClose}>
      <div className="di-modal-content di-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="di-modal-header">
          <div className="di-modal-title">
            <FaHistory /> Transaction History - {productName || 'Product'}
          </div>
          <button className="di-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="di-modal-body">
          {isLoading ? (
            <div className="di-transaction-loading">
              <div className="di-loading-spinner large"></div>
              <p>Loading transactions...</p>
            </div>
          ) : transactions?.length === 0 ? (
            <div className="di-transaction-empty">No transactions found for this product.</div>
          ) : (
            <>
              <div className="di-transaction-tabs">
                <button
                  className={`di-tab-btn ${activeTab === 'in' ? 'di-tab-active' : ''}`}
                  onClick={() => setActiveTab('in')}
                >
                  <FaArrowUp /> IN ({inTransactions.length})
                </button>
                <button
                  className={`di-tab-btn ${activeTab === 'out' ? 'di-tab-active' : ''}`}
                  onClick={() => setActiveTab('out')}
                >
                  <FaArrowDown /> OUT ({outTransactions.length})
                </button>
              </div>

              <div className="di-full-transaction-list">
                {currentTransactions.length === 0 ? (
                  <div className="di-transaction-empty">
                    No {activeTab === 'in' ? 'IN' : 'OUT'} transactions found.
                  </div>
                ) : (
                  currentTransactions.map((t, idx) => {
                    const isIn = t.transactionType === 'IN';
                    const reasonLabel = getReasonLabel(t.reason, t.bulkUploadId);

                    return (
                      <div key={t.transactionId || idx} className={`di-full-txn-item ${isIn ? 'di-txn-in' : 'di-txn-out'}`}>
                        <div className="di-full-txn-header">
                          <span className="di-full-txn-type">
                            {isIn ? <FaArrowUp className="di-txn-in-icon" /> : <FaArrowDown className="di-txn-out-icon" />}
                            {isIn ? '+' : '-'}{t.quantity} KG
                          </span>
                          <span className="di-full-txn-reason">{reasonLabel}</span>
                          <span className="di-full-txn-date">
                            <FaCalendarAlt /> {formatDate(t.createdAt)}
                          </span>
                          <span className="di-full-txn-time">
                            <FaClock /> {formatTime(t.createdAt)}
                          </span>
                        </div>
                        <div className="di-full-txn-details">
                          <div className="di-full-txn-row">
                            <span className="di-full-txn-label">Performed By:</span>
                            <span className="di-full-txn-value">{t.performedBy?.userName || 'Unknown'}</span>
                          </div>
                          {isIn && (
                            <>
                              <div className="di-full-txn-row">
                                <span className="di-full-txn-label">Purchase Price:</span>
                                <span className="di-full-txn-value">₹{t.purchasePrice?.toFixed(2) || '0.00'}/KG</span>
                              </div>
                              <div className="di-full-txn-row">
                                <span className="di-full-txn-label">Selling Price 3ml:</span>
                                <span className="di-full-txn-value">₹{t.sellingPrice3ml?.toFixed(2) || '0.00'}/KG</span>
                              </div>
                              <div className="di-full-txn-row">
                                <span className="di-full-txn-label">Selling Price 6ml:</span>
                                <span className="di-full-txn-value">₹{t.sellingPrice6ml?.toFixed(2) || '0.00'}/KG</span>
                              </div>
                              <div className="di-full-txn-row">
                                <span className="di-full-txn-label">Discount:</span>
                                <span className="di-full-txn-value">{t.discount || 0}%</span>
                              </div>
                            </>
                          )}
                          <div className="di-full-txn-row">
                            <span className="di-full-txn-label">Stock Change:</span>
                            <span className="di-full-txn-value">
                              {t.previousStock?.toFixed(2)} → <strong>{t.newStock?.toFixed(2)}</strong> KG
                            </span>
                          </div>
                          {t.notes && (
                            <div className="di-full-txn-row">
                              <span className="di-full-txn-label">Notes:</span>
                              <span className="di-full-txn-value">{t.notes}</span>
                            </div>
                          )}
                          {t.bulkUploadId && (
                            <div className="di-full-txn-row">
                              <span className="di-full-txn-label">Bulk Upload ID:</span>
                              <span className="di-full-txn-value di-txn-bulk-id">{t.bulkUploadId}</span>
                            </div>
                          )}
                          {t.reason && t.reason.includes('Invoice') && (
                            <div className="di-full-txn-row">
                              <span className="di-full-txn-label">Invoice Related:</span>
                              <span className="di-full-txn-value di-txn-invoice-tag">Yes</span>
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
        <div className="di-modal-footer">
          <button className="di-btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// TRANSACTION HISTORY ROW
// ============================================
const TransactionHistoryRow = ({
  colSpan,
  isLoading,
  transactions,
  onViewDisposal,
  hasDisposal,
  onViewAllTransactions
}) => {
  const formatDateTime = (dateString) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    return {
      date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const inTransactions = transactions?.filter(t => t.transactionType === 'IN') || [];

  if (isLoading) {
    return (
      <tr className="di-expand-row">
        <td colSpan={colSpan}>
          <div className="di-expand-content">
            <div className="di-expand-loading">
              <div className="di-loading-spinner small"></div>
              <span>Loading transaction history...</span>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  if (inTransactions.length === 0) {
    return (
      <tr className="di-expand-row">
        <td colSpan={colSpan}>
          <div className="di-expand-content">
            <div className="di-expand-title">
              <FaHistory /> Stock Added History (IN Transactions)
              <div className="di-expand-actions">
                {hasDisposal && (
                  <button className="di-view-disposal-btn" onClick={onViewDisposal}>
                    <FaTrashAlt /> View Disposals
                  </button>
                )}
                <button className="di-view-all-transactions-btn" onClick={onViewAllTransactions}>
                  <FaEye /> View All Transactions
                </button>
              </div>
            </div>
            <div className="di-expand-empty">
              <FaHistory className="di-expand-empty-icon" />
              <p>No stock has been added for this product yet</p>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="di-expand-row">
      <td colSpan={colSpan}>
        <div className="di-expand-content">
          <div className="di-expand-title">
            <FaHistory /> Stock Added History (IN Transactions) - {inTransactions.length}
            <div className="di-expand-actions">
              {hasDisposal && (
                <button className="di-view-disposal-btn" onClick={onViewDisposal}>
                  <FaTrashAlt /> View Disposals
                </button>
              )}
              <button className="di-view-all-transactions-btn" onClick={onViewAllTransactions}>
                <FaEye /> View All Transactions
              </button>
            </div>
          </div>

          <div className="di-transaction-list">
            {inTransactions.map((t, idx) => {
              const { date, time } = formatDateTime(t.createdAt);
              const isBulk = t.bulkUploadId && t.bulkUploadId !== '';
              const reasonLabel = isBulk ? 'Bulk Upload' : t.reason || 'Manual Add';

              return (
                <div key={t.transactionId || idx} className="di-transaction-item">
                  <div className="di-transaction-row">
                    <span className="di-txn-label"><FaArrowUp /> Quantity:</span>
                    <span className="di-txn-value di-txn-qty">+{t.quantity} KG</span>

                    <span className="di-txn-separator">|</span>

                    <span className="di-txn-label"><FaMoneyBillWave /> Price:</span>
                    <span className="di-txn-value di-txn-price">₹{t.purchasePrice?.toFixed(2) || '0.00'}/KG</span>

                    <span className="di-txn-separator">|</span>

                    <span className="di-txn-label"><FaBox /> Stock:</span>
                    <span className="di-txn-value di-txn-stock">{t.previousStock} → <strong>{t.newStock}</strong> KG</span>

                    <span className="di-txn-separator">|</span>

                    <span className="di-txn-label"><FaUser /> Name:</span>
                    <span className="di-txn-value">{t.performedBy?.userName || 'Unknown'}</span>

                    <span className="di-txn-separator">|</span>

                    <span className="di-txn-label"><FaCalendarAlt /> Date:</span>
                    <span className="di-txn-value">{date} - {time}</span>

                    <span className="di-txn-separator">|</span>

                    <span className="di-txn-label"><FaTag /> Reason:</span>
                    <span className="di-txn-value di-txn-reason">{reasonLabel}</span>

                    {t.notes && (
                      <>
                        <span className="di-txn-separator">|</span>
                        <span className="di-txn-label"><FaInfoCircle /> Notes:</span>
                        <span className="di-txn-value">{t.notes}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </td>
    </tr>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================
const DispenserInventory = () => {
  const [inventory, setInventory] = useState([]);
  const [filteredInventory, setFilteredInventory] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [isLoadingAllProducts, setIsLoadingAllProducts] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // ✅ NEW: Status filter
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false); // ✅ NEW

  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  const navigate = useNavigate();

  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [newProduct, setNewProduct] = useState({ productName: "", sellingPrice3ml: "", sellingPrice6ml: "", discount: "0" });
  const [editData, setEditData] = useState({ dispenserId: "", productName: "", sellingPrice3ml: "", sellingPrice6ml: "", discount: "0" });
  const [addStockData, setAddStockData] = useState({
    dispenserId: "",
    productName: "",
    sellingPrice3ml: "",
    sellingPrice6ml: "",
    discount: "",
    quantity: "",
    purchasePrice: "",
    notes: ""
  });

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadType, setUploadType] = useState("products");
  const [bulkErrors, setBulkErrors] = useState([]);
  const [bulkSuccessCount, setBulkSuccessCount] = useState(0);
  const [bulkErrorCount, setBulkErrorCount] = useState(0);
  const [bulkSuccessDetails, setBulkSuccessDetails] = useState([]);
  const [bulkUploadId, setBulkUploadId] = useState("");

  const [expandedRowId, setExpandedRowId] = useState(null);
  const [transactionCache, setTransactionCache] = useState({});
  const [loadingTransactionsFor, setLoadingTransactionsFor] = useState(null);

  const [showDisposalPanel, setShowDisposalPanel] = useState(false);
  const [disposalData, setDisposalData] = useState(null);
  const [loadingDisposal, setLoadingDisposal] = useState(false);
  const [currentDisposalDispenserId, setCurrentDisposalDispenserId] = useState(null);

  const [showFullTransactionModal, setShowFullTransactionModal] = useState(false);
  const [fullTransactions, setFullTransactions] = useState([]);
  const [loadingFullTransactions, setLoadingFullTransactions] = useState(false);
  const [fullTransactionProductName, setFullTransactionProductName] = useState('');
  const [fullTransactionDispenserId, setFullTransactionDispenserId] = useState('');
  const [fullTransactionActiveTab, setFullTransactionActiveTab] = useState('in');


  const [showML, setShowML] = useState(false);

  const fileInputRef = useRef(null);

  // ============================================
  // FETCH ALL PRODUCTS FOR DROPDOWN
  // ============================================
  const fetchAllProducts = async () => {
    try {
      setIsLoadingAllProducts(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dispenser/get-all?limit=9999&search=`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch all products');
      }

      const data = await response.json();
      setAllProducts(data.products || []);
    } catch (error) {
      console.error("Error fetching all products:", error);
      toast.error("Failed to load products");
      setAllProducts([]);
    } finally {
      setIsLoadingAllProducts(false);
    }
  };

  // ============================================
  // FETCH DATA WITH PAGINATION
  // ============================================
  const fetchInventory = async (page = 1, search = '', status = 'all') => {
    try {
      setIsLoading(true);
      const queryParams = new URLSearchParams({
        page: page,
        limit: 20,
        search: search
      });

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dispenser/get-all?${queryParams}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        if (response.status === 401) navigate('/login');
        throw new Error('Failed to fetch inventory');
      }

      const data = await response.json();

      let products = data.products || [];

      if (status === 'low') {
        products = products.filter(p => p.quantity > 0 && p.quantity <= (p.minStock || 5));
      } else if (status === 'out-of-stock') {
        products = products.filter(p => p.quantity === 0);
      }

      setInventory(products);
      setFilteredInventory(products);
      setPagination({
        ...data.pagination,
        total: products.length,
        totalPages: Math.ceil(products.length / 20)
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

  const fetchAlerts = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dispenser/get-alerts?page=1&limit=100`,
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
    fetchInventory(1, '', statusFilter);
    fetchAlerts();
    fetchAllProducts();
  }, []);

  // ============================================
  // HANDLE SEARCH
  // ============================================
  const handleSearch = (term) => {
    setSearchTerm(term);
    fetchInventory(1, term, statusFilter);
  };

  // ============================================
  // HANDLE STATUS FILTER
  // ============================================
  const handleStatusFilter = (status) => {
    setStatusFilter(status);
    fetchInventory(1, searchTerm, status);
  };

  // ============================================
  // HANDLE PAGE CHANGE
  // ============================================
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    setCurrentPage(newPage);
    fetchInventory(newPage, searchTerm, statusFilter);
  };

  // ============================================
  // ✅ EXPORT TO EXCEL
  // ============================================
  const handleExport = async () => {
    try {
      setIsExporting(true);

      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dispenser/export?${params}`,
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
      a.download = `dispenser_inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`;
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
  // FETCH TRANSACTIONS
  // ============================================
  const fetchTransactionsForProduct = async (dispenserId) => {
    try {
      setLoadingTransactionsFor(dispenserId);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dispenser/get-transactions?dispenserId=${dispenserId}&limit=200&page=1&hideInvoice=true`,
        { credentials: 'include' }
      );

      if (!response.ok) throw new Error('Failed to fetch transaction history');

      const data = await response.json();

      setTransactionCache(prev => ({
        ...prev,
        [dispenserId]: data.transactions || []
      }));
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast.error("Failed to load transaction history");
      setTransactionCache(prev => ({
        ...prev,
        [dispenserId]: []
      }));
    } finally {
      setLoadingTransactionsFor(null);
    }
  };

  const fetchFullTransactions = async (dispenserId, productName) => {
    try {
      setLoadingFullTransactions(true);
      setFullTransactionProductName(productName);
      setFullTransactionDispenserId(dispenserId);
      setFullTransactionActiveTab('in');

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dispenser/get-transactions?dispenserId=${dispenserId}&limit=500&page=1&hideInvoice=false`,
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

  const fetchDisposalHistory = async (dispenserId) => {
    try {
      setLoadingDisposal(true);
      setCurrentDisposalDispenserId(dispenserId);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/disposal/get-by-product/${dispenserId}`,
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

  const handleToggleRow = async (dispenserId) => {
    if (expandedRowId === dispenserId) {
      setExpandedRowId(null);
      setShowDisposalPanel(false);
      setDisposalData(null);
      return;
    }

    setExpandedRowId(dispenserId);

    if (!transactionCache[dispenserId]) {
      await fetchTransactionsForProduct(dispenserId);
    }
  };

  // Helper functions
  const getStockInML = (quantity) => {
    return quantity * 1000;  // 1 KG = 1000 ml
  };


  const getStockDisplay = (quantity, showML) => {
    if (showML) {
      return { value: getStockInML(quantity), unit: 'ml' };
    } else {
      return { value: quantity, unit: 'KG' };
    }
  };
  // ============================================
  // CREATE PRODUCT
  // ============================================
  const handleCreateProduct = async () => {
    try {
      if (!newProduct.productName.trim()) {
        toast.error("Product name is required");
        return;
      }

      if (!newProduct.sellingPrice3ml || parseFloat(newProduct.sellingPrice3ml) <= 0) {
        toast.error("Please enter valid 3ml selling price");
        return;
      }

      if (!newProduct.sellingPrice6ml || parseFloat(newProduct.sellingPrice6ml) <= 0) {
        toast.error("Please enter valid 6ml selling price");
        return;
      }

      const discountValue = parseFloat(newProduct.discount) || 0;
      if (discountValue < 0 || discountValue > 100) {
        toast.error("Discount must be between 0 and 100");
        return;
      }

      setIsSubmitting(true);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dispenser/create-product`,
        {
          method: "POST",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName: newProduct.productName.trim(),
            sellingPrice3ml: parseFloat(newProduct.sellingPrice3ml),
            sellingPrice6ml: parseFloat(newProduct.sellingPrice6ml),
            discount: discountValue
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create product");
      }

      const result = await response.json();
      toast.success(result.message);

      setNewProduct({ productName: "", sellingPrice3ml: "", sellingPrice6ml: "", discount: "0" });
      setShowAddProductModal(false);
      await fetchInventory(currentPage, searchTerm, statusFilter);
      await fetchAlerts();
      await fetchAllProducts();

    } catch (error) {
      console.error("Error creating product:", error);
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // ADD STOCK
  // ============================================
  const handleAddStock = async () => {
    try {
      if (!addStockData.dispenserId) {
        toast.error("Please select a product");
        return;
      }

      if (!addStockData.quantity || parseFloat(addStockData.quantity) <= 0) {
        toast.error("Please enter valid quantity");
        return;
      }

      if (!addStockData.purchasePrice || parseFloat(addStockData.purchasePrice) <= 0) {
        toast.error("Please enter valid purchase price");
        return;
      }

      setIsSubmitting(true);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dispenser/add-stock`,
        {
          method: "POST",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName: addStockData.productName,
            quantity: parseFloat(addStockData.quantity),
            purchasePrice: parseFloat(addStockData.purchasePrice),
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

      const updatedDispenserId = addStockData.dispenserId;

      setAddStockData({
        dispenserId: "",
        productName: "",
        sellingPrice3ml: "",
        sellingPrice6ml: "",
        discount: "",
        quantity: "",
        purchasePrice: "",
        notes: ""
      });
      setShowAddStockModal(false);
      await fetchInventory(currentPage, searchTerm, statusFilter);
      await fetchAlerts();
      await fetchAllProducts();

      if (expandedRowId === updatedDispenserId) {
        fetchTransactionsForProduct(updatedDispenserId);
      }

    } catch (error) {
      console.error("Error adding stock:", error);
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // UPDATE PRODUCT
  // ============================================
  const handleUpdateProduct = async () => {
    try {
      if (!editData.productName.trim()) {
        toast.error("Product name is required");
        return;
      }

      if (!editData.sellingPrice3ml || parseFloat(editData.sellingPrice3ml) <= 0) {
        toast.error("Please enter valid 3ml selling price");
        return;
      }

      if (!editData.sellingPrice6ml || parseFloat(editData.sellingPrice6ml) <= 0) {
        toast.error("Please enter valid 6ml selling price");
        return;
      }

      const discountValue = parseFloat(editData.discount) || 0;
      if (discountValue < 0 || discountValue > 100) {
        toast.error("Discount must be between 0 and 100");
        return;
      }

      setIsSubmitting(true);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dispenser/update/${editData.dispenserId}`,
        {
          method: "PUT",
          credentials: 'include',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName: editData.productName.trim(),
            sellingPrice3ml: parseFloat(editData.sellingPrice3ml),
            sellingPrice6ml: parseFloat(editData.sellingPrice6ml),
            discount: discountValue
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update product");
      }

      const result = await response.json();
      toast.success(result.message);

      setEditData({ dispenserId: "", productName: "", sellingPrice3ml: "", sellingPrice6ml: "", discount: "0" });
      setShowEditModal(false);
      setSelectedProduct(null);
      await fetchInventory(currentPage, searchTerm, statusFilter);
      await fetchAllProducts();

    } catch (error) {
      console.error("Error updating product:", error);
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // DELETE PRODUCT
  // ============================================
  const handleDeleteProduct = async () => {
    if (!selectedProduct) return;

    try {
      setIsDeleting(true);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dispenser/delete/${selectedProduct.dispenserId}`,
        {
          method: "DELETE",
          credentials: 'include'
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete product");
      }

      const result = await response.json();
      toast.success(result.message);

      if (expandedRowId === selectedProduct.dispenserId) {
        setExpandedRowId(null);
        setShowDisposalPanel(false);
        setDisposalData(null);
      }

      setShowDeleteModal(false);
      setSelectedProduct(null);
      await fetchInventory(currentPage, searchTerm, statusFilter);
      await fetchAlerts();
      await fetchAllProducts();

    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error(error.message);
    } finally {
      setIsDeleting(false);
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

      const endpoint = uploadType === 'products'
        ? `${import.meta.env.VITE_API_URL}/dispenser/bulk-upload-products`
        : `${import.meta.env.VITE_API_URL}/dispenser/bulk-upload-inventory`;

      const response = await fetch(endpoint, {
        method: "POST",
        credentials: 'include',
        body: formData
      });

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
      await fetchInventory(currentPage, searchTerm, statusFilter);
      await fetchAlerts();
      await fetchAllProducts();

      if (expandedRowId) {
        fetchTransactionsForProduct(expandedRowId);
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
        'Row': err.row || '',
        'Product Name': err.productName || '',
        'Selling Price 3ml': err.sellingPrice3ml || '',
        'Selling Price 6ml': err.sellingPrice6ml || '',
        'Discount (%)': err.discount || '',
        'Error Reason': err.error || 'Unknown error'
      }));

      const worksheetData = [
        ['Row', 'Product Name', 'Selling Price 3ml', 'Selling Price 6ml', 'Discount (%)', 'Error Reason'],
        ...errorData.map(item => [
          item['Row'],
          item['Product Name'],
          item['Selling Price 3ml'],
          item['Selling Price 6ml'],
          item['Discount (%)'],
          item['Error Reason']
        ])
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(worksheetData);
      ws['!cols'] = [
        { wch: 8 },
        { wch: 35 },
        { wch: 15 },
        { wch: 15 },
        { wch: 12 },
        { wch: 50 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Errors');

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dispenser_bulk_upload_errors.xlsx';
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
        `${import.meta.env.VITE_API_URL}/dispenser/download-template/${uploadType}`,
        { credentials: 'include' }
      );

      if (!response.ok) throw new Error('Failed to download template');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = uploadType === 'products'
        ? 'dispenser_products_template.xlsx'
        : 'dispenser_inventory_template.xlsx';
      a.download = filename;
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
  // OPEN ADD STOCK MODAL
  // ============================================
  const openAddStockModal = async () => {
    setShowAddStockModal(true);
    await fetchAllProducts();
  };

  // ============================================
  // HELPERS
  // ============================================
  const getStockStatus = (quantity, minStock) => {
    if (quantity <= 0) return { status: 'empty', label: 'Empty' };
    if (quantity <= minStock) return { status: 'low', label: 'Low Stock' };
    return { status: 'healthy', label: 'In Stock' };
  };

  const openEditModal = (product) => {
    setSelectedProduct(product);
    setEditData({
      dispenserId: product.dispenserId,
      productName: product.productName,
      sellingPrice3ml: product.sellingPrice3ml?.toString() || '',
      sellingPrice6ml: product.sellingPrice6ml?.toString() || '',
      discount: product.discount?.toString() || '0'
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (product) => {
    setSelectedProduct(product);
    setShowDeleteModal(true);
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <Navbar>
      <ToastContainer position="top-center" autoClose={3000} />
      <div className="di-main">

        {/* Page Header */}
        <div className="di-page-header">
          <h2></h2>
          <div className="di-right-section">
            <div className="di-search-container">
              <FaSearch className="di-search-icon" />
              <input
                type="text"
                placeholder="Search by Product Name..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="di-action-buttons-group">
              {/* ✅ STATUS FILTER */}
              <div className="di-status-filter">
                <FaFilter className="di-filter-icon" />
                <select
                  value={statusFilter}
                  onChange={(e) => handleStatusFilter(e.target.value)}
                  className="di-status-select"
                >
                  <option value="all">All Products</option>
                  <option value="low">Low Stock</option>
                  <option value="out-of-stock">Out of Stock</option>
                </select>
              </div>

              <button
                className="di-alert-btn"
                onClick={() => setShowAlertModal(true)}
                title="View Stock Alerts"
              >
                <FaBell />
                {alerts.length > 0 && <span className="di-alert-badge">{alerts.length}</span>}
              </button>
              <button className="di-upload-btn" onClick={() => setShowBulkUploadModal(true)}>
                <FaUpload /> Bulk Upload
              </button>
              {/* ✅ EXPORT BUTTON */}
              <button
                className="di-export-btn"
                onClick={handleExport}
                disabled={isExporting}
                title="Export to Excel"
              >
                <FaDownload /> {isExporting ? "Exporting..." : "Export"}
              </button>
              <button
                className="di-add-stock-btn"
                onClick={openAddStockModal}
                title="Add stock to a product"
              >
                <FaPlus /> Add Stock
              </button>
              <button className="di-add-product-btn" onClick={() => setShowAddProductModal(true)}>
                <FaPlus /> Add Product
              </button>
            </div>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="di-data-table">
          {isLoading ? (
            <div className="di-loading-container">
              <div className="di-loading-spinner large"></div>
              <p>Loading inventory...</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '34px' }}></th>
                  <th>Product Name</th>
                  <th>Quantity (KG)</th>
                  <th>
                    <div className="di-stock-toggle-header">
                      <span>Stock</span>
                      <button
                        className="di-stock-toggle-btn"
                        onClick={() => setShowML(!showML)}
                        title={showML ? "Switch to KG" : "Switch to ML"}
                      >
                        {showML ? (
                          <>
                            <FaToggleOn /> ML
                          </>
                        ) : (
                          <>
                            <FaToggleOff /> KG
                          </>
                        )}
                      </button>
                    </div>
                  </th>
                  <th>Selling Price 3ml (₹/KG)</th>
                  <th>Selling Price 6ml (₹/KG)</th>
                  <th>Discount (%)</th>
                  {/* <th>Min Stock</th> */}
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan="10">
                      <div className="di-empty-state">
                        <FaBox className="di-empty-icon" />
                        <p>No products found</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((item) => {
                    const status = getStockStatus(item.quantity, item.minStock);
                    const isExpanded = expandedRowId === item.dispenserId;
                    const { value: stockDisplayValue, unit: stockDisplayUnit } = getStockDisplay(
                      item.quantity,
                      showML
                    );

                    return (
                      <React.Fragment key={item.dispenserId}>
                        <tr
                          className={`di-clickable-row ${isExpanded ? 'di-row-expanded' : ''}`}
                          onClick={() => handleToggleRow(item.dispenserId)}
                        >
                          <td className="di-expand-toggle-cell">
                            {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                          </td>
                          <td className="di-name-cell">{item.productName}</td>
                          <td className="di-qty-cell">{item.quantity}</td>
                          <td className="di-stock-cell">
                            {stockDisplayValue.toFixed(2)} {stockDisplayUnit}
                          </td>
                          <td className="di-selling-price-cell">
                            ₹{item.sellingPrice3ml?.toFixed(2) || '0.00'}
                          </td>
                          <td className="di-selling-price-cell">
                            ₹{item.sellingPrice6ml?.toFixed(2) || '0.00'}
                          </td>
                          <td className="di-discount-cell">
                            {item.discount || 0}%
                          </td>
                          {/* <td className="di-min-cell">{item.minStock}</td> */}
                          <td>
                            <span className={`di-status-badge di-status-${status.status}`}>
                              <span className="di-status-dot"></span>
                              {status.label}
                            </span>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="di-row-actions">
                              <button
                                className="di-edit-btn"
                                onClick={() => openEditModal(item)}
                                title="Edit"
                              >
                                <FaEdit />
                              </button>
                              <button
                                className="di-delete-btn"
                                onClick={() => openDeleteModal(item)}
                                title="Delete"
                              >
                                <FaTrash />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <>
                            <TransactionHistoryRow
                              colSpan={10}
                              isLoading={loadingTransactionsFor === item.dispenserId}
                              transactions={transactionCache[item.dispenserId]}
                              onViewDisposal={() => fetchDisposalHistory(item.dispenserId)}
                              hasDisposal={true}
                              onViewAllTransactions={() => fetchFullTransactions(item.dispenserId, item.productName)}
                            />

                            {showDisposalPanel && currentDisposalDispenserId === item.dispenserId && (
                              <tr className="di-expand-row">
                                <td colSpan={10}>
                                  <DisposalHistoryPanel
                                    disposals={disposalData?.disposals || []}
                                    isLoading={loadingDisposal}
                                    onClose={() => {
                                      setShowDisposalPanel(false);
                                      setDisposalData(null);
                                      setCurrentDisposalDispenserId(null);
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
          <div className="di-pagination">
            <div className="di-pagination-info">
              Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} products
            </div>
            <div className="di-pagination-controls">
              <button
                className="di-pagination-btn"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={!pagination.hasPrevPage}
              >
                <FaChevronLeft />
              </button>

              <div className="di-pagination-pages">
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
                      className={`di-pagination-page ${pagination.page === pageNum ? 'di-pagination-active' : ''}`}
                      onClick={() => handlePageChange(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                className="di-pagination-btn"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={!pagination.hasNextPage}
              >
                <FaChevronRight />
              </button>
            </div>
          </div>
        )}

        {/* Modals */}
        <AddProductModal
          show={showAddProductModal}
          onClose={() => setShowAddProductModal(false)}
          newProduct={newProduct}
          setNewProduct={setNewProduct}
          isSubmitting={isSubmitting}
          onSubmit={handleCreateProduct}
        />

        <AddStockModal
          show={showAddStockModal}
          onClose={() => {
            setShowAddStockModal(false);
            setAddStockData({
              dispenserId: "",
              productName: "",
              sellingPrice3ml: "",
              sellingPrice6ml: "",
              discount: "",
              quantity: "",
              purchasePrice: "",
              notes: ""
            });
          }}
          products={allProducts}
          addStockData={addStockData}
          setAddStockData={setAddStockData}
          isSubmitting={isSubmitting}
          onSubmit={handleAddStock}
          isLoadingProducts={isLoadingAllProducts}
        />

        <EditProductModal
          show={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedProduct(null);
          }}
          editData={editData}
          setEditData={setEditData}
          isSubmitting={isSubmitting}
          onSubmit={handleUpdateProduct}
        />

        <DeleteConfirmModal
          show={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false);
            setSelectedProduct(null);
          }}
          product={selectedProduct}
          onConfirm={handleDeleteProduct}
          isDeleting={isDeleting}
        />

        <BulkUploadModal
          show={showBulkUploadModal}
          onClose={() => {
            setShowBulkUploadModal(false);
            setSelectedFile(null);
          }}
          fileInputRef={fileInputRef}
          selectedFile={selectedFile}
          onFileChange={handleFileChange}
          onDownloadTemplate={handleDownloadTemplate}
          isSubmitting={isSubmitting}
          onSubmit={handleBulkUpload}
          uploadType={uploadType}
          setUploadType={setUploadType}
        />

        <ErrorModal
          show={showErrorModal}
          onClose={() => {
            setShowErrorModal(false);
            setBulkErrors([]);
            setBulkSuccessDetails([]);
          }}
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
          productName={fullTransactionProductName}
          transactions={fullTransactions}
          isLoading={loadingFullTransactions}
          activeTab={fullTransactionActiveTab}
          setActiveTab={setFullTransactionActiveTab}
        />

      </div>
    </Navbar>
  );
};

export default DispenserInventory;