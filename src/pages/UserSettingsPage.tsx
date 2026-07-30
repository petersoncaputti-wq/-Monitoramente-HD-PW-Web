import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUserProfiles,
  updateAdminUser,
  updateMyPassword,
  updateMyProfile,
} from '@/services/supabaseRestClient';
import type { AppRole, UserProfile } from '@/types/auth';

interface UserFormState {
  email: string;
  fullName: string;
  password: string;
  role: AppRole;
}

const emptyUserForm: UserFormState = {
  email: '',
  fullName: '',
  password: '',
  role: 'user',
};

export function UserSettingsPage() {
  const { accessToken, profile, setProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);
  const [personalName, setPersonalName] = useState(profile?.full_name ?? '');
  const [personalPassword, setPersonalPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  async function loadUsers() {
    if (!accessToken || profile?.role !== 'admin') {
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      setUsers(await listAdminUserProfiles(accessToken));
      setStatus('idle');
    } catch {
      setMessage('Não foi possível carregar usuários.');
      setStatus('error');
    }
  }

  function startCreateUser() {
    setSelectedUserId(null);
    setUserForm(emptyUserForm);
    setMessage('');
  }

  function startEditUser(user: UserProfile) {
    setSelectedUserId(user.id);
    setUserForm({
      email: user.email,
      fullName: user.full_name ?? '',
      password: '',
      role: user.role,
    });
    setMessage('');
  }

  async function handleUserSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    setStatus('saving');
    setMessage('');

    try {
      const savedUser = selectedUser
        ? await updateAdminUser(accessToken, {
            fullName: userForm.fullName,
            id: selectedUser.id,
            role: userForm.role,
          })
        : await createAdminUser(accessToken, userForm);

      setUsers((currentUsers) => {
        const exists = currentUsers.some((user) => user.id === savedUser.id);
        const nextUsers = exists
          ? currentUsers.map((user) => (user.id === savedUser.id ? savedUser : user))
          : [...currentUsers, savedUser];

        return nextUsers.sort((a, b) => a.email.localeCompare(b.email));
      });
      setSelectedUserId(savedUser.id);
      setUserForm({
        email: savedUser.email,
        fullName: savedUser.full_name ?? '',
        password: '',
        role: savedUser.role,
      });
      setStatus('idle');
      setMessage('Usuário salvo.');
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error && error.message
          ? `Não foi possível salvar o usuário: ${error.message}`
          : 'Não foi possível salvar o usuário.',
      );
    }
  }

  async function handleDeleteUser(user: UserProfile) {
    if (!accessToken || user.id === profile?.id) {
      return;
    }

    const confirmed = window.confirm(`Excluir o usuário ${user.email}?`);

    if (!confirmed) {
      return;
    }

    setStatus('saving');
    setMessage('');

    try {
      await deleteAdminUser(accessToken, user.id);
      setUsers((currentUsers) => currentUsers.filter((currentUser) => currentUser.id !== user.id));

      if (selectedUserId === user.id) {
        startCreateUser();
      }

      setStatus('idle');
      setMessage('Usuário excluído.');
    } catch {
      setStatus('error');
      setMessage('Não foi possível excluir o usuário.');
    }
  }

  async function handlePersonalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !profile) {
      return;
    }

    setStatus('saving');
    setMessage('');

    try {
      const normalizedPersonalName = personalName.trim();
      let updatedProfile = profile;

      if (normalizedPersonalName !== (profile.full_name ?? '')) {
        updatedProfile = await updateMyProfile(accessToken, normalizedPersonalName);
      }

      if (personalPassword.trim()) {
        await updateMyPassword(accessToken, personalPassword);
        setPersonalPassword('');
      }

      setProfile(updatedProfile);
      setStatus('idle');
      setMessage('Dados pessoais atualizados.');
    } catch {
      setStatus('error');
      setMessage('Não foi possível atualizar seus dados.');
    }
  }

  useEffect(() => {
    setPersonalName(profile?.full_name ?? '');
  }, [profile?.full_name]);

  useEffect(() => {
    void loadUsers();
  }, [accessToken, profile?.role]);

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
            Minha conta
          </p>
          <h2 className="mt-2 text-lg font-semibold text-surface-900">Dados pessoais</h2>
        </div>

        <form className="mt-5 grid gap-4 md:grid-cols-3" onSubmit={handlePersonalSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-surface-700">Email</span>
            <input
              type="email"
              value={profile?.email ?? ''}
              disabled
              className="mt-2 w-full rounded-2xl border border-brand-100 bg-surface-50 px-4 py-3 text-sm text-surface-500 outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-surface-700">Nome</span>
            <input
              type="text"
              value={personalName}
              onChange={(event) => setPersonalName(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-brand-100 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-surface-700">Nova senha</span>
            <input
              type="password"
              value={personalPassword}
              onChange={(event) => setPersonalPassword(event.target.value)}
              minLength={6}
              className="mt-2 w-full rounded-2xl border border-brand-100 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={status === 'saving'}
              className="inline-flex items-center justify-center rounded-2xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === 'saving' ? 'Salvando...' : 'Salvar meus dados'}
            </button>
          </div>
        </form>
      </section>

      {profile?.role === 'admin' ? (
        <section className="rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
                Configurações
              </p>
              <h2 className="mt-2 text-lg font-semibold text-surface-900">
                Usuários e permissões
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={startCreateUser}
                className="inline-flex items-center justify-center rounded-2xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-800"
              >
                Novo usuário
              </button>
              <button
                type="button"
                onClick={() => void loadUsers()}
                disabled={status === 'loading' || status === 'saving'}
                className="inline-flex items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'loading' ? 'Atualizando...' : 'Atualizar'}
              </button>
            </div>
          </div>

          {message ? (
            <p
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                status === 'error'
                  ? 'border-red-100 bg-red-50 text-red-700'
                  : 'border-brand-100 bg-brand-50 text-brand-700'
              }`}
            >
              {message}
            </p>
          ) : null}

          <form
            className="mt-5 grid gap-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 md:grid-cols-4"
            onSubmit={handleUserSubmit}
          >
            <label className="block">
              <span className="text-sm font-medium text-surface-700">Email</span>
              <input
                type="email"
                value={userForm.email}
                onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
                disabled={Boolean(selectedUser)}
                required
                className="mt-2 w-full rounded-2xl border border-brand-100 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-surface-50 disabled:text-surface-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-surface-700">Nome</span>
              <input
                type="text"
                value={userForm.fullName}
                onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })}
                className="mt-2 w-full rounded-2xl border border-brand-100 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-surface-700">Senha inicial</span>
              <input
                type="password"
                value={userForm.password}
                onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                required={!selectedUser}
                disabled={Boolean(selectedUser)}
                minLength={6}
                className="mt-2 w-full rounded-2xl border border-brand-100 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-surface-50 disabled:text-surface-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-surface-700">Permissão</span>
              <select
                value={userForm.role}
                onChange={(event) =>
                  setUserForm({ ...userForm, role: event.target.value as AppRole })
                }
                disabled={selectedUser?.id === profile.id}
                className="mt-2 w-full rounded-2xl border border-brand-100 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-surface-50 disabled:text-surface-500"
              >
                <option value="user">Usuário padrão</option>
                <option value="admin">Administrador</option>
              </select>
            </label>

            <div className="flex flex-wrap gap-2 md:col-span-4">
              <button
                type="submit"
                disabled={status === 'saving'}
                className="inline-flex items-center justify-center rounded-2xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'saving' ? 'Salvando...' : selectedUser ? 'Salvar usuário' : 'Criar usuário'}
              </button>
              {selectedUser ? (
                <button
                  type="button"
                  onClick={startCreateUser}
                  className="inline-flex items-center justify-center rounded-2xl border border-brand-100 bg-white px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
                >
                  Cancelar edição
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-5 overflow-hidden rounded-2xl border border-brand-100">
            <table className="min-w-full divide-y divide-brand-100 text-left text-sm">
              <thead className="bg-brand-50 text-xs uppercase tracking-[0.14em] text-brand-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Permissão</th>
                  <th className="px-4 py-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100 bg-white text-surface-700">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">{user.full_name || '-'}</td>
                    <td className="px-4 py-3">
                      {user.role === 'admin' ? 'Administrador' : 'Usuário padrão'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEditUser(user)}
                          className="rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteUser(user)}
                          disabled={user.id === profile.id}
                          className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
