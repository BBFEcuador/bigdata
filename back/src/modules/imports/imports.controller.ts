import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { promises as fs } from 'node:fs';
import { ImportJobsService } from './import-jobs.service';
import { CompaniasImportService } from './companias/companias-import.service';
import { CatalogoImportService } from './catalogo/catalogo-import.service';
import { CiiuImportService } from './ciiu/ciiu-import.service';
import { BalancesImportService } from './balances/balances-import.service';
import {
  multerConfigBalances,
  multerConfigCatalogo,
  multerConfigCiiu,
  multerConfigCompanias,
} from './multer.config';
import { IMPORT_KIND, IMPORT_KIND_CATALOGO, IMPORT_KIND_CIIU } from './imports.constants';
import { IMPORT_KIND_BALANCES } from './balances/balances.constants';
import { ImportJob } from './entities/import-job.entity';

@Controller('imports')
export class ImportsController {
  constructor(
    private readonly jobs: ImportJobsService,
    private readonly companias: CompaniasImportService,
    private readonly catalogo: CatalogoImportService,
    private readonly ciiu: CiiuImportService,
    private readonly balances: BalancesImportService,
  ) {}

  /**
   * Excel de compañías. Devuelve 202 de inmediato: la carga tarda minutos y
   * mantener la petición HTTP abierta garantizaría timeouts en cualquier proxy.
   */
  @Post('companias')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', multerConfigCompanias))
  async subirCompanias(@UploadedFile() file: Express.Multer.File, @Query('modo') modo?: string) {
    const job = await this.crearJob(file, IMPORT_KIND, modo);
    this.companias.enqueue(job.id);
    return this.respuesta(job);
  }

  /**
   * Catálogo de cuentas en texto plano. Este import tarda milisegundos, pero
   * usa el mismo contrato de job que el de compañías para que el frontend no
   * tenga que distinguir entre los dos.
   */
  @Post('catalogo-cuentas')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', multerConfigCatalogo))
  async subirCatalogo(@UploadedFile() file: Express.Multer.File, @Query('modo') modo?: string) {
    const job = await this.crearJob(file, IMPORT_KIND_CATALOGO, modo);
    this.catalogo.enqueue(job.id);
    return this.respuesta(job);
  }

  /**
   * Catálogo CIIU en Excel. El nombre viene repartido en seis columnas, una por
   * nivel jerárquico; el parseo de eso vive en `ciiu/ciiu-file.parser.ts`.
   */
  @Post('ciiu')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', multerConfigCiiu))
  async subirCiiu(@UploadedFile() file: Express.Multer.File, @Query('modo') modo?: string) {
    const job = await this.crearJob(file, IMPORT_KIND_CIIU, modo);
    this.ciiu.enqueue(job.id);
    return this.respuesta(job);
  }

  /**
   * Balances de un ejercicio, en texto plano separado por tabuladores.
   *
   * Un archivo = un año. El formulario NO se pide ni se deduce del nombre: se
   * detecta por el plan de cuentas del encabezado, porque el sufijo del nombre
   * de archivo señala formularios distintos según el año.
   */
  @Post('balances')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', multerConfigBalances))
  async subirBalances(@UploadedFile() file: Express.Multer.File, @Query('modo') modo?: string) {
    const job = await this.crearJob(file, IMPORT_KIND_BALANCES, modo);
    this.balances.enqueue(job.id);
    return this.respuesta(job);
  }

  /**
   * Alta del job, común a todos los tipos.
   *
   * El bloqueo de "un import activo" es POR TIPO, así que una carga de catálogo
   * y una de compañías pueden convivir sin estorbarse.
   */
  private async crearJob(
    file: Express.Multer.File,
    kind: string,
    modo?: string,
  ): Promise<ImportJob> {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo en el campo "file".');
    }

    const modoImport = modo === 'parcial' ? 'parcial' : 'snapshot_completo';

    const activo = await this.jobs.hayJobActivo(kind);
    if (activo) {
      await fs.unlink(file.path).catch(() => undefined);
      throw new ConflictException(
        `Ya hay una importación de este tipo en curso (job ${activo.id}, ` +
          `estado "${activo.status}"). Espera a que termine.`,
      );
    }

    try {
      return await this.jobs.create({
        kind,
        status: 'pending',
        modo: modoImport,
        originalFilename: file.originalname,
        storedPath: file.path,
        fileSizeBytes: file.size,
      });
    } catch (err: any) {
      await fs.unlink(file.path).catch(() => undefined);
      // 23505 = índice único parcial de "un import activo": otra petición ganó
      // la carrera entre la comprobación de arriba y este INSERT.
      if (err?.code === '23505') {
        throw new ConflictException('Ya hay una importación de este tipo en curso.');
      }
      throw err;
    }
  }

  private respuesta(job: ImportJob) {
    return {
      jobId: job.id,
      status: job.status,
      modo: job.modo,
      statusUrl: `/imports/${job.id}`,
    };
  }

  @Get()
  listar(@Query('kind') kind?: string) {
    return this.jobs.findRecent(20, kind);
  }

  @Get(':id')
  async detalle(@Param('id', ParseUUIDPipe) id: string) {
    const job = await this.jobs.findOne(id);
    if (!job) throw new NotFoundException(`No existe el job ${id}`);
    return job;
  }

  @Get(':id/rechazos')
  async rechazos(@Param('id', ParseUUIDPipe) id: string) {
    const job = await this.jobs.findOne(id);
    if (!job) throw new NotFoundException(`No existe el job ${id}`);
    return {
      total: job.rowsRejected + job.rowsWarned,
      mostrando: this.jobs.maxStoredRejects,
      filas: await this.jobs.findRejects(id),
    };
  }
}
