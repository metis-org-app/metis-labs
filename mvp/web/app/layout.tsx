import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Metis',
  description: 'Gestión curricular, inclusión y evaluaciones con el asistente Metis',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
