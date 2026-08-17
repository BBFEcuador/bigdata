import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  ContactoDataportal,
  PersonaNominaDataportal,
  PropiedadDataportal,
  VehiculoDataportal,
} from '../../application/ports/dataportal-navigator';
import {
  DataportalObservacionesRepository,
  IdentidadObservacionesDataportal,
} from '../../application/ports/dataportal-observaciones.repository';

@Injectable()
export class PostgresDataportalObservacionesRepository implements DataportalObservacionesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  reemplazarContactos(
    identidad: IdentidadObservacionesDataportal,
    datos: ContactoDataportal[],
  ): Promise<void> {
    return this.reemplazar(
      identidad,
      [...new Map(datos.map((dato) => [dato.valor, dato])).values()],
      'dataportal_contacto',
      async (manager, dato) => {
        await manager.query(
          `INSERT INTO dataportal_contacto
             (contribuyente_id, ruc, valor, tipo, tipo_codigo)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            identidad.contribuyenteId,
            identidad.ruc,
            dato.valor,
            dato.tipo,
            dato.tipoCodigo,
          ],
        );
      },
    );
  }

  reemplazarNomina(
    identidad: IdentidadObservacionesDataportal,
    datos: PersonaNominaDataportal[],
  ): Promise<void> {
    return this.reemplazar(
      identidad,
      [...new Map(datos.map((dato) => [dato.cedula, dato])).values()],
      'dataportal_nomina',
      async (manager, dato) => {
        await manager.query(
          `INSERT INTO dataportal_nomina
             (contribuyente_id, ruc, cedula, nombre, ocupacion, sueldo, fecha_ingreso)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            identidad.contribuyenteId,
            identidad.ruc,
            dato.cedula,
            dato.nombre,
            dato.rol,
            dato.posibleSalario,
            dato.fechaIngreso,
          ],
        );
      },
    );
  }

  reemplazarPropiedades(
    identidad: IdentidadObservacionesDataportal,
    datos: PropiedadDataportal[],
  ): Promise<void> {
    return this.reemplazar(
      identidad,
      [...new Map(datos.map((dato) => [dato.cedulaCatastral, dato])).values()],
      'dataportal_propiedad',
      async (manager, dato) => {
        await manager.query(
          `INSERT INTO dataportal_propiedad
             (contribuyente_id, ruc, cedula_catastral, parroquia, codigo_calle,
              calle_principal, numero, barrio_sector, zona, telefono)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            identidad.contribuyenteId,
            identidad.ruc,
            dato.cedulaCatastral,
            dato.parroquia,
            dato.codigoCalle,
            dato.callePrincipal,
            dato.numero,
            dato.barrioSector,
            dato.zona,
            dato.telefono,
          ],
        );
      },
    );
  }

  reemplazarVehiculos(
    identidad: IdentidadObservacionesDataportal,
    datos: VehiculoDataportal[],
  ): Promise<void> {
    return this.reemplazar(
      identidad,
      [...new Map(datos.map((dato) => [dato.placa, dato])).values()],
      'dataportal_vehiculo',
      async (manager, dato) => {
        await manager.query(
          `INSERT INTO dataportal_vehiculo
             (contribuyente_id, ruc, tipo, modelo, marca, anio, placa, lugar,
              fecha_vencimiento)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            identidad.contribuyenteId,
            identidad.ruc,
            dato.tipo,
            dato.modelo,
            dato.marca,
            dato.anio,
            dato.placa,
            dato.lugar,
            dato.fechaVencimiento,
          ],
        );
      },
    );
  }

  private async reemplazar<T>(
    identidad: IdentidadObservacionesDataportal,
    datos: T[],
    tabla: TablaDataportal,
    insertar: (manager: EntityManager, dato: T) => Promise<void>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // `tabla` sólo puede venir de la unión cerrada; ningún dato externo forma SQL.
      await manager.query(`DELETE FROM ${tabla} WHERE contribuyente_id = $1`, [
        identidad.contribuyenteId,
      ]);
      for (const dato of datos) await insertar(manager, dato);
    });
  }
}

type TablaDataportal =
  | 'dataportal_contacto'
  | 'dataportal_nomina'
  | 'dataportal_propiedad'
  | 'dataportal_vehiculo';
