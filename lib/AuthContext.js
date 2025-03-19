///home/phiuser/phi/transporte-app/lib/AuthContext.js
import { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from './supabase';
import { useRouter } from 'next/router';

// Crear el contexto de autenticación
const AuthContext = createContext();

// Hook personalizado para acceder al contexto
export function useAuth() {
  return useContext(AuthContext);
}

// Proveedor del contexto para envolver la aplicación
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    // Función para obtener la sesión actual
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error al obtener sesión:', error);
          if (mounted) setLoading(false);
          return;
        }

        // Actualizar el estado solo si el componente sigue montado
        if (mounted) {
          setUser(session?.user || null);
          
          // Si hay un usuario, obtener su perfil
          if (session?.user) {
            await fetchProfile(session.user.id);
          } else {
            setLoading(false);
          }
        }
      } catch (error) {
        console.error('Error inesperado al obtener sesión:', error);
        if (mounted) setLoading(false);
      }
    };

    // Obtener perfil del usuario
    const fetchProfile = async (userId) => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (error && mounted) {
          console.error('Error al cargar perfil:', error);
          setProfile(null);
        } else if (mounted) {
          setProfile(data);
        }
      } catch (error) {
        console.error('Error inesperado al cargar perfil:', error);
        if (mounted) setProfile(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    // Iniciar carga de sesión
    getSession();

    // Suscribirse a los cambios de autenticación
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Evento de autenticación:', event);
        
        if (mounted) {
          setUser(session?.user || null);
          
          if (session?.user) {
            await fetchProfile(session.user.id);
          } else {
            setProfile(null);
            setLoading(false);
          }
        }
      }
    );

    // Limpieza al desmontar
    return () => {
      mounted = false;
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  // Funciones de autenticación
  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      return { success: false, error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // No redirigir aquí, ya que el evento onAuthStateChange se encargará de actualizar el estado
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const resetPassword = async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error al solicitar restablecimiento:', error);
      return { success: false, error };
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update(profileData)
        .eq('id', user.id);

      if (error) throw error;
      
      // Actualizar el perfil en el estado
      setProfile({
        ...profile,
        ...profileData
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error al actualizar perfil:', error);
      return { success: false, error };
    }
  };

  // Valor del contexto
  const value = {
    user,
    profile,
    loading,
    signIn,
    signOut,
    resetPassword,
    updateProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}