import { Analysis } from '@/entities';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MongodbProvider } from './mongodb.provider';
import { AnalysisStatus } from '@/enums';
import { CommonProvider } from './common.provider';
import { ConfigService } from '@nestjs/config';
import * as dayjs from 'dayjs';
import { AnalysisGateway } from '../gateways/analysis.gateway';
import { ReportService } from '@/modules/report/report.service';

@Injectable()
export class SampleImportProvider {
	private readonly logger = new Logger(SampleImportProvider.name);

	constructor(
		@InjectRepository(Analysis)
		private analysisRepository: Repository<Analysis>,
		private readonly mongodbProvider: MongodbProvider,
		private readonly commonProvider: CommonProvider,
		private readonly configService: ConfigService,
		private readonly analysisGateway: AnalysisGateway,
		@Inject(forwardRef(() => ReportService))
		private readonly reportService: ReportService,
	) {}

	@Cron(CronExpression.EVERY_30_SECONDS)
	async checkAnalyzed() {
		const analysisImporting = await this.getAnalysisByStatus(
			AnalysisStatus.IMPORTING,
		);
		if (analysisImporting) {
			return;
		}

		const analysis = await this.getAnalysisByStatus(
			AnalysisStatus.VEP_ANALYZED,
		);
		if (!analysis) {
			return;
		}

		this.logger.log(`Importing analysis with ID: ${analysis.id}`);
		await this.analysisRepository.update(
			{ id: analysis.id },
			{ status: AnalysisStatus.IMPORTING },
		);
		this.analysisGateway.sendAnalysisStatusUpdate({
			id: analysis.id,
			status: Analysis.getAnalysisStatus(AnalysisStatus.IMPORTING),
		});

		const importCheck = await this.import(analysis);

		if (importCheck) {
			this.logger.log(`Import successful for analysis ID: ${analysis.id}`);
			return await this.onImportSuccess(analysis);
		} else {
			this.logger.error(`Import failed for analysis ID: ${analysis.id}`);
			return await this.onImportError(analysis);
		}
	}

	async import(analysis: Analysis): Promise<boolean> {
		try {
			const collectionName = this.commonProvider.getMongoCollectionName(
				analysis.id,
			);

			const options = [
				`--host ${this.configService.get<string>('MONGO_DB_HOST')} --port ${this.configService.get<string>('MONGO_DB_PORT')}`,
				`--collection ${collectionName}`,
				`--db ${this.configService.get<string>('MONGO_DB_DATABASE')}`,
				`--type tsv`,
				`--headerline`,
				`--file ${this.configService.get<string>('MOUNT_FOLDER')}/${analysis.file_path}`,
				`--drop`,
			];
			// mongoimport --host localhost --port 27017 --collection genetics_analysis_4 --db genetics --type tsv --headerline --file analysis_hg38.anno --drop

			const command = `${this.configService.get<string>('MONGO_IMPORT_CMD')} ${options.join(' ')}`;

			await this.commonProvider.runCommand(command);

			return true;
		} catch (error) {
			this.logger.error(error);
			console.log('SampleImportProvider@import', error);
			return false;
		}
	}

	async onImportSuccess(analysis: Analysis) {
		try {
			const db = await this.mongodbProvider.mongodbConnect();
			const collectionName = this.commonProvider.getMongoCollectionName(
				analysis.id,
			);
			const collection = db.collection(collectionName);
			if (!collection) {
				this.logger.error(
					`Collection ${collectionName} not found for analysis ID: ${analysis.id}`,
				);
				return this.onImportError(analysis);
			}

			await collection.createIndexes([
				{ key: { gene: 1 } },
				{ key: { CLINSIG_FINAL: 1 } },
				{ key: { IMPACT: 1 } },
				{ key: { codingEffect: 1 } },
				{ key: { chrom: 1, inputPos: 1 } },
				{ key: { CLINSIG_PRIORITY: 1 } },
				{ key: { chrom_pos_ref_alt_gene: 1 } },
				{ key: { PGx: 1 } },
				{ key: { rsId: 1 } },
			]);
			this.logger.log(`Indexes created for collection: ${collectionName}`);

			const pipeCount = [];
			pipeCount.push({ $group: { _id: null, count: { $sum: 1 } } });

			const [count] = await Promise.all([
				collection.aggregate(pipeCount, { allowDiskUse: true }).toArray(),
			]);

			// await this.mongodbProvider.mongodbDisconnect();

			const variants = count[0]?.count || 0;
			this.logger.log(
				`Found ${variants} variants for analysis ID: ${analysis.id}`,
			);

			const analyzed_time = new Date();
			await this.analysisRepository.update(
				{ id: analysis.id },
				{
					status: AnalysisStatus.ANALYZED,
					analyzed: analyzed_time,
					variants: variants,
				},
			);
			await this.reportService.createPgxReport(analysis.id, analysis.user_id);
			return this.analysisGateway.sendAnalysisStatusUpdate({
				id: analysis.id,
				status: Analysis.getAnalysisStatus(AnalysisStatus.ANALYZED),
				analyzed: analyzed_time
					? dayjs(analyzed_time).format('DD/MM/YYYY')
					: '',
				variants: variants,
			});
		} catch (error) {
			this.logger.error(error);
			return console.log('SampleImportProvider@import', error);
		}
	}

	async onImportError(analysis: Analysis) {
		return await this.analysisRepository.update(
			{ id: analysis.id },
			{ status: AnalysisStatus.ERROR },
		);
	}

	private async getAnalysisByStatus(status: AnalysisStatus) {
		return await this.analysisRepository.findOne({
			where: {
				status: status,
				is_deleted: 0,
			},
		});
	}
}
