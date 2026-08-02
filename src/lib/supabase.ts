import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://olfbhboheiewqugmiqvy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sZmJoYm9oZWlld3F1Z21pcXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDM3MjQsImV4cCI6MjA5NTIxOTcyNH0.-7wMmoT1AnPtLiNiEnqbZifksXOOUZF8Eg-pZG8J_mE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

// FIX #9 (integridad de datos): Supabase/PostgREST trunca cualquier .select() a
// 1000 filas por defecto, SIN lanzar error — la query "funciona" pero devuelve
// solo las primeras 1000 filas en silencio. Con más de 1000 facturas o abonos,
// el sistema quedaba operando con datos incompletos sin ninguna señal de que
// faltaban registros.
//
// Esta función pagina con .range() hasta agotar la tabla. `buildQuery` recibe
// el rango (from, to) y debe devolver la query ya armada (con sus .eq/.order
// propios) para ese rango — así cada tabla puede tener sus propios filtros.
export async function fetchAllRows<T = any>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000
): Promise<T[]> {
  let allRows: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;

    const page = data ?? [];
    allRows = allRows.concat(page);

    // Si la página vino llena, probablemente hay más filas después.
    // Si vino incompleta (o vacía), ya llegamos al final de la tabla.
    hasMore = page.length === pageSize;
    from += pageSize;

    // Salvavidas: nunca debería activarse en datos reales de CAPECO.
    // Si se activa, es señal de un bug (p. ej. la tabla creciendo más
    // rápido de lo que se pagina) y preferimos frenar con un log claro
    // antes que quedar en un loop indefinido.
    if (from > 200_000) {
      console.error(
        `fetchAllRows: tope de seguridad de 200,000 filas alcanzado. ` +
        `Paginación detenida — revisar si la tabla realmente tiene ese volumen.`
      );
      break;
    }
  }

  return allRows;
}
