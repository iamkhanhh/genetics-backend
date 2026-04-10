import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Samples, Workspaces, Analysis } from '@/entities';
import { GlobalSearchDto } from './dto/global-search.dto';
import { PipelinesService } from '../pipelines/pipelines.service';
import * as dayjs from 'dayjs';
import { HttpProvider } from '@/common/providers/http.provider';
import { CacheProvider } from '@/common/providers/cache.provider';

@Injectable()
export class SearchService {
	private readonly logger = new Logger(SearchService.name);
	constructor(
		@InjectRepository(Samples) private samplesRepository: Repository<Samples>,
		@InjectRepository(Workspaces)
		private workspacesRepository: Repository<Workspaces>,
		@InjectRepository(Analysis)
		private analysisRepository: Repository<Analysis>,
		private readonly pipelinesService: PipelinesService,
		private readonly httpProvider: HttpProvider,
		private readonly cacheProvider: CacheProvider,
	) {}

	async globalSearch(
		user_id: number,
		globalSearchDto: GlobalSearchDto,
	): Promise<any> {
		const searchTerm = globalSearchDto.searchTerm || '';
		const [samples, workspaces, analysis] = await Promise.all([
			this.searchSamples(user_id, searchTerm),
			this.searchWorkspaces(user_id, searchTerm),
			this.searchAnalysis(user_id, searchTerm),
		]);

		return {
			status: 'success',
			message: 'Global search completed',
			data: {
				samples: {
					count: samples.length,
					items: samples,
				},
				workspaces: {
					count: workspaces.length,
					items: workspaces,
				},
				analysis: {
					count: analysis.length,
					items: analysis,
				},
			},
			total: samples.length + workspaces.length + analysis.length,
			searchTerm,
		};
	}

	private async searchSamples(
		user_id: number,
		searchTerm: string,
	): Promise<any[]> {
		try {
			const samples = await this.samplesRepository.find({
				where: {
					user_id,
					name: Like(`%${searchTerm}%`),
				},
			});

			return samples.map((sample) => ({
				id: sample.id,
				name: sample.name,
				type: 'sample',
				fileType: sample.file_type,
				assembly: sample.assembly,
				size: sample.file_size,
				status: Samples.getSampleStatus(sample.complete_status),
				createdAt: dayjs(sample.createdAt).format('DD/MM/YYYY'),
			}));
		} catch (error) {
			console.error('Error searching samples:', error);
			return [];
		}
	}

	private async searchWorkspaces(
		user_id: number,
		searchTerm: string,
	): Promise<any[]> {
		try {
			const workspaces = await this.workspacesRepository.find({
				where: {
					user_created_id: user_id,
					is_deleted: 0,
					name: Like(`%${searchTerm}%`),
				},
			});

			const result = await Promise.all(
				workspaces.map(async (workspace) => {
					const pipelineName =
						await this.pipelinesService.getPipelineNameFromId(
							workspace.pipeline,
						);

					return {
						id: workspace.id,
						name: workspace.name,
						type: 'workspace',
						number: workspace.number,
						pipelineId: workspace.pipeline,
						pipelineName: pipelineName || 'Unknown',
						createdAt: dayjs(workspace.createdAt).format('DD/MM/YYYY'),
						updatedAt: dayjs(workspace.updatedAt).format('DD/MM/YYYY'),
					};
				}),
			);

			return result;
		} catch (error) {
			console.error('Error searching workspaces:', error);
			return [];
		}
	}

	private async searchAnalysis(
		user_id: number,
		searchTerm: string,
	): Promise<any[]> {
		try {
			const analysisList = await this.analysisRepository.find({
				where: {
					user_id,
					is_deleted: 0,
					name: Like(`%${searchTerm}%`),
				},
			});

			return analysisList.map((analysis) => ({
				id: analysis.id,
				name: analysis.name,
				type: 'analysis',
				assembly: analysis.assembly,
				status: Analysis.getAnalysisStatus(analysis.status),
				variants: analysis.variants,
				sequencingType: analysis.sequencing_type,
				sampleId: analysis.sample_id,
				projectId: analysis.project_id,
				pipelineId: analysis.pipeline_id,
				createdAt: dayjs(analysis.createdAt).format('DD/MM/YYYY'),
				analyzed: analysis.analyzed
					? dayjs(analysis.analyzed).format('DD/MM/YYYY')
					: null,
			}));
		} catch (error) {
			console.error('Error searching analysis:', error);
			return [];
		}
	}

	async searchReferences(pmid: string) {
		const cached = await this.cacheProvider.get<any[]>(
			`search:ref:pmid:${pmid}`,
		);
		if (cached) {
			return {
				status: 'success',
				message: 'References found successfully',
				data: cached,
			};
		}

		const response = await this.httpProvider.searchReferences(pmid);
		const pubmedList = [];

		if (response.result.uids.length == 0) {
			return {
				status: 'error',
				message: 'No references found for the given PMID',
				data: pubmedList,
			};
		}

		const ids = response.result.uids;
		for (const i in ids) {
			const authors = [];
			for (const m in response.result[ids[i]].authors) {
				authors.push(response.result[ids[i]].authors[m].name);
			}
			pubmedList.push({
				id: response.result[ids[i]].uid,
				date: response.result[ids[i]].pubdate,
				source: response.result[ids[i]].source,
				title: response.result[ids[i]].title,
				authors: authors,
			});
		}

		await this.cacheProvider.set(
			`search:ref:pmid:${pmid}`,
			pubmedList,
			24 * 60 * 60,
		);

		return {
			status: 'success',
			message: 'References found successfully',
			data: pubmedList,
		};
	}
}
