///home/phiuser/phi/transporte-app/components/RequireAuth.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/AuthContext';

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // Solo verificar después de que se complete la carga inicial
    if (!loading) {
      if (!user) {
        // Si no hay usuario, redirigir a login con la ruta actual como parámetro
        const currentPath = router.asPath;
        router.push(`/login?redirect=${encodeURIComponent(currentPath)}`);
      } else {
        setIsAuthorized(true);
      }
    }
  }, [user, loading, router]);

  // Mostrar un indicador de carga mientras se verifica
  if (loading || !isAuthorized) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  // Si está autorizado, mostrar el contenido
  return children;
}