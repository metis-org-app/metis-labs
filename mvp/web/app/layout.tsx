import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Profes TEA · Metis',
  description: 'Mantenedor de mallas curriculares chilenas por curso, nivel y OA',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
