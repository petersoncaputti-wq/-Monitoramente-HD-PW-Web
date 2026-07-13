import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';

function AuthenticatedApp() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-50 px-4 py-10">
        <div className="rounded-[24px] border border-brand-100 bg-white px-6 py-5 text-sm text-surface-700 shadow-soft">
          Carregando sessao...
        </div>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return <LoginPage />;
  }

  return <DashboardPage />;
}

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}

export default App;
