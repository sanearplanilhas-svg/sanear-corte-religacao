import { useState } from "react";
import { supabase } from "../supabaseClient";

interface AddUserFormProps {
  onClose: () => void;
  onUserAdded: () => void;
}

export default function AddUserForm({ onClose, onUserAdded }: AddUserFormProps) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [role, setRole] = useState("visitante");
  const [setor, setSetor] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (senha !== confirmarSenha) {
      alert("As senhas não coincidem!");
      return;
    }

    setLoading(true);

    // 1) Cria o usuário no Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { full_name: nome }, // grava no raw_user_meta_data
      },
    });

    if (error) {
      alert("Erro ao cadastrar: " + error.message);
      setLoading(false);
      return;
    }

    // 2) Atualiza o app_users com informações extras
    if (data.user) {
      await supabase.from("app_users").update({
        full_name: nome,
        role,
        setor,
      }).eq("id", data.user.id);
    }

    setLoading(false);
    alert("Usuário cadastrado com sucesso!");
    onUserAdded();
    onClose();
  };

  const handleClear = () => {
    setNome("");
    setEmail("");
    setSenha("");
    setConfirmarSenha("");
    setRole("visitante");
    setSetor("");
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-xl p-6 w-96 shadow-lg">
        <h2 className="text-xl font-bold mb-4">Adicionar Usuário</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Nome completo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
          <input
            type="password"
            placeholder="Confirmar Senha"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />

          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full border p-2 rounded"
          >
            <option value="adm">ADM</option>
            <option value="diretor">Diretor</option>
            <option value="operador">Operador</option>
            <option value="terceirizada">Terceirizada</option>
            <option value="visitante">Visitante</option>
          </select>

          <input
            type="text"
            placeholder="Setor de Trabalho"
            value={setor}
            onChange={(e) => setSetor(e.target.value)}
            className="w-full border p-2 rounded"
          />

          <div className="flex justify-between mt-4">
            <button
              type="button"
              onClick={handleClear}
              className="bg-gray-400 text-white px-3 py-1 rounded"
            >
              Limpar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-3 py-1 rounded"
            >
              {loading ? "Cadastrando..." : "Cadastrar"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-red-500 text-white px-3 py-1 rounded"
            >
              Fechar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
