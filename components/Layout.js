///home/phiuser/phi/transporte-app/components/Layout.js
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

export default function Layout({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Optimización del useEffect para evitar múltiples ejecuciones o bucles
  useEffect(() => {
    let isMounted = true; // Para evitar actualizar estados en componentes desmontados
    
    const getUser = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error al verificar sesión:', error);
          return;
        }
        
        // Solo actualizar el estado si el componente sigue montado
        if (isMounted) {
          setUser(session?.user || null);
          setLoading(false);
        }
        
        // Suscribirse a cambios en la autenticación
        const { data: authListener } = supabase.auth.onAuthStateChange(
          (event, newSession) => {
            // Solo actualizar el estado si el componente sigue montado
            if (isMounted) {
              setUser(newSession?.user || null);
            }
          }
        );
        
        // Limpieza de suscripción al desmontar
        return () => {
          if (authListener && authListener.subscription) {
            authListener.subscription.unsubscribe();
          }
        };
      } catch (e) {
        console.error('Error en getUser:', e);
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    getUser();
    
    // Función de limpieza para evitar actualizaciones en componente desmontado
    return () => {
      isMounted = false;
    };
  }, []); // Sin dependencias para evitar múltiples ejecuciones

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary text-white shadow-md">
        <nav className="container mx-auto px-4 py-3 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold">
            TransportApp Ecuador
          </Link>
          <div className="flex items-center space-x-4">
            <Link href="/rutas" className="hover:underline">
              Rutas y Horarios
            </Link>
            {!loading && (
              <>
                {user ? (
                  <>
                    <Link href="/reservaciones" className="hover:underline">
                      Mis Reservaciones
                    </Link>
                    <Link href="/perfil" className="hover:underline">
                      Mi Perfil
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="bg-secondary px-4 py-2 rounded hover:bg-opacity-90"
                    >
                      Cerrar Sesión
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="bg-secondary px-4 py-2 rounded hover:bg-opacity-90"
                    >
                      Iniciar Sesión
                    </Link>
                    <Link
                      href="/registro"
                      className="bg-accent text-black px-4 py-2 rounded hover:bg-opacity-90"
                    >
                      Registrarse
                    </Link>
                  </>
                )}
              </>
            )}
          </div>
        </nav>
      </header>
      <main className="flex-grow container mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="bg-gray-800 text-white py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <h3 className="text-lg font-bold">TransportApp Ecuador</h3>
              <p className="text-sm">Transporte seguro y confiable</p>
            </div>
            <div className="text-sm">
              <p>&copy; {new Date().getFullYear()} TransportApp Ecuador. Todos los derechos reservados.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}