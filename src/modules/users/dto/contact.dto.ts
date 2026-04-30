import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsEmail,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';

export enum InterestedIn {
	PIPELINE = 'Pipeline',
	ANALYSIS_FLOW = 'Analysis flow',
	PAYMENT_SERVICE = 'Payment Service',
	ACCOUNT_MANAGEMENT = 'Account Management',
	REPORT_GENERATION = 'Report Generation',
	OTHER = 'Other',
}

export class ContactDto {
	@ApiProperty({ example: 'Nguyen Van A' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	name: string;

	@ApiProperty({ example: 'user@example.com' })
	@IsEmail()
	email: string;

	@ApiPropertyOptional({ example: '+84 123 456 789' })
	@IsString()
	@IsOptional()
	@MaxLength(20)
	phone?: string;

	@ApiProperty({ enum: InterestedIn, example: InterestedIn.PIPELINE })
	@IsEnum(InterestedIn)
	interestedIn: InterestedIn;

	@ApiProperty({ example: 'I would like to know more about...' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(2000)
	message: string;
}
