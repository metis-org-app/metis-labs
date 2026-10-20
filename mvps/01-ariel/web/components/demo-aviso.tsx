'use client';

import { useState } from 'react';

// Solo en la demo de presentación (NEXT_PUBLIC_DEMO=1): recuerda que los datos son de ejemplo y permite volver a empezar.
export function DemoAviso() {
  const [abierto, setAbierto] = useState(false);
  const restablecer = async () => {
    const { restablecer } = await import('@/demo/estado');
    restablecer();
    window.location.href = '/login';
  };
  return (
    <div className={`demo-aviso ${abierto ? 'abierto' : ''}`} role="status">
      <button className="demo-aviso-chip" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        ✦ Demo
      </button>
      {abierto && (
        <div className="demo-aviso-panel">
          <strong>Demo de presentación</strong>
          <p>Los datos son de ejemplo y lo que crees queda solo en este navegador. La IA está simulada.</p>
          <button className="btn btn-sm btn-ghost" onClick={restablecer}>
            Restablecer demo
          </button>
        </div>
      )}
    </div>
  );
}
