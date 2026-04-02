import { Module } from '@nestjs/common';
import { VariantsService } from './variants.service';
import { VariantsController } from './variants.controller';
import { GeneClinicalSynopsis } from '@/entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisModule } from '../analysis/analysis.module';

@Module({
	imports: [TypeOrmModule.forFeature([GeneClinicalSynopsis]), AnalysisModule],
	controllers: [VariantsController],
	providers: [VariantsService],
	exports: [VariantsService],
})
export class VariantsModule {}
