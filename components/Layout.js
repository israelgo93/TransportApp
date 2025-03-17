///home/phiuser/phi/transporte-app/components/Layout.js
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

export default function Layout({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setLoading(false);

      const { data: authListener } = supabase.auth.onAuthStateChange(
        (event, session) => {
          setUser(session?.user || null);
        }
      );

      return () => {
        authListener.subscription.unsubscribe();
      };
    };

    getUser();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
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