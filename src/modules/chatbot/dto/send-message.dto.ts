import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
	@ApiProperty({
		example: 'VCF là gì?',
		description: 'Message content to send to chatbot',
		maxLength: 1000,
	})
	@IsNotEmpty()
	@IsString()
	@MaxLength(1000)
	content: string;
}
