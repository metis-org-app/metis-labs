'use client';

import { useEffect, useState } from 'react';
import { Modal } from './ui';

type Pedido = { mensaje: string; accion: string; resolver: (ok: boolean) => void };

let mostrar: ((p: Pedido) => void) | null = null;

/** Confirmación dentro de la página (reemplaza window.confirm). */
export function confirmar(mensaje: string, accion = 'Eliminar'): Promise<boolean> {
  return new Promise((resolver) => {
    if (mostrar) mostrar({ mensaje, accion, resolver });
    else resolver(false);
  });
}

export function ConfirmHost() {
  const [pedido, setPedido] = useState<Pedido | null>(null);

  useEffect(() => {
    mostrar = setPedido;
    return () => {
      mostrar = null;
    };
  }, []);

  if (!pedido) return null;
  const cerrar = (ok: boolean) => {
    pedido.resolver(ok);
    setPedido(null);
  };

  return (
    <Modal title="Confirmar" onClose={() => cerrar(false)}>
      <p>{pedido.mensaje}</p>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={() => cerrar(false)}>
          Cancelar
        </button>
        <button className="btn btn-danger" onClick={() => cerrar(true)} autoFocus>
          {pedido.accion}
        </button>
      </div>
    </Modal>
  );
}
