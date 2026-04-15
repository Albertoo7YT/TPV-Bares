import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { StoredUser } from "../services/tokenStorage";

type ProtectedRouteProps = {
  allowedRoles?: StoredUser["role"][];
};

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user, isReady, deviceAuthorized } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return null;
  }

  if (!deviceAuthorized) {
    return <Navigate replace state={{ from: location }} to="/device-login" />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate replace to={getHomeRouteForRole(user.role)} />;
  }

  return <Outlet />;
}

function getHomeRouteForRole(role: StoredUser["role"]) {
  if (role === "KITCHEN") {
    return "/kitchen-disabled";
  }

  if (role === "ADMIN") {
    return "/admin";
  }

  return "/tables";
}
