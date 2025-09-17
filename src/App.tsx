// src/App.tsx
import * as React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { useAuth } from "./useAuth";

// Páginas principais
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

// Telas adicionais
import PendingCutsTable from "./components/tables/PendingCutsTable";
import PendingReconnectionsTable from "./components/tables/PendingReconnectionsTable";
import OverlayPrint from "./pages/overlay-print";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-200">
        Carregando...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <BrowserRouter basename="/">
      <Routes>
        {/* Dashboard como tela inicial */}
        <Route path="/" element={<Dashboard />} />

        {/* Tabelas de ordens pendentes */}
        <Route path="/os-corte-pendentes" element={<PendingCutsTable />} />
        <Route path="/papeletas-pendentes" element={<PendingReconnectionsTable />} />

        {/* Tela de sobreposição de PDF */}
        <Route path="/overlay-print" element={<OverlayPrint />} />

        {/* Rota coringa: manda pro dashboard */}
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
