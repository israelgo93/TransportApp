///home/phiuser/phi/transporte-app/pages/_app.js
import '../styles/globals.css';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { Toaster } from 'react-hot-toast';
import { initNavigationService } from '../lib/navigationService';

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  
  // Inicializar el servicio de navegación con el router
  useEffect(() => {
    initNavigationService(router);
  }, [router]);

  return (
    <Layout>
      <Toaster position="top-center" />
      <Component {...pageProps} />
    </Layout>
  );
}

export default MyApp;