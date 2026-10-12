// Marca de Metis Campus (misma hoja de laurel que la landing de metis-website).
export function MarcaIcono({ chica = false }: { chica?: boolean }) {
  const t = chica ? 17 : 22;
  return (
    <span className={`brand-mark ${chica ? 'sm' : ''}`} aria-hidden="true">
      <svg width={t} height={t} viewBox="0 0 24 24" fill="none">
        <path d="M12 2.5c-3 2.2-4.6 5-4.6 8.1 0 3.4 2 6.4 4.6 8.9 2.6-2.5 4.6-5.5 4.6-8.9 0-3.1-1.6-5.9-4.6-8.1z" stroke="#E9D9AE" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 21.5V8.8M12 12.4c-1.6-.4-2.7-1.4-3.4-2.8M12 15.2c1.6-.4 2.7-1.4 3.4-2.8" stroke="#E9D9AE" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Marca({ chica = false }: { chica?: boolean }) {
  return (
    <>
      <MarcaIcono chica={chica} />
      <span>
        Metis <em>Campus</em>
      </span>
    </>
  );
}
