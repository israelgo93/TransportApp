///home/phiuser/phi/transporte-app/pages/_app.js
import '../styles/globals.css';
import Layout from '../components/Layout';
import { Toaster } from 'react-hot-toast';

function MyApp({ Component, pageProps }) {
  return (
    <Layout>
      <Toaster position="top-center" />
      <Component {...pageProps} />
    </Layout>
  );
}

export default MyApp;