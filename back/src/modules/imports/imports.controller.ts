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
import { SriImportService } from './sri/sri-import.service';
import { DataportalImportService } from './dataportal/dataportal-import.service';
import { TurismoImportService } from './turismo/turismo-import.service';
import { CatastrosImportService } from './catastros/catastros-import.service';
import { WebImportService } from './web/web-import.service';
import {
  multerConfigBalances,
  multerConfigCatastros,
  multerConfigSri,
  multerConfigCatalogo,
  multerConfigCiiu,
  multerConfigCompanias,
  multerConfigTurismo,
} from './multer.config';
import {
  IMPORT_KIND,
  IMPORT_KIND_CATALOGO,
  IMPORT_KIND_CIIU,
} from './imports.constants';
import { IMPORT_KIND_BALANCES } from './balances/balances.constants';
import { IMPORT_KIND_SRI } from './sri/sri.constants';
import { IMPORT_KIND_DATAPORTAL } from './dataportal/dataportal.constants';
import { IMPORT_KIND_TURISMO } from './turismo/turismo.constants';
import { IMPORT_KIND_WEB } from './web/web.constants';
import {
  IMPORT_KIND_CATASTROS,
  TIPOS_CATASTRO,
  TipoCatastro,
} from './catastros/catastros.constants';
import { ImportJob } from './entities/import-job.entity';

@Controller('imports')
export class ImportsController {
  constructor(
    private readonly jobs: ImportJobsService,
    private readonly companias: CompaniasImportService,
    private readonly catalogo: CatalogoImportService,
    private readonly ciiu: CiiuImportService,
    private readonly balances: BalancesImportService,
    private readonly sri: SriImportService,
    private readonly dataportal: DataportalImportService,
    private readonly turismo: TurismoImportService,
    private readonly catastros: CatastrosImportService,
    private readonly web: WebImportService,
  ) {}

  /**
   * Excel de compañías. Devuelve 202 de inmediato: la carga tarda minutos y
   * mantener la petición HTTP abierta garantizaría timeouts en cualquier proxy.
   */
  @Post('companias')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', multerConfigCompanias))
  async subirCompanias(
    @UploadedFile() file: Express.Multer.File,
    @Query('modo') modo?: string,
  ) {
    const job = await this.crearJob(file, IMPORT_KIND, modo);
    this.companias.enqueue(job.id);
    return this.respuesta(job);
  }

  /** Catálogo de cuentas en texto plano. */
  @Post('catalogo-cuentas')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', multerConfigCatalogo))
  async subirCatalogo(
    @UploadedFile() file: Express.Multer.File,
    @Query('modo') modo?: string,
  ) {
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
  async subirCiiu(
    @UploadedFile() file: Express.Multer.File,
    @Query('modo') modo?: string,
  ) {
    const job = await this.crearJob(file, IMPORT_KIND_CIIU, modo);
    this.ciiu.enqueue(job.id);
    return this.respuesta(job);
  }
  /**
   * Balances de un ejercicio, en texto plano separado por tabuladores.
   * Un archivo = un año; el formulario se detecta por el plan de cuentas.
   */
  @Post('balances')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', multerConfigBalances))
  async subirBalances(
    @UploadedFile() file: Express.Multer.File,
    @Query('modo') modo?: string,
  ) {
    const job = await this.crearJob(file, IMPORT_KIND_BALANCES, modo);
    this.balances.enqueue(job.id);
    return this.respuesta(job);
  }

  /**
   * Padrón completo del SRI, un CSV por provincia. Siempre es parcial para no
   * marcar como ausentes los contribuyentes de las otras provincias.
   */
  @Post('sri')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', multerConfigSri))
  async subirSri(@UploadedFile() file: Express.Multer.File) {
    const job = await this.crearJob(file, IMPORT_KIND_SRI, 'parcial');
    this.sri.enqueue(job.id);
    return this.respuesta(job);
  }

  @Post('personas-naturales')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', multerConfigSri))
  async subirPersonasNaturales(
    @UploadedFile() file: Express.Multer.File,
    @Query('provincia') provincia?: string,
  ) {
    const provinciaNormalizada = provincia?.trim();
    if (!provinciaNormalizada) {
      if (file) await fs.unlink(file.path).catch(() => undefined);
      throw new BadRequestException(
        'El parámetro "provincia" es obligatorio para el padrón provincial.',
      );
    }
    if (provinciaNormalizada.length > 80) {
      if (file) await fs.unlink(file.path).catch(() => undefined);
      throw new BadRequestException(
        'El parámetro "provincia" no puede superar 80 caracteres.',
      );
    }

    const job = await this.crearJob(
      file,
      IMPORT_KIND_SRI,
      'parcial',
      provinciaNormalizada,
    );
    this.sri.enqueue(job.id);
    return this.respuesta(job);
  }
  /**
   * Catastro Nacional de Turismo del Ministerio de Turismo. Enlaza por RUC con
   * las tres poblaciones del proyecto, no sólo con las compañías.
   */
  @Post('turismo')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', multerConfigTurismo))
  async subirTurismo(
    @UploadedFile() file: Express.Multer.File,
    @Query('modo') modo?: string,
  ) {
    const job = await this.crearJob(file, IMPORT_KIND_TURISMO, modo);
    this.turismo.enqueue(job.id);
    return this.respuesta(job);
  }

  /**
   * Catastros tributarios del SRI. El tipo se detecta del título del archivo.
   */
  @Post('catastros')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', multerConfigCatastros))
  async subirCatastros(
    @UploadedFile() file: Express.Multer.File,
    @Query('modo') modo?: string,
    @Query('tipo') tipo?: string,
  ) {
    if (tipo && !TIPOS_CATASTRO.includes(tipo as TipoCatastro)) {
      if (file) await fs.unlink(file.path).catch(() => undefined);
      throw new BadRequestException(
        `Tipo de catastro desconocido "${tipo}". Valores válidos: ${TIPOS_CATASTRO.join(', ')}. ` +
          'Lo normal es no pasar este parámetro: el tipo se deduce del archivo.',
      );
    }
    const job = await this.crearJob(file, IMPORT_KIND_CATASTROS, modo);
    this.catastros.enqueue(job.id, tipo as TipoCatastro | undefined);
    return this.respuesta(job);
  }

  @Post('dataportal')
  @HttpCode(202)
  async lanzarDataportal(@Query('segmento') segmento?: string) {
    if (!process.env.DATAPORTAL_TOKEN) {
      throw new BadRequestException(
        'Falta DATAPORTAL_TOKEN en back/.env. Añádelo y reinicia el backend.',
      );
    }
    const activo = await this.jobs.hayJobActivo(IMPORT_KIND_DATAPORTAL);
    if (activo) {
      throw new ConflictException(
        `Ya hay un enriquecimiento en curso (job ${activo.id}). Detenlo antes de lanzar otro.`,
      );
    }
    const ambito = segmento
      ? await this.dataportal.resolverSegmento(segmento)
      : null;

    const job = await this.jobs.create({
      kind: IMPORT_KIND_DATAPORTAL,
      status: 'pending',
      modo: 'parcial',
      originalFilename: segmento
        ? `dataportalsys.com (API) · segmento ${segmento}`
        : 'dataportalsys.com (API)',
      storedPath: '',
      fileSizeBytes: 0,
    });
    this.dataportal.enqueue(job.id, segmento);
    return {
      ...this.respuesta(job),
      segmento: ambito && { codigo: segmento, ...ambito },
    };
  }

  /**
   * Rastreo de presencia digital: las propuestas quedan pendientes de revisión
   * manual y el avance se conserva en la base.
   */
  @Post('web')
  @HttpCode(202)
  async lanzarWeb() {
    const activo = await this.jobs.hayJobActivo(IMPORT_KIND_WEB);
    if (activo) {
      throw new ConflictException(
        `Ya hay un rastreo de presencia digital en curso (job ${activo.id}). Detenlo antes de lanzar otro.`,
      );
    }
    const job = await this.jobs.create({
      kind: IMPORT_KIND_WEB,
      status: 'pending',
      modo: 'parcial',
      originalFilename: 'rastreo de dominios (sin archivo)',
      storedPath: '',
      fileSizeBytes: 0,
    });
    this.web.enqueue(job.id);
    return this.respuesta(job);
  }

  /** Detiene el rastreo tras la compañía en curso; el avance queda guardado. */
  @Post('web/detener')
  @HttpCode(202)
  detenerWeb() {
    this.web.detener();
    return { detenido: true };
  }

  /** Avance del rastreo y cuánto queda por revisar a mano. */
  @Get('web/estado')
  estadoWeb() {
    return this.web.estado();
  }

  /** Detiene el enriquecimiento tras el RUC en curso; el avance queda guardado. */
  @Post('dataportal/detener')
  @HttpCode(202)
  detenerDataportal() {
    this.dataportal.detener();
    return { detenido: true };
  }

  /** Avance del enriquecimiento: cuántos RUC van por estado. */
  @Get('dataportal/estado')
  estadoDataportal() {
    return this.dataportal.estado();
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
    provincia?: string,
  ): Promise<ImportJob> {
    if (!file) {
      throw new BadRequestException(
        'No se recibió ningún archivo en el campo "file".',
      );
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
        provincia: provincia ?? null,
        originalFilename: file.originalname,
        storedPath: file.path,
        fileSizeBytes: file.size,
      });
    } catch (err: any) {
      await fs.unlink(file.path).catch(() => undefined);
      // 23505 = índice único parcial de "un import activo": otra petición ganó
      // la carrera entre la comprobación de arriba y este INSERT.
      if (err?.code === '23505') {
        throw new ConflictException(
          'Ya hay una importación de este tipo en curso.',
        );
      }
      throw err;
    }
  }

  private respuesta(job: ImportJob) {
    return {
      jobId: job.id,
      status: job.status,
      modo: job.modo,
      provincia: job.provincia,
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
