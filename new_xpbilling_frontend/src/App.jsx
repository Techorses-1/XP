import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Customer from './Pages/Customer/Customer';
import Login from './Pages/Authentication/Login/Login';
import Register from './Pages/Authentication/Register/Register';
import AdminUsers from './Pages/Authentication/Admin/AdminUsers';

// Import the 3 separate components
import ProtectedRoute from './Components/Protected/ProtectedRoute';
import PermissionRoute from './Components/Protected/PermissionRoute';
// import SmartRedirect from './Components/Protected/SmartRedirect';
import PromoCodes from "./Pages/PromoCodes/PromoCodes";
import Packages from "./Pages/Packages/Packages";
import Workshops from "./Pages/Workshop/Workshops";
import BottleInventory from "./Pages/Inventory/Bottle/BottleInventory";
import XPInventory from "./Pages/Inventory/Xp/XPInventory";
import DispenserInventory from "./Pages/Inventory/Dispenser/DispenserInventory";
import ProductDisposal from "./Pages/ProductDisposal/ProductDisposal";
import Invoice from "./Pages/Invoice/Invoice";
import Dashboard from "./Pages/Dashboard/Dashboard";
import Reports from "./Pages/Reports/Reports";
import Logs from "./Pages/Logs/Logs";

function App() {
  return (
    <BrowserRouter>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh'
      }}>
        <div style={{ flex: 1 }}>
          <Routes>
            {/* ===== PUBLIC ROUTES ===== */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/logs" element={<Logs />} />


            {/* ===== PROTECTED ROUTES WITH PERMISSIONS ===== */}

            {/* Home - requires invoice permission */}
            <Route path="/" element={
              <ProtectedRoute>
                <PermissionRoute requiredPermission="invoice">
                  <Invoice />
                </PermissionRoute>
              </ProtectedRoute>
            } />

            <Route path="/dashboard" element={
              <ProtectedRoute>
                <PermissionRoute requiredPermission="dashboard">
                  <Dashboard />
                </PermissionRoute>
              </ProtectedRoute>
            } />

            {/* Customer - requires customer permission */}
            <Route path="/customer" element={
              <ProtectedRoute>
                <PermissionRoute requiredPermission="customer">
                  <Customer />
                </PermissionRoute>
              </ProtectedRoute>
            } />

            {/* Admin Users - requires admin permission */}
            <Route path="/admin" element={
              <ProtectedRoute>
                <PermissionRoute requiredPermission="admin">
                  <AdminUsers />
                </PermissionRoute>
              </ProtectedRoute>
            } />
            <Route path="/promo" element={
              <ProtectedRoute>
                <PermissionRoute requiredPermission="promo">
                  <PromoCodes />
                </PermissionRoute>
              </ProtectedRoute>
            } />
            <Route path="/packages" element={
              <ProtectedRoute>
                <PermissionRoute requiredPermission="packages">
                  <Packages />
                </PermissionRoute>
              </ProtectedRoute>
            } />
            <Route path="/workshop" element={
              <ProtectedRoute>
                <PermissionRoute requiredPermission="workshop">
                  <Workshops />
                </PermissionRoute>
              </ProtectedRoute>
            } />
            <Route path="/report" element={
              <ProtectedRoute>
                <PermissionRoute requiredPermission="reports">
                  <Reports />
                </PermissionRoute>
              </ProtectedRoute>
            } />

            <Route path="/inventory/bottles" element={
              <ProtectedRoute>
                <PermissionRoute requiredPermission="inventory">
                  <BottleInventory />
                </PermissionRoute>
              </ProtectedRoute>
            } />
            <Route path="/inventory/xp" element={
              <ProtectedRoute>
                <PermissionRoute requiredPermission="inventory">
                  <XPInventory />
                </PermissionRoute>
              </ProtectedRoute>
            } />
            <Route path="/inventory/dispenser" element={
              <ProtectedRoute>
                <PermissionRoute requiredPermission="inventory">
                  <DispenserInventory />
                </PermissionRoute>
              </ProtectedRoute>
            } />
            <Route path="/productdisposal" element={
              <ProtectedRoute>
                <PermissionRoute requiredPermission="dispose">
                  <ProductDisposal />
                </PermissionRoute>
              </ProtectedRoute>
            } />

            {/* ===== SMART REDIRECT FOR ROOT (Optional) ===== */}
            {/* You can add this as a separate route if needed */}
            {/* <Route path="/smart-redirect" element={<SmartRedirect />} /> */}

            {/* ===== FALLBACK ROUTE ===== */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

      </div>
    </BrowserRouter>
  );
}

export default App;