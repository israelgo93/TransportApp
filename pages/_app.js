///home/phiuser/phi/transporte-app/pages/_app.js
import '../styles/globals.css';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { Toaster } from 'react-hot-toast';
import { initNavigationService } from '../lib/navigationService';
import { AuthProvider } from '../lib/AuthContext';

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  
  useEffect(() => {
    // Inicializar el servicio de navegación con el router
    initNavigationService(router);
    
    // Sistema de monitoreo para detectar recargas inesperadas
    if (typeof window !== 'undefined') {
      // Detectar recargas completas de página
      const logPageLoad = () => {
        const isReload = window.performance && window.performance.navigation.type === 1;
        if (isReload) {
          console.log(`RECARGA DETECTADA: ${window.location.pathname} en ${new Date().toISOString()}`);
          // Opcionalmente, podría enviarse a un servicio de análisis o telemetría
        }
      };
      
      // Ejecutar en la carga inicial
      logPageLoad();
      
      // Monitorear eventos de navegación posteriores
      router.events.on('routeChangeComplete', logPageLoad);
      
      // Limpiar evento al desmontar
      return () => {
        router.events.off('routeChangeComplete', logPageLoad);
      };
    }
  }, [router]);

  return (
    <AuthProvider>
      <Layout>
        <Toaster position="top-center" />
        <Component {...pageProps} />
      </Layout>
    </AuthProvider>
  );
}

export default MyApp;