import { ApiProperty } from '@nestjs/swagger';
import {
	ArrayMinSize,
	IsArray,
	IsInt,
	IsNotEmpty,
	IsString,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VariantReportedDto } from './variant-reported';
import { ReferencesReportedDto } from './references-reported.dto';

export class CreateReportDto {
	@ApiProperty({
		example: 'Report_Sample01',
		description: 'Report name',
	})
	@IsNotEmpty()
	@IsString()
	report_name: string;

	@ApiProperty({
		example: 4,
		description: 'Analysis ID',
	})
	@IsInt()
	@Type(() => Number)
	analysisId: number;

	@ApiProperty({
		type: [VariantReportedDto],
		description: 'List of variants to make the report',
	})
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => VariantReportedDto)
	@ArrayMinSize(1, {
		message: 'At least one variant must be included in the report',
	})
	variants: VariantReportedDto[];

	@ApiProperty({
		type: [ReferencesReportedDto],
		description: 'List of references to include in the report',
	})
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => ReferencesReportedDto)
	references: ReferencesReportedDto[];
}
