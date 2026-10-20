import type { Metadata } from 'next';
import './globals.css';
import { DemoAviso } from '@/components/demo-aviso';

export const metadata: Metadata = {
  title: 'Metis Campus',
  description: 'Gestión curricular, inclusión y evaluaciones con el asistente Metis',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* Tipografías de la landing de Metis Campus */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap"
        />
      </head>
      <body>
        {children}
        {process.env.NEXT_PUBLIC_DEMO === '1' && <DemoAviso />}
      </body>
    </html>
  );
}
