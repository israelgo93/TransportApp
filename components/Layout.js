import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import { navigateTo } from '../lib/navigationService';
import { useAuth } from '../lib/AuthContext'; // Importamos useAuth para acceder al contexto centralizado

export default function Layout({ children }) {
  const router = useRouter();
  // Reemplazamos la gestión local de usuario con el contexto centralizado
  const { user, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Eliminamos el useEffect que manejaba la autenticación
  // y mantenemos solo el efecto para cerrar el menú al cambiar de ruta
  useEffect(() => {
    setMenuOpen(false);
  }, [router.pathname]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigateTo('/');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary text-white shadow-md">
        <nav className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <Link href="/" className="text-xl font-bold">
              TransportApp Ecuador
            </Link>
            
            {/* Hamburger menu for mobile */}
            <button 
              className="lg:hidden focus:outline-none" 
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            >
              {menuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
              )}
            </button>
            
            {/* Desktop menu */}
            <div className="hidden lg:flex items-center space-x-6">
              <Link href="/" className="hover:underline">
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
                        className="bg-secondary px-4 py-2 rounded hover:bg-opacity-90 transition"
                      >
                        Cerrar Sesión
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        className="bg-secondary px-4 py-2 rounded hover:bg-opacity-90 transition"
                      >
                        Iniciar Sesión
                      </Link>
                      <Link
                        href="/registro"
                        className="bg-accent text-black px-4 py-2 rounded hover:bg-opacity-90 transition"
                      >
                        Registrarse
                      </Link>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          
          {/* Mobile menu */}
          <div className={`lg:hidden mt-3 ${menuOpen ? 'block' : 'hidden'}`}>
            <div className="flex flex-col space-y-2 pt-2 border-t border-white border-opacity-20">
              <Link href="/" className="py-2 hover:bg-white hover:bg-opacity-10 px-2 rounded">
                Rutas y Horarios
              </Link>
              {!loading && (
                <>
                  {user ? (
                    <>
                      <Link href="/reservaciones" className="py-2 hover:bg-white hover:bg-opacity-10 px-2 rounded">
                        Mis Reservaciones
                      </Link>
                      <Link href="/perfil" className="py-2 hover:bg-white hover:bg-opacity-10 px-2 rounded">
                        Mi Perfil
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="bg-secondary text-left px-4 py-2 rounded hover:bg-opacity-90 mt-2"
                      >
                        Cerrar Sesión
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col space-y-2 pt-2">
                      <Link
                        href="/login"
                        className="bg-secondary px-4 py-2 rounded hover:bg-opacity-90 text-center"
                      >
                        Iniciar Sesión
                      </Link>
                      <Link
                        href="/registro"
                        className="bg-accent text-black px-4 py-2 rounded hover:bg-opacity-90 text-center"
                      >
                        Registrarse
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
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
            <div className="flex flex-col md:flex-row gap-4 text-center md:text-left">
              <Link href="/" className="text-sm text-gray-300 hover:text-white">
                Rutas
              </Link>
              <Link href="/reservaciones" className="text-sm text-gray-300 hover:text-white">
                Mis Reservaciones
              </Link>
              <Link href="/perfil" className="text-sm text-gray-300 hover:text-white">
                Mi Perfil
              </Link>
            </div>
            <div className="text-sm mt-4 md:mt-0">
              <p>&copy; {new Date().getFullYear()} TransportApp Ecuador. Todos los derechos reservados.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}