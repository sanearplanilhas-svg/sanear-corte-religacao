import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface AppUser {
  id: string;
  email: string;
  nome: string;
  papel: string;
  is_blocked: boolean;
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  // formulário
  const [formData, setFormData] = useState({
    email: "",
    senha: "",
    confirmarSenha: "",
    nome: "",
    papel: "user",
  });

  async function fetchUsers() {
    setLoading(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("app_users")
      .select("id, email, nome, papel, is_blocked, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao buscar usuários:", error);
      setErrorMsg(error.message);
    } else {
      setUsers(data || []);
    }

    setLoading(false);
  }

  async function deleteUser(id: string) {
    const { error } = await supabase.from("app_users").delete().eq("id", id);

    if (error) {
      console.error("Erro ao excluir usuário:", error);
      alert("Erro ao excluir usuário: " + error.message);
    } else {
      setUsers((prev) => prev.filter((u) => u.id !== id));
    }
  }

  async function handleSaveUser() {
    if (!editingUser) {
      // Criar usuário novo
      if (formData.senha !== formData.confirmarSenha) {
        alert("As senhas não coincidem!");
        return;
      }

      const { data: authUser, error: authError } =
        await supabase.auth.admin.createUser({
          email: formData.email,
          password: formData.senha,
          email_confirm: true,
        });

      if (authError) {
        alert("Erro ao criar usuário: " + authError.message);
        return;
      }

      await supabase.from("app_users").insert([
        {
          id: authUser.user?.id,
          email: formData.email,
          nome: formData.nome,
          papel: formData.papel,
        },
      ]);
    } else {
      // Editar usuário existente
      await supabase
        .from("app_users")
        .update({
          nome: formData.nome,
          papel: formData.papel,
        })
        .eq("id", editingUser.id);
    }

    setEditingUser(null);
    setFormData({
      email: "",
      senha: "",
      confirmarSenha: "",
      nome: "",
      papel: "user",
    });
    fetchUsers();
  }

  function openEditModal(user: AppUser) {
    setEditingUser(user);
    setFormData({
      email: user.email,
      senha: "",
      confirmarSenha: "",
      nome: user.nome,
      papel: user.papel,
    });
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-6 text-gray-200">Usuários</h1>

      {errorMsg && (
        <div className="bg-red-800 text-white p-2 rounded mb-4">{errorMsg}</div>
      )}

      {/* Formulário de Cadastro / Edição sempre visível no TOPO */}
      <div className="bg-gray-900 w-full rounded-xl shadow-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-200 mb-4">
          {editingUser ? "Editar Usuário" : "Novo Usuário"}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            disabled={!!editingUser}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
            className="w-full p-2 rounded bg-gray-800 text-white"
          />

          <input
            type="text"
            placeholder="Nome completo"
            value={formData.nome}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            className="w-full p-2 rounded bg-gray-800 text-white"
          />

          {!editingUser && (
            <>
              <input
                type="password"
                placeholder="Senha"
                value={formData.senha}
                onChange={(e) =>
                  setFormData({ ...formData, senha: e.target.value })
                }
                className="w-full p-2 rounded bg-gray-800 text-white"
              />

              <input
                type="password"
                placeholder="Confirmar senha"
                value={formData.confirmarSenha}
                onChange={(e) =>
                  setFormData({ ...formData, confirmarSenha: e.target.value })
                }
                className="w-full p-2 rounded bg-gray-800 text-white"
              />
            </>
          )}

          <select
            value={formData.papel}
            onChange={(e) =>
              setFormData({ ...formData, papel: e.target.value })
            }
            className="w-full p-2 rounded bg-gray-800 text-white"
          >
            <option value="ADM">Administrador</option>
            <option value="Diretor">Diretor</option>
            <option value="Operador">Operador</option>
            <option value="Terceirizada">Terceirizada</option>
            <option value="Visitante">Visitante</option>
            <option value="user">Usuário</option>
          </select>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          {editingUser && (
            <button
              onClick={() => setEditingUser(null)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={handleSaveUser}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
          >
            {editingUser ? "Salvar Alterações" : "Cadastrar"}
          </button>
        </div>
      </div>

      {/* Lista de Usuários */}
      <div className="flex justify-end gap-3 mb-4">
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow"
          onClick={fetchUsers}
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg shadow">
        <table className="min-w-full bg-gray-900 text-gray-200">
          <thead className="bg-gray-800 text-gray-300">
            <tr>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-left">Papel</th>
              <th className="px-4 py-3 text-left">Criado em</th>
              <th className="px-4 py-3 text-left">Bloqueado</th>
              <th className="px-4 py-3 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-6 text-gray-400">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              users.map((user, i) => (
                <tr
                  key={user.id}
                  onDoubleClick={() => openEditModal(user)}
                  className={`cursor-pointer ${
                    i % 2 === 0 ? "bg-gray-900" : "bg-gray-800"
                  } hover:bg-gray-700`}
                >
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">{user.nome}</td>
                  <td className="px-4 py-3">{user.papel}</td>
                  <td className="px-4 py-3">
                    {new Date(user.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    {user.is_blocked ? (
                      <span className="px-2 py-1 text-xs bg-red-600 rounded">
                        Sim
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs bg-green-600 rounded">
                        Não
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteUser(user.id);
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                    >
                      🗑 Excluir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
