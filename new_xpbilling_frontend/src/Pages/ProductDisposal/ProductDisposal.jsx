import React, { useState, useEffect } from "react";
import { toast, ToastContainer } from "react-toastify";
import {
    FaBox, FaSearch, FaTimes,
    FaTrash, FaHistory, FaExclamationTriangle,
    FaChevronLeft, FaChevronRight, FaToggleOn, FaToggleOff
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Navbar from "../../Components/Navbar/Navbar";
import "./ProductDisposal.scss";
import "react-toastify/dist/ReactToastify.css";

// ============================================
// REASON OPTIONS
// ============================================
const REASON_OPTIONS = ["Damage", "Expired", "Broken", "Return", "Other"];

const DisposalModal = ({
    show, onClose, product, inventoryType,
    disposalData, setDisposalData,
    isSubmitting, onSubmit
}) => {
    if (!show || !product) return null;

    const isBottles = inventoryType === 'bottles';
    const isXP = inventoryType === 'xp';
    const isDispenser = inventoryType === 'dispenser';

    // ✅ CORRECT: Convert everything to KG for stock check
    let totalInKG = 0;
    let totalDisplay = 0;

    if (isBottles) {
        totalInKG = parseFloat(disposalData.kg) || 0;
        totalDisplay = totalInKG;
    } else {
        const mlInput = parseFloat(disposalData.ml) || 0;
        totalDisplay = mlInput;
        const density = product.density || 1000;
        totalInKG = mlInput / density;  // Convert ML to KG
    }

    const stockInKG = product.quantity || 0;
    const exceedsStock = totalInKG > stockInKG;
    const hasEnteredQuantity = isBottles ? disposalData.kg !== "" : disposalData.ml !== "";
    const remainingStock = Math.max(0, stockInKG - totalInKG);

    const formatTotalLabel = () => {
        if (isBottles) return `${disposalData.kg || 0} Pieces`;
        if (isXP || isDispenser) return `${totalDisplay} ML`;
        return `0 ${isBottles ? 'Pieces' : 'ML'}`;
    };

    const getUnitLabel = () => {
        if (isBottles) return 'Pieces';
        return 'ML';
    };

    return (
        <div className="pd-modal-overlay" onClick={onClose}>
            <div className="pd-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="pd-modal-header">
                    <div className="pd-modal-title">
                        <FaTrash /> Dispose Product
                    </div>
                    <button className="pd-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>

                <div className="pd-modal-body">
                    <div className="pd-product-info">
                        <div className="pd-product-detail">
                            <strong>Product:</strong> {product.name}
                        </div>
                        <div className="pd-product-detail">
                            <strong>Available Stock:</strong> {stockInKG} KG
                        </div>
                        {product.ml && (
                            <div className="pd-product-detail">
                                <strong>ML:</strong> {product.ml}
                            </div>
                        )}
                        {product.itemType && (
                            <div className="pd-product-detail">
                                <strong>Item Type:</strong> {product.itemType}
                            </div>
                        )}
                        {isXP && product.density && (
                            <div className="pd-product-detail">
                                <strong>Density:</strong> {product.density} ML/KG
                                {product.isFragranceBase && (
                                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#856404' }}>
                                        (1 KG = 820 ML)
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="pd-form-section">
                        <h4>Disposal Details</h4>

                        {isBottles ? (
                            <div className="pd-form-row">
                                <div className="pd-form-field">
                                    <label>Quantity (Pieces) *</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={disposalData.kg}
                                        onChange={(e) => setDisposalData({ ...disposalData, kg: e.target.value })}
                                        placeholder="Enter pieces to dispose"
                                        autoComplete="off"
                                        className={exceedsStock ? 'pd-input-error' : ''}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="pd-form-row">
                                <div className="pd-form-field">
                                    <label>Quantity (ML) *</label>
                                    <input
                                        type="number"
                                        min="1"
                                        step="0.01"
                                        value={disposalData.ml}
                                        onChange={(e) => setDisposalData({ ...disposalData, ml: e.target.value })}
                                        placeholder={`Enter quantity in ML (max ${(stockInKG * (product.density || 1000)).toFixed(0)} ML)`}
                                        autoComplete="off"
                                        className={exceedsStock ? 'pd-input-error' : ''}
                                    />
                                    <small className="pd-field-hint">
                                        {isXP && product.isFragranceBase
                                            ? "1 KG = 820 ML"
                                            : "1 KG = 1000 ML"}
                                    </small>
                                </div>
                            </div>
                        )}

                        {exceedsStock && hasEnteredQuantity && (
                            <div className="pd-error-text">
                                <FaExclamationTriangle />
                                Cannot dispose more than available stock ({stockInKG} KG)
                            </div>
                        )}

                        <div className="pd-form-row">
                            <div className="pd-form-field">
                                <label>Reason *</label>
                                <select
                                    value={disposalData.reason}
                                    onChange={(e) => setDisposalData({ ...disposalData, reason: e.target.value })}
                                >
                                    <option value="">Select Reason</option>
                                    {REASON_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="pd-form-field">
                                <label>Notes (Optional)</label>
                                <input
                                    type="text"
                                    value={disposalData.notes}
                                    onChange={(e) => setDisposalData({ ...disposalData, notes: e.target.value })}
                                    placeholder="Add notes..."
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        {hasEnteredQuantity && totalInKG > 0 && (
                            <>
                                <div className="pd-total-disposal">
                                    <strong>Total to Dispose:</strong> {formatTotalLabel()} ({totalInKG.toFixed(4)} KG)
                                </div>

                                <div className="pd-stock-preview">
                                    <span className="pd-stock-preview-label">Stock remaining after disposal</span>
                                    <span className={`pd-stock-preview-value ${exceedsStock ? 'pd-stock-preview-warning' : 'pd-stock-preview-ok'}`}>
                                        {exceedsStock ? '—' : `${remainingStock.toFixed(4)} KG`}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="pd-modal-footer">
                    <button className="pd-btn-cancel" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="pd-btn-danger"
                        onClick={onSubmit}
                        disabled={isSubmitting || exceedsStock || !hasEnteredQuantity || totalInKG <= 0 || !disposalData.reason}
                    >
                        {isSubmitting ? "Processing..." : "Dispose"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// HISTORY MODAL
// ============================================
const HistoryModal = ({ show, onClose, history, isLoading, inventoryType, formatDate }) => {
    if (!show) return null;

    const historyData = history?.data || history;
    const disposals = historyData?.disposals || [];
    const unitLabel = inventoryType === 'bottles' ? 'Pieces' : 'ML';

    return (
        <div className="pd-modal-overlay" onClick={onClose}>
            <div className="pd-modal-content pd-modal-lg" onClick={(e) => e.stopPropagation()}>
                <div className="pd-modal-header pd-modal-header-info">
                    <div className="pd-modal-title">
                        <FaHistory /> Disposal History
                    </div>
                    <button className="pd-modal-close" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>

                <div className="pd-modal-body">
                    {isLoading ? (
                        <div className="pd-loading-container">
                            <div className="pd-loading-spinner large"></div>
                            <p>Loading disposal history...</p>
                        </div>
                    ) : !historyData ? (
                        <div className="pd-history-empty">
                            <FaHistory />
                            <p>Could not load disposal history.</p>
                        </div>
                    ) : (
                        <>
                            <div className="pd-history-summary">
                                <div>
                                    <strong>Product:</strong> {historyData.productName}
                                </div>
                                <div>
                                    <strong>Total Disposed:</strong> {historyData.totalDisposed || 0} {unitLabel}
                                </div>
                                <div>
                                    <strong>Total Disposals:</strong> {disposals.length}
                                </div>
                            </div>

                            {disposals.length === 0 ? (
                                <div className="pd-history-empty">
                                    <FaHistory />
                                    <p>No disposal history yet for this product.</p>
                                </div>
                            ) : (
                                <div className="pd-history-list">
                                    {disposals.map((entry, index) => (
                                        <div key={entry.disposalEntryId || index} className="pd-history-item">
                                            <div className="pd-history-header">
                                                <span className="pd-history-date">{formatDate(entry.disposedAt)}</span>
                                                <span className="pd-history-quantity">
                                                    −{entry.disposedQuantity} {unitLabel}
                                                </span>
                                            </div>
                                            <div className="pd-history-details">
                                                <span className="pd-history-reason">{entry.reason}</span>
                                                <span className="pd-history-by">By: {entry.performedBy?.userName || 'Unknown'}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="pd-modal-footer">
                    <button className="pd-btn-primary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================
const ProductDisposal = () => {
    const [inventoryType, setInventoryType] = useState("");
    const [products, setProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [showDisposalModal, setShowDisposalModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [selectedHistory, setSelectedHistory] = useState(null);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // ✅ Toggle state for Grams/ML
    const [showGrams, setShowGrams] = useState(true);

    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState({
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
    });

    const [disposalData, setDisposalData] = useState({
        ml: "",
        kg: "",
        reason: "",
        notes: ""
    });

    const navigate = useNavigate();

    // ============================================
    // FETCH PRODUCTS WITH PAGINATION
    // ============================================
    const fetchProducts = async (type, page = 1, search = '') => {
        if (!type) {
            setProducts([]);
            setFilteredProducts([]);
            setPagination({
                total: 0,
                page: 1,
                limit: 20,
                totalPages: 0,
                hasNextPage: false,
                hasPrevPage: false
            });
            return;
        }

        try {
            setIsLoading(true);

            const queryParams = new URLSearchParams({
                page: page,
                limit: 20,
                search: search
            });

            const endpointMap = {
                xp: `/xp/get-all?${queryParams}`,
                dispenser: `/dispenser/get-all?${queryParams}`,
                bottles: `/bottles/get-all?${queryParams}`
            };

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}${endpointMap[type]}`,
                { credentials: 'include' }
            );

            if (!response.ok) {
                if (response.status === 401) navigate('/login');
                throw new Error('Failed to fetch products');
            }

            const data = await response.json();

            let productsArray;
            let paginationData;

            if (Array.isArray(data)) {
                productsArray = data;
                paginationData = {
                    total: data.length,
                    page: 1,
                    limit: data.length,
                    totalPages: 1,
                    hasNextPage: false,
                    hasPrevPage: false
                };
            } else if (data.inventory && Array.isArray(data.inventory)) {
                productsArray = data.inventory;
                paginationData = data.pagination || {
                    total: data.inventory.length,
                    page: 1,
                    limit: data.inventory.length,
                    totalPages: 1,
                    hasNextPage: false,
                    hasPrevPage: false
                };
            } else if (data.products && Array.isArray(data.products)) {
                productsArray = data.products;
                paginationData = data.pagination || {
                    total: data.products.length,
                    page: 1,
                    limit: data.products.length,
                    totalPages: 1,
                    hasNextPage: false,
                    hasPrevPage: false
                };
            } else if (data.data && Array.isArray(data.data)) {
                productsArray = data.data;
                paginationData = data.pagination || {
                    total: data.data.length,
                    page: 1,
                    limit: data.data.length,
                    totalPages: 1,
                    hasNextPage: false,
                    hasPrevPage: false
                };
            } else {
                productsArray = [];
                paginationData = {
                    total: 0,
                    page: 1,
                    limit: 20,
                    totalPages: 0,
                    hasNextPage: false,
                    hasPrevPage: false
                };
            }

            // Format products - show KG + Grams/ML toggle
            let formattedProducts = productsArray.map(p => {
                let unit = 'KG';
                let displayQuantity = p.quantity || 0;
                let density = p.density || 1000;
                let isFragranceBase = p.productName?.toUpperCase().trim() === "FRAGRANCE BASE";

                return {
                    id: p.xpId || p.dispenserId || p.bottleItemId || p._id,
                    name: p.productName || `${p.mlSize || ''} ${p.itemType || ''}`.trim(),
                    ml: p.ml || p.mlSize || '',
                    itemType: p.itemType || '',
                    quantity: displayQuantity, // In KG
                    unit: 'KG',
                    density: density,
                    isFragranceBase: isFragranceBase,
                    // For toggle display
                    toggleValue: 0,
                    toggleUnit: '',
                    toggleDisplay: ''
                };
            });

            setProducts(formattedProducts);
            setFilteredProducts(formattedProducts);
            setPagination(paginationData);
            setCurrentPage(paginationData.page || 1);

        } catch (error) {
            console.error("Error fetching products:", error);
            toast.error("Failed to fetch products");
            setProducts([]);
            setFilteredProducts([]);
            setPagination({
                total: 0,
                page: 1,
                limit: 20,
                totalPages: 0,
                hasNextPage: false,
                hasPrevPage: false
            });
        } finally {
            setIsLoading(false);
        }
    };

    // ============================================
    // FETCH DISPOSAL HISTORY
    // ============================================
    const fetchDisposalHistory = async (productId) => {
        try {
            setIsLoadingHistory(true);
            setShowHistoryModal(true);
            setSelectedHistory(null);

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/disposal/get-by-product/${productId}`,
                { credentials: 'include' }
            );

            if (!response.ok) {
                throw new Error('Failed to fetch disposal history');
            }

            const data = await response.json();
            setSelectedHistory(data);
        } catch (error) {
            console.error("Error fetching history:", error);
            toast.error("Failed to fetch disposal history");
            setShowHistoryModal(false);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    // ============================================
    // HANDLE INVENTORY TYPE CHANGE
    // ============================================
    const handleTypeChange = (e) => {
        const type = e.target.value;
        setInventoryType(type);
        setSelectedProduct(null);
        setSearchTerm("");
        setCurrentPage(1);
        setDisposalData({ ml: "", kg: "", reason: "", notes: "" });
        fetchProducts(type, 1, "");
    };

    // ============================================
    // HANDLE SEARCH
    // ============================================
    const handleSearch = (term) => {
        setSearchTerm(term);
        setCurrentPage(1);
        fetchProducts(inventoryType, 1, term);
    };

    // ============================================
    // HANDLE PAGE CHANGE
    // ============================================
    const handlePageChange = (newPage) => {
        if (newPage < 1 || newPage > pagination.totalPages) return;
        setCurrentPage(newPage);
        fetchProducts(inventoryType, newPage, searchTerm);
    };

    // ============================================
    // HANDLE PRODUCT SELECTION
    // ============================================
    const handleProductSelect = (product) => {
        setSelectedProduct(product);
        setDisposalData({ ml: "", kg: "", reason: "", notes: "" });
        setShowDisposalModal(true);
    };

    // ============================================
    // HANDLE DISPOSAL SUBMIT
    // ============================================
    const handleDisposalSubmit = async () => {
        try {
            const isBottles = inventoryType === 'bottles';
            const isXP = inventoryType === 'xp';
            const isDispenser = inventoryType === 'dispenser';

            let totalQuantity = 0;

            if (isBottles) {
                if (!disposalData.kg || parseInt(disposalData.kg) <= 0) {
                    toast.error("Please enter valid quantity");
                    return;
                }
                totalQuantity = parseInt(disposalData.kg);
            } else if (isXP || isDispenser) {
                if (!disposalData.ml || parseFloat(disposalData.ml) <= 0) {
                    toast.error("Please enter valid quantity in ML");
                    return;
                }
                totalQuantity = parseFloat(disposalData.ml);
            }

            // Check stock in KG for validation
            let stockInKG = selectedProduct.quantity;

            if (isDispenser) {
                const mlToKG = totalQuantity / 1000;
                if (mlToKG > stockInKG) {
                    toast.error(`Cannot dispose more than available stock (${stockInKG} KG)`);
                    return;
                }
            } else if (isXP) {
                const density = selectedProduct.density || 1000;
                const mlToKG = totalQuantity / density;
                if (mlToKG > stockInKG) {
                    toast.error(`Cannot dispose more than available stock (${stockInKG} KG)`);
                    return;
                }
            } else if (isBottles) {
                if (totalQuantity > stockInKG) {
                    toast.error(`Cannot dispose more than available stock (${stockInKG} Pieces)`);
                    return;
                }
            }

            if (!disposalData.reason) {
                toast.error("Please select a reason");
                return;
            }

            setIsSubmitting(true);

            const payload = {
                inventoryType,
                inventoryItemId: selectedProduct.id,
                disposedQuantity: totalQuantity,
                reason: disposalData.reason,
                notes: disposalData.notes || ''
            };

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/disposal/dispose`,
                {
                    method: "POST",
                    credentials: 'include',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to dispose product");
            }

            const result = await response.json();
            toast.success(result.message);

            await fetchProducts(inventoryType, currentPage, searchTerm);

            setDisposalData({ ml: "", kg: "", reason: "", notes: "" });
            setShowDisposalModal(false);
            setSelectedProduct(null);

        } catch (error) {
            console.error("Error disposing product:", error);
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ============================================
    // FORMAT DATE
    // ============================================
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // ============================================
    // ROW STOCK STATE
    // ============================================
    const getRowStockClass = (quantity) => {
        if (quantity <= 0) return 'pd-row-zero-stock';
        if (quantity <= 5) return 'pd-row-low-stock';
        return '';
    };

    // ============================================
    // RENDER
    // ============================================
    return (
        <Navbar>
            <ToastContainer position="top-center" autoClose={3000} />
            <div className="pd-main">

                {/* Page Header */}
                <div className="pd-page-header">
                    <h2></h2>
                    <div className="pd-right-section">
                        <div className="pd-inventory-select">
                            <label>Select Inventory:</label>
                            <select value={inventoryType} onChange={handleTypeChange}>
                                <option value="">Select Inventory</option>
                                <option value="xp">XP Inventory</option>
                                <option value="dispenser">Dispenser Inventory</option>
                                <option value="bottles">Bottles Inventory</option>
                            </select>
                        </div>
                    </div>
                </div>

                {!inventoryType && (
                    <div className="pd-select-prompt">
                        <FaBox className="pd-select-prompt-icon" />
                        <h3>Choose an inventory to get started</h3>
                        <p>Select XP, Dispenser, or Bottles inventory above to view products and manage disposals.</p>
                    </div>
                )}

                {inventoryType && (
                    <div className="pd-product-list">
                        <div className="pd-search-container">
                            <FaSearch className="pd-search-icon" />
                            <input
                                type="text"
                                placeholder="Search products..."
                                value={searchTerm}
                                onChange={(e) => handleSearch(e.target.value)}
                                autoComplete="off"
                            />
                        </div>

                        {isLoading ? (
                            <div className="pd-loading-container">
                                <div className="pd-loading-spinner large"></div>
                                <p>Loading products...</p>
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <div className="pd-empty-state">
                                <FaBox className="pd-empty-icon" />
                                <p>
                                    {searchTerm.trim()
                                        ? "No products match your search"
                                        : "No products found in this inventory"}
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="pd-table-wrap">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Product Name</th>
                                                <th>Stock (KG)</th>
                                                <th>
                                                    <div className="pd-stock-toggle-header">
                                                        <span>Stock</span>
                                                        {inventoryType !== 'bottles' && (
                                                            <button
                                                                className="pd-stock-toggle-btn"
                                                                onClick={() => setShowGrams(!showGrams)}
                                                                title={showGrams ? "Switch to ML" : "Switch to Grams"}
                                                            >
                                                                {showGrams ? (
                                                                    <>
                                                                        <FaToggleOn /> Grams
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <FaToggleOff /> ML
                                                                    </>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </th>
                                                <th>Unit</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredProducts.map((product) => (
                                                <tr key={product.id} className={getRowStockClass(product.quantity)}>
                                                    <td className="pd-name-cell">
                                                        {product.name}
                                                        {product.isFragranceBase && (
                                                            <span className="pd-density-badge">FRAGRANCE BASE</span>
                                                        )}
                                                    </td>
                                                    <td className="pd-kg-cell">{product.quantity?.toFixed(2)} KG</td>
                                                    <td className="pd-stock-cell">
                                                        {inventoryType === 'bottles' ? (
                                                            product.quantity
                                                        ) : (
                                                            <>
                                                                {showGrams ? (
                                                                    <>
                                                                        {(product.quantity * 1000).toFixed(2)} g
                                                                        {product.isFragranceBase && (
                                                                            <span className="pd-stock-hint">(1KG = 1000g)</span>
                                                                        )}
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        {product.isFragranceBase ? (
                                                                            <>
                                                                                {(product.quantity * 820).toFixed(2)} ml
                                                                                <span className="pd-stock-hint">(1KG = 820ml)</span>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                {(product.quantity * 1000).toFixed(2)} ml
                                                                            </>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </>
                                                        )}
                                                    </td>
                                                    <td className="pd-unit-cell">
                                                        {inventoryType === 'bottles' ? 'Pieces' : (showGrams ? 'g' : 'ml')}
                                                    </td>
                                                    <td>
                                                        <div className="pd-actions-cell">
                                                            <button
                                                                className="pd-dispose-btn"
                                                                onClick={() => handleProductSelect(product)}
                                                                disabled={product.quantity <= 0}
                                                                title={product.quantity <= 0 ? "No stock to dispose" : "Dispose product"}
                                                            >
                                                                <FaTrash /> Dispose
                                                            </button>
                                                            <button
                                                                className="pd-history-btn"
                                                                onClick={() => fetchDisposalHistory(product.id)}
                                                                title="View disposal history"
                                                            >
                                                                <FaHistory />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {pagination.totalPages > 0 && (
                                    <div className="pd-pagination">
                                        <div className="pd-pagination-info">
                                            Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} products
                                        </div>
                                        <div className="pd-pagination-controls">
                                            <button
                                                className="pd-pagination-btn"
                                                onClick={() => handlePageChange(pagination.page - 1)}
                                                disabled={!pagination.hasPrevPage}
                                            >
                                                <FaChevronLeft />
                                            </button>

                                            <div className="pd-pagination-pages">
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
                                                            className={`pd-pagination-page ${pagination.page === pageNum ? 'pd-pagination-active' : ''}`}
                                                            onClick={() => handlePageChange(pageNum)}
                                                        >
                                                            {pageNum}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <button
                                                className="pd-pagination-btn"
                                                onClick={() => handlePageChange(pagination.page + 1)}
                                                disabled={!pagination.hasNextPage}
                                            >
                                                <FaChevronRight />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                <DisposalModal
                    show={showDisposalModal}
                    onClose={() => setShowDisposalModal(false)}
                    product={selectedProduct}
                    inventoryType={inventoryType}
                    disposalData={disposalData}
                    setDisposalData={setDisposalData}
                    isSubmitting={isSubmitting}
                    onSubmit={handleDisposalSubmit}
                />

                <HistoryModal
                    show={showHistoryModal}
                    onClose={() => setShowHistoryModal(false)}
                    history={selectedHistory}
                    isLoading={isLoadingHistory}
                    inventoryType={inventoryType}
                    formatDate={formatDate}
                />

            </div>
        </Navbar>
    );
};

export default ProductDisposal;