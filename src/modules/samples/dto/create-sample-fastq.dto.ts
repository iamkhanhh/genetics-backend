import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsDate,
	IsNotEmpty,
	IsOptional,
	IsString,
	Min,
	ValidateNested,
} from 'class-validator';

export class FastqFileDto {
	@ApiProperty({ example: 1, description: 'Upload ID of the FASTQ file' })
	uploadId: number;

	@ApiProperty({
		example: 'sample_R1.fastq.gz',
		description: 'Upload file name',
	})
	@IsString()
	uploadName: string;
}

export class CreateSampleFastQDto {
	@ApiProperty({ example: 'Sample_001', description: 'Sample name' })
	@IsString()
	@IsNotEmpty()
	sampleName: string;

	@ApiProperty({ example: 'John', description: 'Patient first name' })
	@IsString()
	@IsNotEmpty()
	firstName: string;

	@ApiProperty({ example: 'Doe', description: 'Patient last name' })
	@IsString()
	@IsNotEmpty()
	lastName: string;

	@ApiProperty({ example: '1990-01-15', description: 'Patient date of birth' })
	@Type(() => Date)
	@IsDate()
	dob: Date;

	@ApiPropertyOptional({
		example: 'HP:0001263',
		description: 'Patient phenotype',
	})
	@IsOptional()
	@IsString()
	phenotype?: string;

	@ApiProperty({ example: 'fastq', description: 'File type' })
	@IsString()
	@IsNotEmpty()
	file_type: string;

	@ApiProperty({ example: 1024, description: 'File size in bytes' })
	@IsNotEmpty()
	@Min(1, { message: 'File size must be a positive integer' })
	file_size: number;

	@ApiProperty({ type: [FastqFileDto], description: 'Forward FASTQ files' })
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => FastqFileDto)
	@ArrayMinSize(1, { message: 'Exactly one forward FASTQ file is required' })
	@ArrayMaxSize(1, { message: 'Exactly one forward FASTQ file is required' })
	forward: FastqFileDto[];

	@ApiProperty({ type: [FastqFileDto], description: 'Reverse FASTQ files' })
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => FastqFileDto)
	@ArrayMinSize(1, { message: 'Exactly one reverse FASTQ file is required' })
	@ArrayMaxSize(1, { message: 'Exactly one reverse FASTQ file is required' })
	reverse: FastqFileDto[];
}
