import {
	Controller,
	Get,
	Post,
	Body,
	Patch,
	Param,
	Delete,
	ParseIntPipe,
	ParseArrayPipe,
	DefaultValuePipe,
	Query,
	Request,
} from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiParam,
	ApiQuery,
	ApiBody,
} from '@nestjs/swagger';
import { SamplesService } from './samples.service';
import { CreateSampleFastQDto } from './dto/create-sample-fastq.dto';
import { UpdateSampleDto } from './dto/update-sample.dto';
import { FilterSampleDto } from './dto/filter-sample.dto';
import { GenerateSinglePresignedUrl } from './dto/generate-single-presigned-url.dto';
import { PostFileInforDto } from './dto/post-file-infor.dto';
import { GeneratePresignedUrls } from './dto/generate-presigned-urls.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';

@ApiTags('Samples')
@Controller('samples')
export class SamplesController {
	constructor(private readonly samplesService: SamplesService) {}

	@Post()
	@ApiOperation({ summary: 'Create a new sample' })
	@ApiResponse({ status: 201, description: 'Sample created successfully' })
	@ApiResponse({ status: 400, description: 'Bad request' })
	create(@Body() createSampleFastQDto: CreateSampleFastQDto) {
		return this.samplesService.create(createSampleFastQDto);
	}

	@Post('fastq')
	@ApiOperation({ summary: 'Create samples from FASTQ files' })
	@ApiBody({ type: [CreateSampleFastQDto] })
	@ApiResponse({
		status: 201,
		description: 'FASTQ samples created successfully',
	})
	@ApiResponse({ status: 400, description: 'Bad request' })
	createSampleFastQ(
		@Body(new ParseArrayPipe({ items: CreateSampleFastQDto }))
		body: CreateSampleFastQDto[],
		@Request() req,
	) {
		return this.samplesService.createSampleFastQ(body, req.user.id);
	}

	@Post('load-samples')
	@ApiOperation({ summary: 'Get all samples with pagination and filters' })
	@ApiQuery({ name: 'page', example: 1, description: 'Page number' })
	@ApiQuery({
		name: 'pageSize',
		example: 10,
		description: 'Number of items per page',
	})
	@ApiResponse({ status: 200, description: 'Samples retrieved successfully' })
	findAll(
		@Request() req,
		@Query('page', ParseIntPipe, new DefaultValuePipe(1)) page: number,
		@Query('pageSize', ParseIntPipe, new DefaultValuePipe(10)) pageSize: number,
		@Body() filterSampleDto: FilterSampleDto,
	) {
		return this.samplesService.findAll(
			req.user.id,
			page,
			pageSize,
			filterSampleDto,
		);
	}

	@Post('generateSinglePresignedUrl')
	@ApiOperation({ summary: 'Generate a single presigned URL for file upload' })
	@ApiResponse({
		status: 201,
		description: 'Presigned URL generated successfully',
	})
	generateSinglePresignedUrl(
		@Body() generateSinglePresignedUrl: GenerateSinglePresignedUrl,
		@Request() req,
	) {
		return this.samplesService.generateSinglePresignedUrl(
			generateSinglePresignedUrl.fileName,
			req.user.id,
		);
	}

	@Post('startMultipartUpload')
	@ApiOperation({ summary: 'Start a multipart upload session' })
	@ApiResponse({
		status: 201,
		description: 'Multipart upload started successfully',
	})
	startMultipartUpload(
		@Body() generateSinglePresignedUrl: GenerateSinglePresignedUrl,
		@Request() req,
	) {
		return this.samplesService.startMultipartUpload(
			generateSinglePresignedUrl.fileName,
			req.user.id,
		);
	}

	@Post('generatePresignedUrls')
	@ApiOperation({
		summary: 'Generate presigned URLs for multipart upload parts',
	})
	@ApiResponse({
		status: 201,
		description: 'Presigned URLs generated successfully',
	})
	generatePresignedUrls(
		@Body() generatePresignedUrls: GeneratePresignedUrls,
		@Request() req,
	) {
		return this.samplesService.generatePresignedUrls(
			generatePresignedUrls,
			req.user.id,
		);
	}

	@Post('completeMultipartUpload')
	@ApiOperation({ summary: 'Complete a multipart upload' })
	@ApiResponse({
		status: 201,
		description: 'Multipart upload completed successfully',
	})
	@ApiResponse({ status: 400, description: 'Bad request' })
	completeMultipartUpload(
		@Body() completeUploadDto: CompleteUploadDto,
		@Request() req,
	) {
		return this.samplesService.completeMultipartUpload(
			completeUploadDto,
			req.user.id,
		);
	}

	@Post('postFileInfor')
	@ApiOperation({ summary: 'Post file information after upload' })
	@ApiResponse({
		status: 201,
		description: 'File information saved successfully',
	})
	@ApiResponse({ status: 400, description: 'Bad request' })
	postFileInfor(@Body() postFileInforDto: PostFileInforDto, @Request() req) {
		return this.samplesService.postFileInfor(postFileInforDto, req.user.id);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a sample by ID' })
	@ApiParam({ name: 'id', example: 1, description: 'Sample ID' })
	@ApiResponse({ status: 200, description: 'Sample retrieved successfully' })
	@ApiResponse({ status: 404, description: 'Sample not found' })
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.samplesService.findOne(id);
	}

	@Get('getSamplesByPipeLine/:id')
	@ApiOperation({ summary: 'Get samples by pipeline ID' })
	@ApiParam({ name: 'id', example: 1, description: 'Pipeline ID' })
	@ApiResponse({ status: 200, description: 'Samples retrieved successfully' })
	@ApiResponse({ status: 404, description: 'Pipeline not found' })
	async getSamplesByPipeLine(@Param('id', ParseIntPipe) id: number) {
		return await this.samplesService.getSamplesByPipeLine(id);
	}

	@Patch(':id')
	@ApiOperation({ summary: 'Update a sample' })
	@ApiParam({ name: 'id', example: 1, description: 'Sample ID' })
	@ApiResponse({ status: 200, description: 'Sample updated successfully' })
	@ApiResponse({ status: 404, description: 'Sample not found' })
	update(
		@Param('id', ParseIntPipe) id: number,
		@Body() updateSampleDto: UpdateSampleDto,
	) {
		return this.samplesService.update(id, updateSampleDto);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a sample' })
	@ApiParam({ name: 'id', example: 1, description: 'Sample ID' })
	@ApiResponse({ status: 200, description: 'Sample deleted successfully' })
	@ApiResponse({ status: 404, description: 'Sample not found' })
	remove(@Param('id', ParseIntPipe) id: number) {
		return this.samplesService.remove(id);
	}
}
