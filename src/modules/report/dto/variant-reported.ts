import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VariantReportedDto {
	@ApiProperty({
		example: '1_8395441_T_C',
		description: 'Variant IDentifier',
	})
	@IsString()
	id: string;

	@ApiProperty({
		example: 'ABCA4',
		description: 'Gene symbol',
	})
	@IsString()
	gene: string;

	@ApiProperty({
		example: 'NM_000350.3',
		description: 'Transcript ID',
	})
	@IsString()
	transcript: string;

	@ApiProperty({
		example: 'c.3113C>T',
		description: 'cDNA variant notation',
	})
	@IsString()
	cdna: string;

	@ApiProperty({
		example: '113:89',
		description: 'Read coverage at variant position',
	})
	@IsString()
	coverage: string;

	@ApiProperty({
		example: '0.00167921 / 0.000123047 / 0.00104076',
		description: 'Population frequency from gAD (ALL, AFR, AMR)',
	})
	@ApiProperty({
		example: '0.00167921 / 0.000123047 / 0.00104076',
		description: 'Population frequencies (ALL, AFR, AMR)',
	})
	@IsString()
	gad: string;

	@ApiProperty({
		example: 'pathogenic',
		description: 'Clinical classification of the variant',
	})
	@IsString()
	classification: string;
}
