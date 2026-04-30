import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateSampleDto {
	@ApiProperty({ example: 'Sample_001', description: 'Sample name' })
	@IsString()
	sampleName: string;

	@ApiProperty({ example: '1', description: 'Complete status' })
	complete_status: number;

	@ApiProperty({
		example: 'hg19',
		description: 'Genome assembly',
	})
	@IsString()
	assembly: string;
}
