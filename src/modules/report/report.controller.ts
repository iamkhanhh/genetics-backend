import {
	Controller,
	Get,
	Post,
	Body,
	Param,
	Delete,
	Request,
	Query,
	UseGuards,
} from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiParam,
	ApiQuery,
} from '@nestjs/swagger';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UsageLimitGuard } from '@/auth/passport/usage-limit.guard';
import { RequiresPlanFeature } from '@/decorators/requires-plan-feature.decorator';

@UseGuards(UsageLimitGuard)
@RequiresPlanFeature('report')
@ApiTags('Report')
@Controller('report')
export class ReportController {
	constructor(private readonly reportService: ReportService) {}

	@Post()
	@ApiOperation({ summary: 'Create a new report' })
	@ApiResponse({ status: 201, description: 'Report created successfully' })
	@ApiResponse({ status: 400, description: 'Bad request' })
	create(@Body() createReportDto: CreateReportDto, @Request() req) {
		return this.reportService.create(createReportDto, req.user.id);
	}

	@Get()
	@ApiOperation({ summary: 'Get all reports of current user' })
	@ApiQuery({ name: 'analysis_id', required: true, type: Number })
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'pageSize', required: false, type: Number })
	@ApiResponse({
		status: 200,
		description: 'List of reports returned successfully',
	})
	findAll(@Request() req, @Query('analysis_id') analysis_id: string) {
		return this.reportService.findAll(req.user.id, +analysis_id);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get report by id' })
	@ApiResponse({ status: 200, description: 'Report found' })
	@ApiResponse({ status: 404, description: 'Report not found' })
	findOne(@Request() req, @Param('id') id: string) {
		return this.reportService.findOne(req.user.id, +id);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete report (soft delete)' })
	@ApiParam({ name: 'id', example: 1 })
	@ApiResponse({ status: 200, description: 'Report deleted successfully' })
	remove(@Request() req, @Param('id') id: string) {
		return this.reportService.delete(req.user.id, +id);
	}

	@Post('pgx/:analysisId')
	createPgx(@Param('analysisId') analysisId: string, @Request() req) {
		return this.reportService.createPgxReport(+analysisId, req.user.id);
	}
}
