import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportsController } from './imports.controller';
import { ImportJobsService } from './import-jobs.service';
import { ImportRecoveryService } from './import-recovery.service';
import { CompaniasImportService } from './companias/companias-import.service';
import { CatalogoImportService } from './catalogo/catalogo-import.service';
import { CiiuImportService } from './ciiu/ciiu-import.service';
import { BalancesImportService } from './balances/balances-import.service';
import { SriImportService } from './sri/sri-import.service';
import { DataportalImportService } from './dataportal/dataportal-import.service';
import { ImportJob } from './entities/import-job.entity';
import { ImportRowReject } from './entities/import-row-reject.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ImportJob, ImportRowReject])],
  controllers: [ImportsController],
  providers: [
    ImportJobsService,
    ImportRecoveryService,
    CompaniasImportService,
    CatalogoImportService,
    CiiuImportService,
    BalancesImportService,
    SriImportService,
    DataportalImportService,
  ],
})
export class ImportsModule {}
