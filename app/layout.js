import './globals.css';

export const metadata = {
  title: 'Precio de Quema',
  description: 'Calculadora de costos de horno para cerámica',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
