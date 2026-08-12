import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Curación de la presencia digital.
 *
 * El rastreador propone; aquí una persona decide. Toda escritura de este
 * servicio lleva el usuario que la hizo y deja un evento en el histórico: sin
 * eso, un dato confirmado por un comercial y uno adivinado por un programa son
 * la misma fila, y la única razón para tener revisión humana es poder
 * distinguirlos.
 */

export const CANALES = [
  'web',
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'x',
  'youtube',
  'whatsapp',
  'telegram',
  'otra',
] as const;

export type Canal = (typeof CANALES)[number];

/**
 * La primera fila de un resultado de TypeORM, venga como venga.
 *
 * `query()` no devuelve la misma forma según la sentencia: un `INSERT ...
 * RETURNING` da las filas sueltas, y un `UPDATE ... RETURNING` da
 * `[filas, nAfectadas]`. Destructurar a ciegas funciona en el primer caso y
 * devuelve el array entero en el segundo — el endpoint responde `[{...}]` en vez
 * de `{...}` y el error aparece en el cliente, lejos de aquí.
 */
function primeraFila(res: unknown): unknown {
  if (!Array.isArray(res)) return res;
  const [primero] = res;
  return Array.isArray(primero) ? primero[0] : primero;
}

@Injectable()
export class PresenciaService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Todo lo que hay de una compañía, propuesto incluido, para la ficha. */
  async deCompania(expediente: string) {
    const [compania] = await this.dataSource.query(
      `SELECT expediente, nombre, ruc, sri_nombre_comercial FROM companias WHERE expediente = $1`,
      [expediente],
    );
    if (!compania) throw new NotFoundException(`No existe la compañía ${expediente}`);

    const canales = await this.dataSource.query(
      `SELECT id, canal, valor, handle, revision, fuente, indicios, nota,
              creado_por, creado_en, actualizado_por, actualizado_en
         FROM presencia_canal
        WHERE expediente = $1
        ORDER BY (revision = 'confirmado') DESC, canal, valor`,
      [expediente],
    );

    const historial = await this.dataSource.query(
      `SELECT canal, accion, valor_antes, valor_despues, usuario, nota, en
         FROM presencia_evento WHERE expediente = $1 ORDER BY en DESC LIMIT 50`,
      [expediente],
    );

    return { compania, canales, historial };
  }

  /**
   * La cola de revisión.
   *
   * Ordenada por indicio primero: las propuestas en cuya página aparecía el
   * nombre de la compañía son las que más probablemente se confirmen, y ponerlas
   * delante hace que la primera hora de revisión valga más que las siguientes.
   */
  async porRevisar(opciones: { canal?: string; limite?: number; desde?: string }) {
    const limite = Math.min(Math.max(Number(opciones.limite ?? 50), 1), 500);
    const params: unknown[] = [limite];
    let filtro = '';
    if (opciones.canal) {
      this.exigirCanal(opciones.canal);
      params.push(opciones.canal);
      filtro += ` AND pc.canal = $${params.length}`;
    }
    if (opciones.desde) {
      params.push(opciones.desde);
      filtro += ` AND pc.expediente > $${params.length}`;
    }

    return this.dataSource.query(
      `SELECT pc.id, pc.expediente, c.nombre, c.ruc, c.sri_nombre_comercial,
              pc.canal, pc.valor, pc.handle, pc.indicios, pc.creado_en
         FROM presencia_canal pc
         JOIN companias c ON c.expediente = pc.expediente
        WHERE pc.revision = 'propuesto' ${filtro}
        ORDER BY (pc.indicios->>'nombre_en_pagina')::boolean DESC NULLS LAST,
                 pc.expediente, pc.canal
        LIMIT $1`,
      params,
    );
  }

  /** Cuánto queda por revisar, por canal. */
  async resumen() {
    const porCanal = await this.dataSource.query(
      `SELECT canal,
              count(*) FILTER (WHERE revision = 'propuesto')::int   AS propuestos,
              count(*) FILTER (WHERE revision = 'confirmado')::int  AS confirmados,
              count(*) FILTER (WHERE revision = 'descartado')::int  AS descartados
         FROM presencia_canal GROUP BY canal ORDER BY canal`,
    );
    const [companias] = await this.dataSource.query(
      `SELECT count(*)::int AS n FROM presencia_digital`,
    );
    return { porCanal, companiasConDatoConfirmado: Number(companias?.n ?? 0) };
  }

  /**
   * Confirma o descarta una propuesta.
   *
   * Descartar no borra: la fila se queda con `revision = 'descartado'` para que
   * el siguiente rastreo no la vuelva a proponer. Borrarla haría que el revisor
   * repitiese el mismo descarte en cada pasada.
   */
  async revisar(
    id: number,
    revision: 'confirmado' | 'descartado',
    usuario: string,
    nota?: string,
  ) {
    const fila = await this.exigirFila(id);
    const actualizada = primeraFila(
      await this.dataSource.query(
        `UPDATE presencia_canal
            SET revision = $2, nota = COALESCE($4, nota),
                actualizado_por = $3, actualizado_en = now()
          WHERE id = $1
          RETURNING *`,
        [id, revision, usuario, nota ?? null],
      ),
    );
    await this.evento(id, fila.expediente, fila.canal, revision, fila.valor, fila.valor, usuario, nota);
    return actualizada;
  }

  /**
   * Alta manual de un canal.
   *
   * Nace ya como `confirmado`: lo escribió una persona, no hay nada que
   * revisar. Es la vía por la que entra lo que el rastreador nunca va a
   * encontrar — un Instagram sin web que lo enlace, por ejemplo.
   */
  async crear(
    expediente: string,
    datos: { canal: string; valor: string; handle?: string; nota?: string },
    usuario: string,
  ) {
    this.exigirCanal(datos.canal);
    const valor = this.normalizar(datos.canal as Canal, datos.valor);

    const [existe] = await this.dataSource.query(
      `SELECT 1 FROM companias WHERE expediente = $1`,
      [expediente],
    );
    if (!existe) throw new NotFoundException(`No existe la compañía ${expediente}`);

    const [fila] = await this.dataSource.query(
      `INSERT INTO presencia_canal
         (expediente, canal, valor, handle, revision, fuente, nota, creado_por, actualizado_por)
       VALUES ($1,$2,$3,$4,'confirmado','manual',$5,$6,$6)
       ON CONFLICT (expediente, canal, valor) DO UPDATE
         SET revision = 'confirmado', fuente = 'manual',
             handle = COALESCE(EXCLUDED.handle, presencia_canal.handle),
             nota = COALESCE(EXCLUDED.nota, presencia_canal.nota),
             actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()
       RETURNING *`,
      [expediente, datos.canal, valor, datos.handle ?? null, datos.nota ?? null, usuario],
    );
    await this.evento(fila.id, expediente, datos.canal, 'alta', null, valor, usuario, datos.nota);
    return fila;
  }

  /** Corrige el valor de un canal: la URL estaba mal escrita o cambió. */
  async editar(
    id: number,
    datos: { valor?: string; handle?: string; nota?: string },
    usuario: string,
  ) {
    const fila = await this.exigirFila(id);
    const valor =
      datos.valor !== undefined ? this.normalizar(fila.canal as Canal, datos.valor) : fila.valor;

    const actualizada = primeraFila(
      await this.dataSource.query(
        `UPDATE presencia_canal
            SET valor = $2, handle = COALESCE($3, handle), nota = COALESCE($4, nota),
                revision = 'confirmado', fuente = 'manual',
                actualizado_por = $5, actualizado_en = now()
          WHERE id = $1
          RETURNING *`,
        [id, valor, datos.handle ?? null, datos.nota ?? null, usuario],
      ),
    );
    await this.evento(id, fila.expediente, fila.canal, 'edicion', fila.valor, valor, usuario, datos.nota);
    return actualizada;
  }

  /**
   * Borra una fila.
   *
   * Lo normal es descartar, no borrar: un descarte impide que el rastreador lo
   * vuelva a proponer y esto no. Se deja para limpiar errores de tecleo.
   */
  async borrar(id: number, usuario: string, nota?: string) {
    const fila = await this.exigirFila(id);
    await this.dataSource.query(`DELETE FROM presencia_canal WHERE id = $1`, [id]);
    // El evento se guarda SIN clave foránea a la fila, justo para que sobreviva
    // a este borrado: si no, borrar haría desaparecer también su historial.
    await this.evento(null, fila.expediente, fila.canal, 'borrado', fila.valor, null, usuario, nota);
    return { borrado: true, id };
  }

  private async exigirFila(id: number) {
    const [fila] = await this.dataSource.query(
      `SELECT * FROM presencia_canal WHERE id = $1`,
      [id],
    );
    if (!fila) throw new NotFoundException(`No existe el canal ${id}`);
    return fila;
  }

  private exigirCanal(canal: string): void {
    if (!CANALES.includes(canal as Canal)) {
      throw new BadRequestException(
        `Canal desconocido "${canal}". Válidos: ${CANALES.join(', ')}.`,
      );
    }
  }

  /**
   * Deja el valor en una forma comparable.
   *
   * Sin esto, `facebook.com/acme`, `https://facebook.com/acme/` y
   * `https://www.facebook.com/acme` son tres filas distintas para la misma
   * página, y el índice único no sirve de nada.
   *
   * El WhatsApp se guarda como el número, sin más: es un teléfono, y el enlace
   * `wa.me` es sólo una de sus formas.
   */
  private normalizar(canal: Canal, valor: string): string {
    const bruto = (valor ?? '').trim();
    if (bruto === '') throw new BadRequestException('El valor no puede estar vacío.');

    if (canal === 'whatsapp' || canal === 'telegram') {
      const soloDigitos = bruto.replace(/[^\d]/g, '');
      if (soloDigitos.length >= 7 && soloDigitos.length <= 15) return soloDigitos;
    }

    const conEsquema = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
    let url: URL;
    try {
      url = new URL(conEsquema);
    } catch {
      throw new BadRequestException(`"${valor}" no es una URL válida.`);
    }
    if (!url.hostname.includes('.')) {
      throw new BadRequestException(`"${valor}" no es una URL válida.`);
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const ruta = url.pathname.replace(/\/+$/, '');
    return `https://${host}${ruta}`;
  }

  private async evento(
    canalId: number | null,
    expediente: string,
    canal: string,
    accion: string,
    antes: string | null,
    despues: string | null,
    usuario: string,
    nota?: string,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO presencia_evento
         (canal_id, expediente, canal, accion, valor_antes, valor_despues, usuario, nota)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [canalId, expediente, canal, accion, antes, despues, usuario, nota ?? null],
    );
  }
}
