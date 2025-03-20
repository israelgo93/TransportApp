///home/phiuser/phi/transporte-app/components/RequireAuth.js
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/AuthContext';

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Utilizamos useEffect con dependencias correctas para evitar ejecuciones innecesarias
  useEffect(() => {
    // Solo verificar después de que se complete la carga inicial
    if (!loading) {
      if (!user) {
        // Si no hay usuario, redirigir a login con la ruta actual como parámetro
        const currentPath = router.asPath;
        
        // Usamos router.push en lugar de un navegador manual para mantener
        // consistencia con el sistema de navegación de Next.js
        router.push(`/login?redirect=${encodeURIComponent(currentPath)}`);
      } else {
        setIsAuthorized(true);
      }
    }
  }, [user, loading, router]); // Dependencias explícitas y mínimas

  // Memoizamos el contenido de carga para evitar re-renderizaciones innecesarias
  const loadingContent = useMemo(() => (
    <div className="flex justify-center items-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4">Verificando acceso...</p>
      </div>
    </div>
  ), []); // Sin dependencias ya que es constante

  // Mostrar un indicador de carga mientras se verifica
  if (loading || !isAuthorized) {
    return loadingContent;
  }

  // Si está autorizado, mostrar el contenido
  return children;
}