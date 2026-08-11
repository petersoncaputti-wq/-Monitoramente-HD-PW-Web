import { FormEvent, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch {
      setErrorMessage('E-mail ou senha inválidos, ou usuário sem perfil de acesso.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-50 px-4 py-10">
      <section className="w-full max-w-sm rounded-[24px] border border-brand-100 bg-white p-6 shadow-soft">
        <div className="mb-6 flex justify-center">
          <img
            src="/images/ecorodovias-logo.png"
            alt="Logo Ecorodovias"
            className="h-auto w-full max-w-[210px] object-contain"
          />
        </div>

        <h1 className="text-xl font-semibold text-surface-900">
          Painel de indicadores de Sistemas de Engenharia
        </h1>
        <p className="mt-2 text-sm text-surface-600">Acesse com seu usuário autorizado.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-surface-700">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-brand-100 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-surface-700">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-brand-100 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>

          {errorMessage ? (
            <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
