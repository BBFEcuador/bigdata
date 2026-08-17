import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';

export const UPLOAD_DIR =
  process.env.IMPORT_UPLOAD_DIR || join(process.cwd(), 'storage', 'uploads');

/** multer NO crea el destino: sin esto cada subida falla con ENOENT. */
export function ensureUploadDir(): void {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Construye la configuración de subida para un tipo de archivo.
 *
 * `diskStorage`, jamás `memoryStorage`: un archivo de 400 MB en un Buffer, más
 * la sobrecarga de V8, se come el heap del proceso él solo antes incluso de
 * empezar a parsear. Da igual que el catálogo pese 25 KB — la regla se mantiene
 * para que no haya dos caminos distintos según el tamaño.
 *
 * @param extensiones extensiones aceptadas, en minúscula y con punto (`.xlsx`)
 * @param maxBytes    tamaño máximo del archivo
 * @param ayuda       frase que se añade al error cuando la extensión no encaja
 */
export function crearMulterConfig(
  extensiones: string[],
  maxBytes: number,
  ayuda?: string,
): MulterOptions {
  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        ensureUploadDir();
        cb(null, UPLOAD_DIR);
      },
      filename: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase() || extensiones[0];
        cb(null, `${randomUUID()}${ext}`);
      },
    }),
    limits: {
      fileSize: maxBytes,
      files: 1,
    },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      if (!extensiones.includes(ext)) {
        cb(
          new BadRequestException(
            `Sólo se aceptan archivos ${extensiones.join(' o ')} ` +
            `(recibido "${ext || 'sin extensión'}").` +
            (ayuda ? ` ${ayuda}` : ''),
          ),
          false,
        );
        return;
      }
      cb(null, true);
    },
  };
}

/** Excel de compañías: hasta 800 MB. */
export const multerConfigCompanias = crearMulterConfig(['.xlsx'], 800 * 1024 * 1024);

/** Catálogo de cuentas: texto plano, unos pocos MB de sobra. */
export const multerConfigCatalogo = crearMulterConfig(['.txt', '.csv'], 32 * 1024 * 1024);

/** Catálogo CIIU: Excel de unos cientos de KB. */
export const multerConfigCiiu = crearMulterConfig(['.xlsx'], 32 * 1024 * 1024);

/** Balances: texto plano de ~250 MB por ejercicio; margen hasta 800 MB. */
export const multerConfigBalances = crearMulterConfig(['.txt'], 800 * 1024 * 1024);

/** Padrón del SRI: un CSV por provincia; Pichincha y Guayas rondan los 600 MB. */
export const multerConfigSri = crearMulterConfig(['.csv', '.txt'], 1200 * 1024 * 1024);

/** Catastro Nacional de Turismo: ~35.000 filas, unos 7 MB. */
export const multerConfigTurismo = crearMulterConfig(['.xlsx'], 64 * 1024 * 1024);

/**
 * Catastros del SRI: unos pocos miles de filas por hoja.
 *
 * Sólo `.xlsx`. Tres de los cuatro se publican en el formato binario `.xls` de
 * 1997, que la librería del proyecto no sabe leer; aceptarlos aquí daría un
 * error críptico a mitad del parseo en vez de uno claro en la subida.
 */
export const multerConfigCatastros = crearMulterConfig(
  ['.xlsx'],
  64 * 1024 * 1024,
  'El SRI publica varios catastros en el formato antiguo .xls: ábrelo en Excel o LibreOffice ' +
  'y guárdalo como "Libro de Excel (.xlsx)" antes de subirlo.',
);
