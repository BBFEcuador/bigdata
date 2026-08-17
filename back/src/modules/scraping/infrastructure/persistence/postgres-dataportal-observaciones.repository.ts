import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  DataportalObservacionesRepository,
  ReemplazoObservacionesDataportal,
} from '../../application/ports/dataportal-observaciones.repository';

@Injectable()
export class PostgresDataportalObservacionesRepository implements DataportalObservacionesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async reemplazar(datos: ReemplazoObservacionesDataportal): Promise<void> {
    const contactos = [
      ...new Map(datos.contactos.map((c) => [c.valor, c])).values(),
    ];
    const nomina = [
      ...new Map(datos.nomina.map((n) => [n.cedula, n])).values(),
    ];

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM dataportal_contacto WHERE contribuyente_id = $1`,
        [datos.contribuyenteId],
      );
      for (const contacto of contactos) {
        await manager.query(
          `INSERT INTO dataportal_contacto
             (contribuyente_id, ruc, valor, tipo, tipo_codigo)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            datos.contribuyenteId,
            datos.ruc,
            contacto.valor,
            contacto.tipo,
            contacto.tipoCodigo,
          ],
        );
      }

      await manager.query(
        `DELETE FROM dataportal_nomina WHERE contribuyente_id = $1`,
        [datos.contribuyenteId],
      );
      for (const persona of nomina) {
        await manager.query(
          `INSERT INTO dataportal_nomina
             (contribuyente_id, ruc, cedula, nombre, ocupacion, sueldo, fecha_ingreso)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            datos.contribuyenteId,
            datos.ruc,
            persona.cedula,
            persona.nombre,
            persona.rol,
            persona.posibleSalario,
            persona.fechaIngreso,
          ],
        );
      }
    });
  }
}
