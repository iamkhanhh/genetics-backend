import {
	BadRequestException,
	forwardRef,
	Inject,
	Injectable,
} from '@nestjs/common';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { UpdateAnalysisDto } from './dto/update-analysis.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Analysis } from '@/entities';
import { In, Like, Repository } from 'typeorm';
import * as dayjs from 'dayjs';
import { PipelinesService } from '../pipelines/pipelines.service';
import { PaginationProvider } from '@/common/providers/pagination.provider';
import { CacheProvider } from '@/common/providers/cache.provider';
import { AnalysisStatus } from '@/enums';
import { UploadsService } from '../uploads/uploads.service';
import { ConfigService } from '@nestjs/config';
import { S3Provider } from '@/common/providers/s3.provider';
import { FilterAnalysisDto } from './dto/filter-analysis.dto';
import { SamplesService } from '../samples/samples.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { VariantToReportDto } from '../variants/dto/variant-to-report.dto';
import { Genes } from '@/entities/genes.entity';
import { GetGeneDetailDto } from './dto/get-gene-detail.dto';
import { AnalysisGateway } from '@/common/gateways/analysis.gateway';
import { createHash } from 'crypto';

@Injectable()
export class AnalysisService {
	constructor(
		@InjectRepository(Analysis)
		private analysisRepository: Repository<Analysis>,
		@InjectRepository(Genes) private genesRepository: Repository<Genes>,
		private readonly pipelinesService: PipelinesService,
		private readonly paginationProvider: PaginationProvider,
		private readonly uploadsService: UploadsService,
		private readonly samplesService: SamplesService,
		@Inject(forwardRef(() => WorkspacesService))
		private readonly workspacesService: WorkspacesService,
		private readonly configService: ConfigService,
		private readonly s3Provider: S3Provider,
		private readonly analysisGateway: AnalysisGateway,
		private readonly cacheProvider: CacheProvider,
	) {}

	async create(createAnalysisDto: CreateAnalysisDto, user_id: number) {
		const workspace = await this.workspacesService.index(
			createAnalysisDto.project_id,
		);
		const uploads = await this.uploadsService.findUploadsBySampleId(
			createAnalysisDto.sample_id,
		);
		const newAnalysis = new Analysis();

		newAnalysis.name = createAnalysisDto.name;
		newAnalysis.project_id = createAnalysisDto.project_id;
		newAnalysis.pipeline_id = createAnalysisDto.pipeline_id;
		newAnalysis.sample_id = createAnalysisDto.sample_id;
		newAnalysis.p_type = createAnalysisDto.p_type;
		newAnalysis.size = createAnalysisDto.size;
		newAnalysis.description = createAnalysisDto.description;
		newAnalysis.assembly = createAnalysisDto.assembly;
		newAnalysis.user_id = user_id;
		newAnalysis.is_deleted = 0;
		newAnalysis.sequencing_type = createAnalysisDto.sequencing_type;

		if (createAnalysisDto.p_type == 'vcf') {
			newAnalysis.status = AnalysisStatus.QUEUING;
		} else {
			newAnalysis.status = AnalysisStatus.FASTQ_QUEUING;
		}

		const result = await this.analysisRepository.save(newAnalysis);
		const igv_local_path = `${this.configService.get<string>('ANALYSIS_FOLDER')}/${user_id}/${result.id}`;
		await this.analysisRepository.update(
			{ id: result.id },
			{ igv_local_path, upload_id: uploads[0].id },
		);

		for (const e of uploads) {
			const destination = `${this.configService.get<string>('ANALYSIS_FOLDER')}/${result.user_id}/${result.id}/${e.upload_name}`;
			const source = encodeURIComponent(
				`${this.configService.get<string>('AWS_BUCKET')}/${e.file_path}`,
			);

			await this.s3Provider.copyObject(source, destination);
		}

		await this.workspacesService.update(workspace.data.id, {
			number: workspace.data.number++,
		});

		await Promise.all([
			this.cacheProvider.delByPattern(`analysis:list:user:${user_id}:*`),
			this.cacheProvider.delByPattern(
				`analysis:byws:${createAnalysisDto.project_id}:user:${user_id}:*`,
			),
		]);

		return {
			status: 'success',
			message: 'Create analysis successfully',
		};
	}

	async findAll(
		user_id: number,
		page: number,
		pageSize: number,
		filterAnalysisDto: FilterAnalysisDto,
	) {
		const filterHash = createHash('md5')
			.update(JSON.stringify(filterAnalysisDto))
			.digest('hex')
			.slice(0, 8);
		const cacheKey = `analysis:list:user:${user_id}:p${page}:ps${pageSize}:${filterHash}`;

		const cached = await this.cacheProvider.getOrSet(
			cacheKey,
			2 * 60,
			async () => {
				const filters: any = {
					user_id: user_id,
					is_deleted: 0,
				};

				if (filterAnalysisDto.status != '') {
					const statusMap = {
						queuing: [AnalysisStatus.QUEUING, AnalysisStatus.FASTQ_QUEUING],
						analyzing: [
							AnalysisStatus.ANALYZING,
							AnalysisStatus.FASTQ_ANALYZING,
							AnalysisStatus.VEP_ANALYZED,
							AnalysisStatus.IMPORTING,
						],
						analyzed: [AnalysisStatus.ANALYZED],
						error: [AnalysisStatus.ERROR, AnalysisStatus.FASTQ_ERROR],
					};

					const statuses = statusMap[filterAnalysisDto.status.toLowerCase()];
					if (statuses) {
						filters.status = In(statuses);
					}
				}
				if (filterAnalysisDto.assembly != '') {
					filters.assembly = filterAnalysisDto.assembly;
				}
				if (filterAnalysisDto.analysisName != '') {
					filters.name = Like(`%${filterAnalysisDto.analysisName}%`);
				}

				const results = await this.paginationProvider.paginate(
					page,
					pageSize,
					this.analysisRepository,
					filters,
				);

				const data = await Promise.all(
					results.data.map(async (analysis) => {
						const createdAt = dayjs(analysis.createdAt).format('DD/MM/YYYY');
						const analyzed = analysis.analyzed
							? dayjs(analysis.analyzed).format('DD/MM/YYYY')
							: '';
						const workspaceName = await this.workspacesService.getWorkspaceName(
							analysis.project_id,
						);
						return {
							id: analysis.id,
							name: analysis.name,
							workspaceName: workspaceName ? workspaceName.data : '',
							createdAt: createdAt,
							analyzed: analyzed,
							variants: analysis.variants,
							assembly: analysis.assembly,
							status: Analysis.getAnalysisStatus(analysis.status),
						};
					}),
				);

				return { ...results, data };
			},
		);
		return { ...cached, message: 'List all analyses successfully!' };
	}

	async findOne(id: number) {
		const data = await this.cacheProvider.getOrSet(
			`analysis:${id}`,
			2 * 60,
			async () => {
				const analysis = await this.analysisRepository.findOne({
					where: { id },
				});
				if (!analysis) {
					throw new BadRequestException('That analysis could not be found');
				}
				const sample = await this.samplesService.findOne(analysis.sample_id);
				return { ...analysis, sampleName: sample.data.name };
			},
		);
		return {
			status: 'success',
			message: 'got analysis successfully!',
			data,
		};
	}

	async getTotal(user_id: number) {
		//
		const cacheKey = `analysis:total:user:${user_id}`;
		const ttl = 5 * 60;
		const cached = await this.cacheProvider.getOrSet(
			cacheKey,
			ttl,
			async () => {
				const analyses = await this.analysisRepository.find({
					where: { user_id: user_id, is_deleted: 0 },
				});
				return analyses.length;
			},
		);
		return cached;
	}

	async getAnalysesStatistics(user_id: number, lastSixMonthsNumbers: number[]) {
		const cacheKey = `analysis:stats:user:${user_id}:months:${lastSixMonthsNumbers.join(',')}`;
		const ttl = 5 * 60;
		const cached = await this.cacheProvider.getOrSet(
			cacheKey,
			ttl,
			async () => {
				const data = [];

				const now = new Date();
				const currentYear = now.getFullYear();
				const currentMonth = now.getMonth() + 1;
				for (const month of lastSixMonthsNumbers) {
					const year = month > currentMonth ? currentYear - 1 : currentYear;

					const results = await this.analysisRepository
						.createQueryBuilder('analysis')
						.where('MONTH(analysis.createdAt) = :month', { month })
						.andWhere('YEAR(analysis.createdAt) = :year', { year })
						.andWhere('analysis.user_id = :user_id', { user_id })
						.getMany();

					data.push(results.length);
				}
				return data;
			},
		);
		return cached;
	}

	async getRecentAnalyses(user_id: number) {
		const cacheKey = `analysis:recent:user:${user_id}`;
		const ttl = 5 * 60;
		const cached = await this.cacheProvider.getOrSet(
			cacheKey,
			ttl,
			async () => {
				const analyses = await this.analysisRepository.find({
					where: { user_id: user_id, is_deleted: 0 },
					order: { createdAt: 'DESC' },
					take: 10,
				});
				const data = await Promise.all(
					analyses.map(async (analysis) => {
						const createdAt = dayjs(analysis.createdAt).format('DD/MM/YYYY');
						const analyzed = analysis.analyzed
							? dayjs(analysis.analyzed).format('DD/MM/YYYY')
							: '';
						const workspaceName = await this.workspacesService.getWorkspaceName(
							analysis.project_id,
						);
						return {
							id: analysis.id,
							name: analysis.name,
							workspaceName: workspaceName ? workspaceName.data : '',
							createdAt: createdAt,
							analyzed: analyzed,
							variants: analysis.variants,
							assembly: analysis.assembly,
							status: Analysis.getAnalysisStatus(analysis.status),
						};
					}),
				);
				return data;
			},
		);
		return cached;
	}

	async getGeneDetail(getGeneDetailDto: GetGeneDetailDto) {
		try {
			const cacheKey = `gene:detail:${getGeneDetailDto.geneName}`;
			const ttlSeconds = 604800;

			const geneInfo = await this.cacheProvider.getOrSet(
				cacheKey,
				ttlSeconds,
				async () => {
					const gene = await this.genesRepository.findOne({
						where: { name: getGeneDetailDto.geneName },
					});

					if (!gene) {
						throw new BadRequestException(
							`Gene ${getGeneDetailDto.geneName} not found`,
						);
					}

					return {
						synonyms: gene.name,
						full_name: gene.full_name || '',
						function: gene.summary || '',
					};
				},
			);

			return {
				status: 'success',
				message: 'Get gene detail successfully',
				data: geneInfo,
			};
		} catch (error) {
			return { status: 'error' };
		}
	}

	async getAnalysesByWorkspaceId(
		workspace_id: number,
		user_id: number,
		page: number,
		pageSize: number,
		filterAnalysisDto: FilterAnalysisDto,
	) {
		const filterHash = createHash('md5')
			.update(JSON.stringify(filterAnalysisDto))
			.digest('hex')
			.slice(0, 8);
		const cacheKey = `analysis:byws:${workspace_id}:user:${user_id}:p${page}:ps${pageSize}:${filterHash}`;

		const cached = await this.cacheProvider.getOrSet(
			cacheKey,
			2 * 60,
			async () => {
				const filters: any = {
					project_id: workspace_id,
					user_id: user_id,
					is_deleted: 0,
				};

				if (filterAnalysisDto.status != '') {
					const statusMap = {
						queuing: [AnalysisStatus.QUEUING, AnalysisStatus.FASTQ_QUEUING],
						analyzing: [
							AnalysisStatus.ANALYZING,
							AnalysisStatus.FASTQ_ANALYZING,
							AnalysisStatus.VEP_ANALYZED,
							AnalysisStatus.IMPORTING,
						],
						analyzed: [AnalysisStatus.ANALYZED],
						error: [AnalysisStatus.ERROR, AnalysisStatus.FASTQ_ERROR],
					};

					const statuses = statusMap[filterAnalysisDto.status.toLowerCase()];
					if (statuses) {
						filters.status = In(statuses);
					}
				}
				if (filterAnalysisDto.assembly != '') {
					filters.assembly = filterAnalysisDto.assembly;
				}
				if (filterAnalysisDto.analysisName != '') {
					filters.name = Like(`%${filterAnalysisDto.analysisName}%`);
				}
				if (filterAnalysisDto.sampleName != '') {
					const temp = await this.samplesService.getSamplesBySampleName(
						filterAnalysisDto.sampleName,
					);
					filters.sample_id = In(temp);
				}

				const results = await this.paginationProvider.paginate(
					page,
					pageSize,
					this.analysisRepository,
					filters,
				);

				const data = await Promise.all(
					results.data.map(async (analysis) => {
						const pipeline_name =
							await this.pipelinesService.getPipelineNameFromId(
								analysis.pipeline_id,
							);
						const createdAt = dayjs(analysis.createdAt).format('DD/MM/YYYY');
						const updatedAt = dayjs(analysis.updatedAt).format('DD/MM/YYYY');
						const analyzed = analysis.analyzed
							? dayjs(analysis.analyzed).format('DD/MM/YYYY')
							: '';
						return {
							id: analysis.id,
							name: analysis.name,
							pipeline_name: pipeline_name,
							createdAt: createdAt,
							updatedAt: updatedAt,
							analyzed: analyzed,
							variants: analysis.variants,
							assembly: analysis.assembly,
							sequencing_type: analysis.sequencing_type,
							status: Analysis.getAnalysisStatus(analysis.status),
						};
					}),
				);

				return { ...results, data };
			},
		);
		return { ...cached, message: 'List all analyses successfully!' };
	}

	async deleteAnalysesByWorkspaceId(workspace_id: number) {
		return await this.analysisRepository.update(
			{ project_id: workspace_id },
			{ is_deleted: 1 },
		);
	}

	async update(id: number, updateAnalysisDto: UpdateAnalysisDto) {
		const analysis = await this.analysisRepository.findOne({ where: { id } });
		if (!analysis) {
			throw new BadRequestException('That analysis could not be found');
		}
		await this.analysisRepository.update({ id }, { ...updateAnalysisDto });
		await Promise.all([
			this.cacheProvider.del(`analysis:${id}`),
			this.cacheProvider.delByPattern(
				`analysis:list:user:${analysis.user_id}:*`,
			),
			this.cacheProvider.delByPattern(
				`analysis:byws:${analysis.project_id}:user:${analysis.user_id}:*`,
			),
		]);
		return {
			status: 'success',
			message: 'Updated successfully!',
		};
	}

	async getQCVCF(id: number) {
		const analysis = await this.analysisRepository.findOne({ where: { id } });
		if (!analysis) {
			throw new BadRequestException('That analysis could not be found');
		}

		// const file_path = 'https://genetics-s3-prod.s3.ap-southeast-1.amazonaws.com/public/ExAC.r0.3.sites.vep.hg19.vcf.gz';
		// const tbi_path = 'https://genetics-s3-prod.s3.ap-southeast-1.amazonaws.com/public/ExAC.r0.3.sites.vep.hg19.vcf.gz.tbi';
		const file_path = await this.s3Provider.generateDownloadUrl(
			`${this.configService.get<string>('ANALYSIS_FOLDER')}/${analysis.user_id}/${analysis.id}/analysis.vcf.gz`,
		);
		const tbi_path = await this.s3Provider.generateDownloadUrl(
			`${this.configService.get<string>('ANALYSIS_FOLDER')}/${analysis.user_id}/${analysis.id}/analysis.vcf.gz.tbi`,
		);
		const genome_build = analysis.assembly == 'hg19' ? 'GRCh37' : 'GRCh38';

		return {
			status: 'success',
			message: 'Get QC URL successfully',
			data: `${this.configService.get<string>('VCF_IOBIO_HOST')}/?species=Human&build=${genome_build}&vcf=${encodeURIComponent(file_path)}&tbi=${encodeURIComponent(tbi_path)}`,
		};
	}

	async getIGVInfo(id: number) {
		const analysis = await this.analysisRepository.findOne({ where: { id } });
		if (!analysis) {
			throw new BadRequestException('That analysis could not be found');
		}
		// const folderName = analysis.igv_local_path;

		return {
			status: 'success',
			message: 'Get QC URL successfully',
			data: {
				analysis: analysis,
				// bamUrl: await this.s3Provider.generateDownloadUrl(`${folderName}/analysis.bam`),
				// bamIndexUrl: await this.s3Provider.generateDownloadUrl(`${folderName}/analysis.bam.bai`),
				bamUrl: `https://genetics-s3-prod.s3.ap-southeast-1.amazonaws.com/public/1325004575.bam`,
				bamIndexUrl: `https://genetics-s3-prod.s3.ap-southeast-1.amazonaws.com/public/1325004575.bam.bai`,
				fastaUrl:
					analysis.assembly == 'hg19'
						? await this.s3Provider.generateDownloadUrl(
								`${this.configService.get<string>('FASTA_FOLDER')}/hg19.fa`,
							)
						: await this.s3Provider.generateDownloadUrl(
								`${this.configService.get<string>('FASTA_FOLDER')}/GRCh38.fa`,
							),
				fastaIndexUrl:
					analysis.assembly == 'hg19'
						? await this.s3Provider.generateDownloadUrl(
								`${this.configService.get<string>('FASTA_FOLDER')}/hg19.fa.fai`,
							)
						: await this.s3Provider.generateDownloadUrl(
								`${this.configService.get<string>('FASTA_FOLDER')}/GRCh38.fa.fai`,
							),
				geneUrl:
					analysis.assembly == 'hg19'
						? 'https://genetics-s3-prod.s3.ap-southeast-1.amazonaws.com/public/ncbiRefSeq_hg19.txt.gz'
						: 'https://genetics-s3-prod.s3.ap-southeast-1.amazonaws.com/public/ncbiRefSeq_hg38.txt.gz',
			},
		};
	}

	getIgvLink(uri, client_ip) {
		if (!uri || !client_ip) {
			return undefined;
		}

		const url = this.configService.get<string>('IGV_HOST');
		if (url == '') {
			return undefined;
		}

		uri = '/' + uri;

		const secret = 'itisawsomekey1599';

		const today = new Date();
		const minute_exist = today.getMinutes() + 30;
		const expires = Math.round(
			new Date(
				today.getFullYear(),
				today.getMonth(),
				today.getDate(),
				today.getHours(),
				minute_exist,
				today.getSeconds(),
			).getTime() / 1000,
		);
		const input = uri + client_ip + expires + ' ' + secret;
		const base64Value = createHash('md5').update(input).digest('base64');
		const result =
			url +
			uri +
			'?' +
			'signatures=' +
			base64Value.replace(/\+/g, '-').replace(/\//g, '_').replace(/\=/g, '') +
			'&expires=' +
			expires;

		return result;
	}

	async updateVariantsSelected(id: number, arr: VariantToReportDto[]) {
		const analysis = await this.analysisRepository.findOne({ where: { id } });
		if (!analysis) {
			throw new BadRequestException('That analysis could not be found');
		}
		await this.analysisRepository.update(
			{ id },
			{ variants_to_report: JSON.stringify(arr) },
		);
		await this.cacheProvider.del(`variants:selected:${id}`);

		return {
			status: 'success',
			message: 'Updated variants selected successfully!',
		};
	}

	async remove(id: number) {
		const analysis = await this.analysisRepository.findOne({ where: { id } });
		if (!analysis) {
			throw new BadRequestException('That analysis could not be found');
		}
		await this.analysisRepository.update({ id }, { is_deleted: 1 });
		await Promise.all([
			this.cacheProvider.del(`analysis:${id}`),
			this.cacheProvider.delByPattern(
				`analysis:list:user:${analysis.user_id}:*`,
			),
			this.cacheProvider.delByPattern(
				`analysis:byws:${analysis.project_id}:user:${analysis.user_id}:*`,
			),
		]);
		return {
			status: 'success',
			message: 'Deleted successfully!',
		};
	}

	async getPendingAnalysis() {
		let data: any = null;
		const analyses = await this.analysisRepository.find({
			where: {
				status: AnalysisStatus.QUEUING,
				is_deleted: 0,
				// assembly: assembly,
			},
			order: {
				createdAt: 'ASC',
			},
		});
		if (analyses.length === 0) {
			return data;
		}

		data = analyses[0];
		const uploads = await this.uploadsService.findUploadsBySampleId(
			data.sample_id,
		);
		data.upload = uploads[0];

		const destination = `${this.configService.get<string>('ANALYSIS_FOLDER')}/${data.user_id}/${data.id}/analysis.anno`;
		await this.analysisRepository.update(
			{ id: analyses[0].id },
			{ file_path: destination },
		);

		return data;
	}

	async getPendingFastqAnalysis() {
		let data: any = null;
		const analyses = await this.analysisRepository.find({
			where: {
				status: AnalysisStatus.FASTQ_QUEUING,
				is_deleted: 0,
			},
			order: {
				createdAt: 'ASC',
			},
		});
		if (analyses.length === 0) {
			return data;
		}

		data = analyses[0];
		const uploads = await this.uploadsService.findUploadsBySampleId(
			data.sample_id,
		);
		for (const e of uploads) {
			if (e.fastq_pair_index == 1) {
				data.fastq1 = e;
			} else if (e.fastq_pair_index == 2) {
				data.fastq2 = e;
			}
		}

		const destination = `${this.configService.get<string>('ANALYSIS_FOLDER')}/${data.user_id}/${data.id}/analysis.fastq.vcf.gz`;
		await this.analysisRepository.update(
			{ id: analyses[0].id },
			{ file_path: destination },
		);

		return data;
	}

	async updateAnalysisStatus(analysisId: number, status: AnalysisStatus) {
		const analysis = await this.analysisRepository.findOne({
			where: { id: analysisId },
		});
		if (!analysis) {
			throw new BadRequestException('That analysis could not be found');
		}
		if (status === AnalysisStatus.ANALYZED) {
			analysis.analyzed = new Date();
		}
		analysis.status = status;
		await this.analysisRepository.save(analysis);
		await this.cacheProvider.del(`analysis:${analysisId}`);
		this.analysisGateway.sendAnalysisStatusUpdate({
			id: analysis.id,
			status: Analysis.getAnalysisStatus(analysis.status),
		});

		return {
			status: 'success',
			message: 'Analysis status updated successfully',
		};
	}

	async getAnalysisStaticsByStatus(user_id: number) {
		const queuing = await this.analysisRepository.count({
			where: {
				user_id: user_id,
				is_deleted: 0,
				status: In([AnalysisStatus.QUEUING, AnalysisStatus.FASTQ_QUEUING]),
			},
		});
		const analyzing = await this.analysisRepository.count({
			where: {
				user_id: user_id,
				is_deleted: 0,
				status: In([
					AnalysisStatus.ANALYZING,
					AnalysisStatus.FASTQ_ANALYZING,
					AnalysisStatus.VEP_ANALYZED,
					AnalysisStatus.IMPORTING,
				]),
			},
		});
		const analyzed = await this.analysisRepository.count({
			where: {
				user_id: user_id,
				is_deleted: 0,
				status: AnalysisStatus.ANALYZED,
			},
		});
		const error = await this.analysisRepository.count({
			where: {
				user_id: user_id,
				is_deleted: 0,
				status: In([AnalysisStatus.ERROR, AnalysisStatus.FASTQ_ERROR]),
			},
		});

		return {
			queuing,
			analyzing,
			analyzed,
			error,
		};
	}
}
