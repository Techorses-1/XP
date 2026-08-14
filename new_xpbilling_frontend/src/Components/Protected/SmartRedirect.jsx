import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const SmartRedirect = () => {
  const navigate = useNavigate();
  const [userPermissions, setUserPermissions] = useState([]);

  useEffect(() => {
    const fetchUserPermissions = async () => {
      try {
        // Fetch user permissions using cookie
        const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/me`, {
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          const permissions = data.user?.permissions || [];
          setUserPermissions(permissions);

          // If user has no permissions at all
          if (permissions.length === 0) {
            setTimeout(() => {
              navigate("/login", { replace: true });
            }, 3000);
            return;
          }

          // If user has admin permission, redirect to home (/)
          if (permissions.includes("admin")) {
            navigate("/", { replace: true });
            return;
          }

          // Route priority based on permissions
          const routePriority = [
            { path: "/", permission: "invoice" },
            { path: "/dashboard", permission: "dashboard" },
            { path: "/customer", permission: "customer" },
            { path: "/items", permission: "products" },
            { path: "/inventory", permission: "inventory" },
            { path: "/admin", permission: "admin" }
          ];

          const allowedRoute = routePriority.find(route =>
            permissions.includes(route.permission)
          );

          if (allowedRoute) {
            navigate(allowedRoute.path, { replace: true });
          } else {
            navigate("/login", { replace: true });
          }
        } else {
          navigate("/login", { replace: true });
        }
      } catch (error) {
        console.error("Error fetching permissions:", error);
        navigate("/login", { replace: true });
      }
    };

    fetchUserPermissions();
  }, [navigate]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      flexDirection: 'column',
      textAlign: 'center',
      padding: '20px'
    }}>
      <h2>Access Denied</h2>
      <p>You don't have proper permission to access this site.</p>
      <p style={{ color: '#666' }}>Please contact your administrator.</p>
      <p style={{ marginTop: '20px', color: '#999' }}>Redirecting to login...</p>
    </div>
  );
};

export default SmartRedirect;