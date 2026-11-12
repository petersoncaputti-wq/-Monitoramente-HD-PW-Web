import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [samlEnabled, setSamlEnabled] = useState(false);
  const [samlUnavailable, setSamlUnavailable] = useState(false);
  const samlErrorCode = new URLSearchParams(window.location.search).get('saml_error');
  const samlError = samlErrorCode === 'access_denied'
    ? 'Sua identidade corporativa ainda não está vinculada a um usuário ativo do painel. Acione o administrador.'
    : samlErrorCode === 'login_failed'
      ? 'Não foi possível concluir o login corporativo. Inicie uma nova tentativa neste painel.'
      : '';

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/saml/config', { credentials: 'same-origin', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(config => { setSamlEnabled(config.enabled === true); setSamlUnavailable(config.unavailable === true); })
      .catch(() => { if (!controller.signal.aborted) setSamlUnavailable(true); });
    return () => controller.abort();
  }, []);

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

        {samlEnabled ? <a href="/api/auth/saml/login" className="mt-6 flex w-full items-center justify-center rounded-2xl bg-brand-700 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-brand-800">Entrar com Microsoft</a> : null}
        {samlEnabled ? <p className="mt-2 text-center text-xs text-surface-700">Conta corporativa · Microsoft Entra ID</p> : null}
        {samlError ? <p role="alert" className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{samlError}</p> : null}
        {samlUnavailable ? <p role="status" className="mt-4 text-sm text-surface-700">Login corporativo indisponível. Utilize seu acesso local autorizado.</p> : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {samlEnabled ? <p className="border-t border-brand-100 pt-4 text-xs font-medium text-surface-700">Acesso local com e-mail e senha</p> : null}
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
