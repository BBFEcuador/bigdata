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
import { TurismoImportService } from './turismo/turismo-import.service';
import { CatastrosImportService } from './catastros/catastros-import.service';
import { ImportJob } from './entities/import-job.entity';
import { ImportRowReject } from './entities/import-row-reject.entity';
import { BalancesModule } from '../balances/balances.module';

@Module({
  // BalancesModule entra por `PercentilesService`: al terminar un import de
  // balances hay que rehacer los percentiles sectoriales, o quedan calculados
  // contra una población que ya cambió.
  imports: [TypeOrmModule.forFeature([ImportJob, ImportRowReject]), BalancesModule],
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
    TurismoImportService,
    CatastrosImportService,
  ],
})
export class ImportsModule {}
