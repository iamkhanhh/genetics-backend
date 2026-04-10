import {
	BadRequestException,
	forwardRef,
	Inject,
	Injectable,
} from '@nestjs/common';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { Workspaces } from '@/entities';
import { Like, Raw, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PipelinesService } from '../pipelines/pipelines.service';
import * as dayjs from 'dayjs';
import { createHash } from 'crypto';
import { PaginationProvider } from '@/common/providers/pagination.provider';
import { CacheProvider } from '@/common/providers/cache.provider';
import { FilterWorkspacesDto } from './dto/filter-workspaces.dto';
import { DeleteMultipleWorkspacesDto } from './dto/delete-multiple-workspaces.dto';
import { AnalysisService } from '../analysis/analysis.service';

@Injectable()
export class WorkspacesService {
	constructor(
		@InjectRepository(Workspaces)
		private workspacesRepository: Repository<Workspaces>,
		private readonly pipelinesService: PipelinesService,
		@Inject(forwardRef(() => AnalysisService))
		private readonly analysisService: AnalysisService,
		private readonly paginationProvider: PaginationProvider,
		private readonly cacheProvider: CacheProvider,
	) {}

	async create(createWorkspaceDto: CreateWorkspaceDto, id: number) {
		const existed_workspace = await this.workspacesRepository.findOne({
			where: { name: createWorkspaceDto.name },
		});
		if (existed_workspace) {
			throw new BadRequestException('Your workspace name is already existed!');
		}

		const newWorkspace = new Workspaces();
		newWorkspace.dashboard = createWorkspaceDto.dashboard;
		newWorkspace.name = createWorkspaceDto.name;
		newWorkspace.pipeline = createWorkspaceDto.pipeline;
		newWorkspace.is_deleted = 0;
		newWorkspace.user_created_id = id;
		newWorkspace.number = 0;
		const savedWorkspace = await this.workspacesRepository.save(newWorkspace);
		await this.cacheProvider.delByPattern(`workspace:list:user:${id}:*`);

		return {
			status: 'success',
			message: 'Created workspace successfully !',
			data: savedWorkspace,
		};
	}

	async findAll(
		id: number,
		page: number,
		pageSize: number,
		filterWorkspacesDto: FilterWorkspacesDto,
	) {
		const filterHash = createHash('md5')
			.update(JSON.stringify(filterWorkspacesDto))
			.digest('hex')
			.slice(0, 8);
		const cacheKey = `workspace:list:user:${id}:p${page}:ps${pageSize}:${filterHash}`;

		const cached = await this.cacheProvider.getOrSet(
			cacheKey,
			5 * 60,
			async () => {
				const filters: any = {
					user_created_id: id,
					is_deleted: 0,
				};

				if (filterWorkspacesDto.searchDate != '') {
					filters.createdAt = Raw((alias) => `${alias} > :date`, {
						date: filterWorkspacesDto.searchDate,
					});
				}

				if (filterWorkspacesDto.searchTerm != '') {
					filters.name = Like(`%${filterWorkspacesDto.searchTerm}%`);
				}

				const results = await this.paginationProvider.paginate<Workspaces>(
					page,
					pageSize,
					this.workspacesRepository,
					filters,
				);

				const data = await Promise.all(
					results.data.map(async (workspace) => {
						const pipeline_name =
							await this.pipelinesService.getPipelineNameFromId(
								workspace.pipeline,
							);
						const formatted_date = dayjs(workspace.createdAt).format(
							'DD/MM/YYYY',
						);
						const updatedAt = dayjs(workspace.updatedAt).format('DD/MM/YYYY');
						return {
							id: workspace.id,
							name: workspace.name,
							number: workspace.number,
							createdAt: formatted_date,
							pipeline_name: pipeline_name,
							updatedAt,
						};
					}),
				);

				return { ...results, data };
			},
		);
		return { ...cached, message: 'List all workspaces successfully!' };
	}

	async index(id: number) {
		const workspace = await this.cacheProvider.getOrSet(
			`workspace:${id}`,
			5 * 60,
			async () => {
				const ws = await this.workspacesRepository.findOne({ where: { id } });
				if (!ws) {
					throw new BadRequestException('That workspace could not be found');
				}
				return ws;
			},
		);
		return {
			status: 'success',
			message: 'got workspace successfully!',
			data: workspace,
		};
	}

	async getTotal(user_id: number) {
		const workspaces = await this.workspacesRepository.find({
			where: { user_created_id: user_id, is_deleted: 0 },
		});
		return workspaces.length;
	}

	async getWorkspacesStatistics(
		user_id: number,
		lastSixMonthsNumbers: number[],
	) {
		const data = [];

		const now = new Date();
		const currentYear = now.getFullYear();
		const currentMonth = now.getMonth() + 1;

		for (const month of lastSixMonthsNumbers) {
			const year = month > currentMonth ? currentYear - 1 : currentYear;

			const results = await this.workspacesRepository
				.createQueryBuilder('workspaces')
				.where('MONTH(workspaces.createdAt) = :month', { month })
				.andWhere('YEAR(workspaces.createdAt) = :year', { year })
				.andWhere('workspaces.user_created_id = :user_id', { user_id })
				.getMany();

			data.push(results.length);
		}

		return data;
	}

	async getWorkspaceName(id: number) {
		const cacheKey = `workspace:name:${id}`;
		const ttlSeconds = 5 * 60;
		const name = await this.cacheProvider.getOrSet(
			cacheKey,
			ttlSeconds,
			async () => {
				const workspace = await this.workspacesRepository.findOne({
					where: { id },
				});
				if (!workspace) {
					throw new BadRequestException('That workspace could not be found');
				}
				return workspace.name;
			},
		);
		return {
			status: 'success',
			message: 'getWorkspaceName successfully!',
			data: name,
		};
	}

	async update(id: number, updateWorkspaceDto: UpdateWorkspaceDto) {
		const workspace = await this.workspacesRepository.findOne({
			where: { id },
		});
		if (!workspace) {
			throw new BadRequestException('That workspace could not be found');
		}
		await this.workspacesRepository.update({ id }, { ...updateWorkspaceDto });
		await this.cacheProvider.del(`workspace:${id}`, `workspace:name:${id}`);
		await this.cacheProvider.delByPattern(
			`workspace:list:user:${workspace.user_created_id}:*`,
		);
		return {
			status: 'success',
			message: 'Updated successfully!',
		};
	}

	async remove(id: number) {
		const workspace = await this.workspacesRepository.findOne({
			where: { id },
		});
		if (!workspace) {
			throw new BadRequestException('That workspace could not be found');
		}
		await this.workspacesRepository.update({ id }, { is_deleted: 1 });
		await this.cacheProvider.del(`workspace:${id}`, `workspace:name:${id}`);
		await this.cacheProvider.delByPattern(
			`workspace:list:user:${workspace.user_created_id}:*`,
		);
		await this.analysisService.deleteAnalysesByWorkspaceId(id);
		return {
			status: 'success',
			message: 'Deleted successfully!',
		};
	}

	async deleteMultipleWorkspaces(
		deleteMultipleWorkspacesDto: DeleteMultipleWorkspacesDto,
	) {
		for (const workspace_id of deleteMultipleWorkspacesDto.ids) {
			await this.remove(workspace_id);
		}
		return {
			status: 'success',
			message: 'Delete multiple workspaces successfully!',
		};
	}
}
