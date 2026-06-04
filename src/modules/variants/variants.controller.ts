import {
	Controller,
	Post,
	Body,
	Param,
	ParseIntPipe,
	DefaultValuePipe,
	Query,
	Get,
	Delete,
} from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiParam,
	ApiQuery,
} from '@nestjs/swagger';
import { VariantsService } from './variants.service';
import { FilterVariantsDto } from './dto/filter-variants.dto';
import { AddVariantsToReport } from './dto/add-variants-to-report.dto';
import { VariantToReportDto } from './dto/variant-to-report.dto';

@ApiTags('Variants')
@Controller('variants')
export class VariantsController {
	constructor(private readonly variantsService: VariantsService) {}

	@Post(':id')
	@ApiOperation({
		summary: 'Get variants for an analysis with pagination and filters',
	})
	@ApiParam({ name: 'id', example: 1, description: 'Analysis ID' })
	@ApiQuery({ name: 'page', example: 1, description: 'Page number' })
	@ApiQuery({
		name: 'pageSize',
		example: 10,
		description: 'Number of items per page',
	})
	@ApiResponse({ status: 200, description: 'Variants retrieved successfully' })
	@ApiResponse({ status: 404, description: 'Analysis not found' })
	findOne(
		@Param('id', ParseIntPipe) id: number,
		@Query('page', ParseIntPipe, new DefaultValuePipe(1)) page: number,
		@Query('pageSize', ParseIntPipe, new DefaultValuePipe(10)) pageSize: number,
		@Body() filter: FilterVariantsDto,
	) {
		return this.variantsService.findOne(id, page, pageSize, filter);
	}

	@Get('get-variants-selected/:id')
	@ApiOperation({ summary: 'Get selected variants for an analysis' })
	@ApiParam({ name: 'id', example: 1, description: 'Analysis ID' })
	@ApiResponse({
		status: 200,
		description: 'Selected variants retrieved successfully',
	})
	@ApiResponse({ status: 404, description: 'Analysis not found' })
	getVariantsSelected(@Param('id', ParseIntPipe) id: number) {
		return this.variantsService.getVariantsSelected(id);
	}

	@Delete(':id/delete-selected-variant')
	@ApiOperation({ summary: 'Delete a selected variant from an analysis' })
	@ApiParam({ name: 'id', example: 1, description: 'Analysis ID' })
	@ApiResponse({
		status: 200,
		description: 'Selected variant deleted successfully',
	})
	@ApiResponse({ status: 404, description: 'Variant not found' })
	deleteSelectedVariant(
		@Param('id', ParseIntPipe) id: number,
		@Body() variant: VariantToReportDto,
	) {
		return this.variantsService.deleteSelectedVariant(id, variant);
	}

	@Post('add-to-report/:id')
	@ApiOperation({ summary: 'Add variants to an analysis report' })
	@ApiParam({ name: 'id', example: 1, description: 'Analysis ID' })
	@ApiResponse({
		status: 201,
		description: 'Variants added to report successfully',
	})
	@ApiResponse({ status: 400, description: 'Bad request' })
	selectVariantToReport(
		@Param('id', ParseIntPipe) id: number,
		@Body() body: AddVariantsToReport,
	) {
		return this.variantsService.selectVariantToReport(id, body);
	}

	@Get('clinical-summary/:id')
	@ApiOperation({ summary: 'Get clinical summary for an analysis' })
	@ApiParam({ name: 'id', example: 1, description: 'Analysis ID' })
	@ApiResponse({
		status: 200,
		description: 'Clinical summary retrieved successfully',
	})
	getClinicalSummary(@Param('id', ParseIntPipe) id: number) {
		return this.variantsService.getClinicalSummary(id);
	}
}
