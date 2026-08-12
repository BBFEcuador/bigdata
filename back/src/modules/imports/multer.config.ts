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
 */
export function crearMulterConfig(extensiones: string[], maxBytes: number): MulterOptions {
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
              `(recibido "${ext || 'sin extensión'}").`,
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
