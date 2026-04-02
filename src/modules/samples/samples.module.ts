import { Module } from '@nestjs/common';
import { SamplesService } from './samples.service';
import { SamplesController } from './samples.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Samples } from '@/entities';
import { UploadsModule } from '../uploads/uploads.module';
import { PatientInformationModule } from '../patient-information/patient-information.module';

@Module({
	imports: [
		TypeOrmModule.forFeature([Samples]),
		UploadsModule,
		PatientInformationModule,
	],
	controllers: [SamplesController],
	providers: [SamplesService],
	exports: [SamplesService],
})
export class SamplesModule {}
