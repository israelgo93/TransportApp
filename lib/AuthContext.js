import { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
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
  
  // Ref para verificar si el componente está montado
  const isMounted = useRef(true);
  
  // Ref para controlar intentos de fetching
  const fetchAttempts = useRef({});

  // Función para obtener el perfil del usuario (memoizada para evitar recreaciones)
  const fetchProfile = useCallback(async (userId) => {
    if (!userId || !isMounted.current) return;
    
    // Sistema de reintentos
    if (!fetchAttempts.current[userId]) {
      fetchAttempts.current[userId] = { count: 0, lastAttempt: 0 };
    }
    
    const now = Date.now();
    const attempts = fetchAttempts.current[userId];
    
    // Evitar demasiados reintentos
    if (attempts.count > 5) {
      console.log(`Demasiados intentos para perfil ${userId}, esperando 30 segundos`);
      if (now - attempts.lastAttempt < 30000) return;
      attempts.count = 0; // Reiniciar intentos después de 30s
    }
    
    // Verificar si ha pasado suficiente tiempo entre intentos
    if (now - attempts.lastAttempt < 2000) {
      console.log(`Intento muy reciente para ${userId}, ignorando`);
      return;
    }
    
    attempts.lastAttempt = now;
    attempts.count++;
    
    // Manejo de caché de forma segura
    let useCache = false;
    try {
      if (typeof sessionStorage !== 'undefined') {
        const cacheKey = `profile-${userId}`;
        const cachedTimestamp = sessionStorage.getItem(`${cacheKey}-timestamp`);
        
        if (cachedTimestamp && now - parseInt(cachedTimestamp) < 10000) {
          const cachedProfile = sessionStorage.getItem(cacheKey);
          if (cachedProfile) {
            try {
              const parsedProfile = JSON.parse(cachedProfile);
              setProfile(parsedProfile);
              useCache = true;
              console.log('Usando perfil en caché para:', userId);
            } catch (e) {
              console.warn('Error al analizar perfil en caché:', e);
            }
          }
        }
      }
    } catch (storageError) {
      console.warn('Error accediendo a sessionStorage:', storageError);
    }
    
    // Si usamos caché, no hacemos fetch
    if (useCache) return;
    
    try {
      console.log(`Intentando cargar perfil para ${userId}, intento #${attempts.count}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      clearTimeout(timeoutId);
      
      if (!isMounted.current) return;
      
      if (error) {
        console.error('Error al cargar perfil:', error);
        // No establecer el perfil como nulo si ya tenemos uno
        if (!profile) setProfile(null);
      } else if (data) {
        setProfile(data);
        attempts.count = 0; // Reiniciar contador si tuvimos éxito
        
        // Guardar en caché si está disponible
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(`profile-${userId}`, JSON.stringify(data));
            sessionStorage.setItem(`profile-${userId}-timestamp`, now.toString());
          }
        } catch (e) {
          console.warn('Error al guardar perfil en caché:', e);
        }
      }
    } catch (error) {
      console.error('Error inesperado al cargar perfil:', error);
      // Programar un reintento solo si el error no es de aborto
      if (error.name !== 'AbortError' && isMounted.current) {
        setTimeout(() => {
          if (isMounted.current) fetchProfile(userId);
        }, Math.min(1000 * attempts.count, 5000)); // Backoff exponencial
      }
    }
  }, [profile]);

  // Efecto para limpiar al desmontar
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Efecto centralizado para manejar la autenticación
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Obtener sesión actual
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error al obtener sesión:', error);
          setLoading(false);
          return;
        }

        const currentUser = session?.user || null;
        setUser(currentUser);
        
        // Si hay un usuario, obtener su perfil
        if (currentUser && isMounted.current) {
          fetchProfile(currentUser.id).catch(err => 
            console.error('Error al inicializar perfil:', err)
          );
        }
        
        if (isMounted.current) setLoading(false);
        
        // Suscribirse a cambios en la autenticación
        const { data: authListener } = supabase.auth.onAuthStateChange(
          async (event, newSession) => {
            console.log('Evento de autenticación:', event);
            
            if (!isMounted.current) return;
            
            const newUser = newSession?.user || null;
            
            // Actualizar usuario solo si hay un cambio real
            if (JSON.stringify(currentUser) !== JSON.stringify(newUser)) {
              setUser(newUser);
              
              if (newUser) {
                fetchProfile(newUser.id).catch(err => 
                  console.error('Error al actualizar perfil:', err)
                );
              } else {
                setProfile(null);
              }
            }
          }
        );
        
        return () => {
          authListener?.subscription?.unsubscribe();
        };
      } catch (error) {
        console.error('Error inesperado en initAuth:', error);
        if (isMounted.current) setLoading(false);
      }
    };
    
    initAuth();
  }, [fetchProfile]); // Solo fetchProfile como dependencia

  // Funciones de autenticación
  const signIn = useCallback(async (email, password) => {
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
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      // Limpiar memoria caché
      try {
        if (typeof sessionStorage !== 'undefined') {
          Object.keys(sessionStorage).forEach(key => {
            if (key.startsWith('profile-')) {
              sessionStorage.removeItem(key);
            }
          });
        }
      } catch (e) {
        console.warn('Error al limpiar caché:', e);
      }
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
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
  }, []);

  const updateProfile = useCallback(async (profileData) => {
    if (!user) return { success: false, error: 'No hay usuario autenticado' };
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update(profileData)
        .eq('id', user.id);

      if (error) throw error;
      
      // Actualizar el perfil en el estado
      setProfile(prevProfile => {
        const updatedProfile = { ...(prevProfile || {}), ...profileData };
        
        // Actualizar caché
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(`profile-${user.id}`, JSON.stringify(updatedProfile));
            sessionStorage.setItem(`profile-${user.id}-timestamp`, Date.now().toString());
          }
        } catch (e) {
          console.warn('Error al actualizar caché:', e);
        }
        
        return updatedProfile;
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error al actualizar perfil:', error);
      return { success: false, error };
    }
  }, [user]);

  // Memoizar el valor del contexto
  const contextValue = useMemo(() => ({
    user,
    profile,
    loading,
    signIn,
    signOut,
    resetPassword,
    updateProfile
  }), [user, profile, loading, signIn, signOut, resetPassword, updateProfile]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}