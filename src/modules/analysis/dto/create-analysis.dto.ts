import { AnalysisSequencingType } from '@/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAnalysisDto {
	@ApiProperty({ example: 'Analysis_Sample01', description: 'Analysis name' })
	@IsNotEmpty()
	@IsString()
	name: string;

	@ApiProperty({ example: 1, description: 'Sample ID to analyze' })
	@IsNotEmpty()
	sample_id: number;

	@ApiProperty({ example: 1, description: 'Workspace ID' })
	@IsNotEmpty()
	project_id: number;

	@ApiProperty({ example: 'vcf', description: 'Processing type' })
	@IsNotEmpty()
	@IsString()
	p_type: string;

	@ApiPropertyOptional({ example: 1024, description: 'File size in bytes' })
	@IsOptional()
	size: number;

	@ApiPropertyOptional({
		example: 'WGS analysis for patient sample',
		description: 'Analysis description',
	})
	@IsOptional()
	@IsString()
	description: string;

	@ApiProperty({ example: 1, description: 'Pipeline ID to use' })
	@IsNotEmpty()
	pipeline_id: number;

	@ApiProperty({ example: 'hg19', description: 'Genome assembly version' })
	@IsNotEmpty()
	@IsString()
	@IsEnum(['hg19', 'hg38'], { message: 'assembly must be either hg19 or hg38' })
	assembly: string;

	@ApiProperty({
		example: 'WGS',
		description: 'Sequencing type',
		enum: AnalysisSequencingType,
	})
	@IsNotEmpty()
	@IsString()
	@IsEnum(AnalysisSequencingType)
	sequencing_type: AnalysisSequencingType;
}
