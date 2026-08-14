import React, { useState, useEffect } from "react";
import { toast, ToastContainer } from "react-toastify";
import {
    FaHistory,
    FaSearch,
    FaDownload,
    FaTimes,
    FaChevronLeft,
    FaChevronRight,
    FaUser,
    FaEnvelope,
    FaCalendarAlt,
    FaCheckCircle,
    FaTimesCircle,
    FaClock,
    FaFilter,
    FaFileExcel
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Navbar from "../../Components/Navbar/Navbar";
import "react-toastify/dist/ReactToastify.css";
import "./Logs.scss";

const Logs = () => {
    const navigate = useNavigate();

    // ========== STATE ==========
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    // Filters
    const [emailFilter, setEmailFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [timeFilter, setTimeFilter] = useState("all");
    const [selectedDate, setSelectedDate] = useState("");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState({
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
    });

    // Unique emails for dropdown
    const [uniqueEmails, setUniqueEmails] = useState([]);

    // ========== FETCH LOGS ==========
    const fetchLogs = async (page = 1) => {
        try {
            setIsLoading(true);

            const params = new URLSearchParams({
                page: page,
                limit: 50
            });

            if (emailFilter.trim()) {
                params.set('email', emailFilter.trim());
            }

            if (statusFilter) {
                params.set('status', statusFilter);
            }

            if (timeFilter === 'custom' && selectedDate) {
                params.set('timeFilter', 'custom');
                params.set('date', selectedDate);
            } else {
                params.set('timeFilter', 'all');
            }

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/logs/get-logs?${params}`,
                { credentials: 'include' }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    navigate('/login');
                    return;
                }
                if (response.status === 403) {
                    toast.error("You don't have permission to view logs");
                    return;
                }
                throw new Error('Failed to fetch logs');
            }

            const data = await response.json();

            setLogs(data.data || []);
            setPagination(data.pagination || {
                total: 0,
                page: 1,
                limit: 50,
                totalPages: 0,
                hasNextPage: false,
                hasPrevPage: false
            });
            setUniqueEmails(data.uniqueEmails || []);
            setCurrentPage(data.pagination?.page || 1);

        } catch (error) {
            console.error("Error fetching logs:", error);
            toast.error("Failed to fetch logs");
            setLogs([]);
        } finally {
            setIsLoading(false);
        }
    };

    // ========== HANDLE EXPORT ==========
    const handleExport = async () => {
        try {
            setIsExporting(true);

            const params = new URLSearchParams();

            if (emailFilter.trim()) {
                params.set('email', emailFilter.trim());
            }

            if (statusFilter) {
                params.set('status', statusFilter);
            }

            if (timeFilter === 'custom' && selectedDate) {
                params.set('timeFilter', 'custom');
                params.set('date', selectedDate);
            } else {
                params.set('timeFilter', 'all');
            }

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/logs/export?${params}`,
                { credentials: 'include' }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to export logs');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `logs_export_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast.success('Logs exported successfully!');

        } catch (error) {
            console.error("Error exporting logs:", error);
            toast.error(error.message || 'Failed to export logs');
        } finally {
            setIsExporting(false);
        }
    };

    // ========== HANDLE FILTER CHANGE ==========
    const handleFilterChange = () => {
        setCurrentPage(1);
        fetchLogs(1);
    };

    // ========== HANDLE PAGE CHANGE ==========
    const handlePageChange = (newPage) => {
        if (newPage < 1 || newPage > pagination.totalPages) return;
        setCurrentPage(newPage);
        fetchLogs(newPage);
    };

    // ========== CLEAR FILTERS ==========
    const clearFilters = () => {
        setEmailFilter("");
        setStatusFilter("");
        setTimeFilter("all");
        setSelectedDate("");
        setCurrentPage(1);
        fetchLogs(1);
    };

    // ========== INITIAL FETCH ==========
    useEffect(() => {
        fetchLogs(1);
    }, []);

    // ========== FORMAT DATE ==========
    const formatDateTime = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    // ========== GET STATUS BADGE ==========
    const getStatusBadge = (status) => {
        if (status === 'success') {
            return (
                <span className="log-status-success">
                    <FaCheckCircle /> Success
                </span>
            );
        }
        return (
            <span className="log-status-failed">
                <FaTimesCircle /> Failed
            </span>
        );
    };

    // ========== GET MODULE ICON ==========
    const getModuleIcon = (module) => {
        switch (module) {
            case 'Workshop': return '🏭';
            case 'Packages': return '📦';
            case 'Customers': return '👤';
            case 'Invoice': return '📄';
            case 'Inventory': return '📊';
            case 'Discount': return '🏷️';
            case 'Disposal': return '🗑️';
            case 'Admin': return '⚙️';
            case 'Authentication': return '🔐';
            case 'Bottles Inventory': return '🧴';
            case 'XP Inventory': return '🧪';
            case 'Dispenser Inventory': return '💧';
            case 'Product Disposal': return '♻️';
            case 'Loyalty Reset': return '🪙';
            default: return '📋';
        }
    };

    // ========== RENDER ==========
    return (
        <Navbar>
            <ToastContainer position="top-center" autoClose={3000} />
            <div className="logs-main">

                {/* Page Header */}
                <div className="logs-page-header">
                    <h2>
                        <FaHistory /> Activity Logs
                    </h2>
                    <div className="logs-header-actions">
                        <button
                            className="logs-export-btn"
                            onClick={handleExport}
                            disabled={isExporting || logs.length === 0}
                            title="Export logs to Excel"
                        >
                            <FaDownload /> {isExporting ? "Exporting..." : "Export"}
                        </button>
                    </div>
                </div>

                {/* Filters Bar */}
                <div className="logs-filters-bar">
                    <div className="logs-filters-group">
                        {/* Email Filter */}
                        <div className="logs-filter-field">
                            <FaEnvelope className="logs-filter-icon" />
                            <input
                                type="text"
                                placeholder="Filter by email..."
                                value={emailFilter}
                                onChange={(e) => setEmailFilter(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') handleFilterChange();
                                }}
                                autoComplete="off"
                            />
                            {emailFilter && (
                                <button
                                    className="logs-filter-clear"
                                    onClick={() => {
                                        setEmailFilter("");
                                        handleFilterChange();
                                    }}
                                >
                                    <FaTimes />
                                </button>
                            )}
                        </div>

                        {/* Status Filter */}
                        <div className="logs-filter-field">
                            <select
                                value={statusFilter}
                                onChange={(e) => {
                                    setStatusFilter(e.target.value);
                                    setTimeout(handleFilterChange, 100);
                                }}
                            >
                                <option value="">All Status</option>
                                <option value="success">✅ Success</option>
                                <option value="failed">❌ Failed</option>
                            </select>
                        </div>

                        {/* Time Filter */}
                        <div className="logs-filter-field">
                            <select
                                value={timeFilter}
                                onChange={(e) => {
                                    setTimeFilter(e.target.value);
                                    if (e.target.value !== 'custom') {
                                        setSelectedDate("");
                                        setTimeout(handleFilterChange, 100);
                                    }
                                }}
                            >
                                <option value="all">📅 All Time</option>
                                <option value="custom">📅 Custom Date</option>
                            </select>
                        </div>

                        {/* Date Picker (shows only when custom is selected) */}
                        {timeFilter === 'custom' && (
                            <div className="logs-filter-field logs-date-field">
                                <FaCalendarAlt className="logs-filter-icon" />
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => {
                                        setSelectedDate(e.target.value);
                                    }}
                                    max={new Date().toISOString().split('T')[0]}
                                />
                                {selectedDate && (
                                    <button
                                        className="logs-filter-clear"
                                        onClick={() => {
                                            setSelectedDate("");
                                        }}
                                    >
                                        <FaTimes />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Apply Filter Button */}
                        <button
                            className="logs-apply-filter-btn"
                            onClick={handleFilterChange}
                            disabled={timeFilter === 'custom' && !selectedDate}
                        >
                            <FaSearch /> Apply Filters
                        </button>

                        {/* Clear Filters Button */}
                        {(emailFilter || statusFilter || (timeFilter === 'custom' && selectedDate)) && (
                            <button
                                className="logs-clear-filter-btn"
                                onClick={clearFilters}
                            >
                                <FaTimes /> Clear All
                            </button>
                        )}
                    </div>

                    {/* Result Count */}
                    {!isLoading && (
                        <div className="logs-result-count">
                            {pagination.total} logs found
                        </div>
                    )}
                </div>

                {/* Logs Table */}
                <div className="logs-table-container">
                    {isLoading ? (
                        <div className="logs-loading">
                            <div className="logs-loading-spinner"></div>
                            <p>Loading logs...</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="logs-empty-state">
                            <FaHistory className="logs-empty-icon" />
                            <p>No logs found matching your filters</p>
                            {(emailFilter || statusFilter || (timeFilter === 'custom' && selectedDate)) && (
                                <button onClick={clearFilters} className="logs-empty-clear-btn">
                                    Clear Filters
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="logs-table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '50px' }}>#</th>
                                        <th style={{ width: '120px' }}>Module</th>
                                        <th style={{ width: '140px' }}>User</th>
                                        <th style={{ width: '180px' }}>Email</th>
                                        <th style={{ width: '100px' }}>Action</th>
                                        <th style={{ width: '200px' }}>Heading</th>
                                        <th style={{ width: '100px' }}>Status</th>
                                        <th style={{ width: '180px' }}>Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log, index) => {
                                        const serialNo = ((currentPage - 1) * pagination.limit) + index + 1;
                                        return (
                                            <tr key={log.logId || index}>
                                                <td className="logs-serial">{serialNo}</td>
                                                <td className="logs-module">
                                                    <span className="logs-module-icon">
                                                        {getModuleIcon(log.module)}
                                                    </span>
                                                    {log.module || 'N/A'}
                                                </td>
                                                <td className="logs-user">
                                                    <FaUser className="logs-user-icon" />
                                                    {log.userName || 'N/A'}
                                                </td>
                                                <td className="logs-email">{log.userEmail || 'N/A'}</td>
                                                <td className="logs-action">
                                                    <span className={`logs-action-badge logs-action-${log.action?.toLowerCase() || 'unknown'}`}>
                                                        {log.action || 'N/A'}
                                                    </span>
                                                </td>
                                                <td className="logs-heading" title={log.heading}>
                                                    {log.heading || 'N/A'}
                                                </td>
                                                <td className="logs-status">
                                                    {getStatusBadge(log.status)}
                                                </td>
                                                <td className="logs-timestamp">
                                                    <FaClock className="logs-clock-icon" />
                                                    {formatDateTime(log.timestamp)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {!isLoading && pagination.totalPages > 0 && (
                    <div className="logs-pagination">
                        <div className="logs-pagination-info">
                            Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} logs
                        </div>
                        <div className="logs-pagination-controls">
                            <button
                                className="logs-pagination-btn"
                                onClick={() => handlePageChange(pagination.page - 1)}
                                disabled={!pagination.hasPrevPage}
                            >
                                <FaChevronLeft />
                            </button>

                            <div className="logs-pagination-pages">
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
                                            className={`logs-pagination-page ${pagination.page === pageNum ? 'logs-pagination-active' : ''}`}
                                            onClick={() => handlePageChange(pageNum)}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                className="logs-pagination-btn"
                                onClick={() => handlePageChange(pagination.page + 1)}
                                disabled={!pagination.hasNextPage}
                            >
                                <FaChevronRight />
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </Navbar>
    );
};

export default Logs;