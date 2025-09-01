// src/App.tsx
import { useAuth } from "./useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

// se precisar usar direto dentro do App (normalmente não precisa, mas se sim)
import Sidebar from "./components/Sidebar";
import PendingCutsTable from "./components/tables/PendingCutsTable";
import PendingReconnectionsTable from "./components/tables/PendingReconnectionsTable";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-200">
        Carregando...
      </div>
    );
  }

  return user ? <Dashboard /> : <Login />;
}
