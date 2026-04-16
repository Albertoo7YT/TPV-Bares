import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { ToastProvider } from "./context/ToastContext";
import AdminLayout from "./layouts/AdminLayout";
import AppLayout from "./layouts/AppLayout";
import CashRegisterPage from "./pages/admin/CashRegisterPage";
import BillsHistoryPage from "./pages/admin/BillsHistoryPage";
import CategoriesPage from "./pages/admin/CategoriesPage";
import DashboardPage from "./pages/admin/DashboardPage";
import DeviceLoginPage from "./pages/DeviceLoginPage";
import ProductsAdminPage from "./pages/admin/ProductsAdminPage";
import DevicesAdminPage from "./pages/admin/DevicesAdminPage";
import IngredientsPage from "./pages/admin/IngredientsPage";
import PrintersPage from "./pages/admin/PrintersPage";
import ReportsPage from "./pages/admin/ReportsPage";
import SettingsPage from "./pages/admin/SettingsPage";
import TablesAdminPage from "./pages/admin/TablesAdminPage";
import UsersAdminPage from "./pages/admin/UsersAdminPage";
import BillPage from "./pages/BillPage";
import KitchenUnavailablePage from "./pages/KitchenUnavailablePage";
import LoginPage from "./pages/LoginPage";
import OrderPage from "./pages/OrderPage";
import TablesPage from "./pages/TablesPage";
import TpvPage from "./pages/TpvPage";

function RootRedirect() {
  const { isAuthenticated, user, isReady, deviceAuthorized } = useAuth();

  if (!isReady) {
    return null;
  }

  if (!deviceAuthorized) {
    return <Navigate replace to="/device-login" />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate replace to="/login" />;
  }

  if (user.role === "KITCHEN") {
    return <Navigate replace to="/kitchen-disabled" />;
  }

  if (user.role === "ADMIN") {
    return <Navigate replace to="/admin" />;
  }

  return <Navigate replace to="/tables" />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootRedirect />} path="/" />
      <Route element={<DeviceLoginPage />} path="/device-login" />
      <Route element={<LoginPage />} path="/login" />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route element={<ProtectedRoute allowedRoles={["WAITER", "ADMIN"]} />}>
            <Route element={<TablesPage />} path="/tables" />
            <Route element={<TpvPage />} path="/tpv" />
            <Route element={<OrderPage />} path="/order/:tableId" />
            <Route element={<BillPage />} path="/bill/:tableId" />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["KITCHEN"]} />}>
            <Route element={<KitchenUnavailablePage />} path="/kitchen-disabled" />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
            <Route element={<BillsHistoryPage />} path="/bills" />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
          <Route element={<AdminLayout />}>
            <Route element={<DashboardPage />} path="/admin" />
            <Route element={<BillsHistoryPage />} path="/admin/bills" />
            <Route element={<CategoriesPage />} path="/admin/categories" />
            <Route element={<ProductsAdminPage />} path="/admin/products" />
            <Route element={<DevicesAdminPage />} path="/admin/devices" />
            <Route element={<IngredientsPage />} path="/admin/ingredients" />
            <Route element={<PrintersPage />} path="/admin/printers" />
            <Route element={<ReportsPage />} path="/admin/reports" />
            <Route element={<SettingsPage />} path="/admin/settings" />
            <Route element={<TablesAdminPage />} path="/admin/tables" />
            <Route element={<UsersAdminPage />} path="/admin/users" />
            <Route
              element={<CashRegisterPage />}
              path="/admin/cash-register"
            />
          </Route>
        </Route>
      </Route>

      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
