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

// NOVA tela: importação em lote de OS de Corte (PDF)
import ImportarOSCorte from "./pages/ImportarOSCorte";

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

        {/* NOVA rota: Importar OS de Corte (PDF em lote) */}
        <Route path="/importar-os-corte" element={<ImportarOSCorte />} />

        {/* Rota coringa: manda pro dashboard */}
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
