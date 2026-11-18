import { FormEvent, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { updateMyPassword } from '@/services/apiClient';

// Exibida quando o admin redefiniu a senha com "exigir troca no próximo acesso".
// O servidor bloqueia as demais APIs até a troca ser concluída.
export function ForcePasswordChangePage() {
  const { accessToken, logout, profile, setProfile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');

    if (!accessToken || !profile) return;

    if (password !== confirmation) {
      setErrorMessage('A confirmação não confere com a nova senha.');
      return;
    }

    if (password === currentPassword) {
      setErrorMessage('A nova senha deve ser diferente da senha temporária.');
      return;
    }

    setIsSubmitting(true);

    try {
      await updateMyPassword(accessToken, currentPassword, password);
      setProfile({ ...profile, must_change_password: false });
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message ? error.message : 'Não foi possível trocar a senha. Tente novamente.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClassName =
    'mt-2 w-full rounded-2xl border border-brand-100 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-50 px-4 py-10">
      <section className="w-full max-w-sm rounded-[24px] border border-brand-100 bg-white p-6 shadow-soft">
        <h1 className="text-xl font-semibold text-surface-900">Troque a sua senha</h1>
        <p className="mt-2 text-sm text-surface-600">
          A senha de <strong>{profile?.email}</strong> foi redefinida pelo administrador. Defina uma nova senha para
          continuar.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-surface-700">Senha temporária</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              autoComplete="current-password"
              className={inputClassName}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-surface-700">Nova senha</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              className={inputClassName}
            />
            <span className="mt-1 block text-xs text-surface-500">Mínimo de 12 caracteres.</span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-surface-700">Confirme a nova senha</span>
            <input
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              className={inputClassName}
            />
          </label>

          {errorMessage ? (
            <p role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar nova senha'}
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full rounded-2xl border border-brand-100 bg-white px-4 py-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
          >
            Sair
          </button>
        </form>
      </section>
    </main>
  );
}
