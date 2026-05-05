import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Genes, PGx, Report } from '@/entities';
import { In, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { ConfigService } from '@nestjs/config';
import { S3Provider } from '@/common/providers/s3.provider';
import * as dayjs from 'dayjs';
import { AnalysisService } from '../analysis/analysis.service';
import { PatientsInformationService } from '../patient-information/patient-information.service';
import {
	IPgxData,
	IPgxReportData,
	IPgxTemplateData,
	IReportData,
	ReportTemplateData,
	ReportVariantData,
} from './interfaces';
import { HttpProvider } from '@/common/providers/http.provider';
import { ChatbotService } from '../chatbot/chatbot.service';
import { VariantReportedDto } from './dto/variant-reported';
import { ReferencesReportedDto } from './dto/references-reported.dto';
import { VariantsService } from '../variants/variants.service';
import { AnalysisStatus } from '@/enums';

@Injectable()
export class ReportService {
	constructor(
		@InjectRepository(Report)
		private readonly reportRepository: Repository<Report>,
		@InjectRepository(Genes)
		private readonly genesRepository: Repository<Genes>,
		@InjectRepository(PGx)
		private readonly pgxRepository: Repository<PGx>,
		private readonly configService: ConfigService,
		private readonly s3Provider: S3Provider,
		private readonly analysisService: AnalysisService,
		private readonly patientsInformationService: PatientsInformationService,
		private readonly httpProvider: HttpProvider,
		private readonly chatbotService: ChatbotService,
		private readonly variantsService: VariantsService,
	) {}

	async create(createReportDto: CreateReportDto, user_id: number) {
		const analysisResult = await this.analysisService.findOne(
			createReportDto.analysisId,
		);
		const analysis = analysisResult.data;
		if (analysis.status !== AnalysisStatus.ANALYZED) {
			throw new BadRequestException(
				"Can't create report for an analysis that is not analyzed yet",
			);
		}

		const detailsGeneAnhVariant = await this.generateSummary(
			createReportDto.variants,
			analysis.assembly,
		);
		const detailsReferences = this.generateReferences(
			createReportDto.references,
		);

		const patientResult = await this.patientsInformationService.findOne(
			createReportDto.analysisId,
		);
		const patient = patientResult.data;

		const formattedVariants: ReportVariantData[] = createReportDto.variants.map(
			(v) => ({
				gene: v.gene,
				change: v.cdna,
				zygosity: 'N/A',
				inheritance: 'N/A',
				classification: v.classification,
			}),
		);

		const templateData: ReportTemplateData = {
			report_name: createReportDto.report_name,
			patient_no: `GE-${patient.id}`,
			patient_name: `${patient.first_name} ${patient.last_name}`,
			dob: dayjs(patient.dob).format('DD/MM/YYYY'),
			gender: patient.gender,
			ethnicity: patient.ethnicity,
			physician_name: 'N/A',
			specimen: patient.sample_type,
			received_date: dayjs(analysis.createdAt).format('DD/MM/YYYY'),
			prepared_by: 'TLU GENETICS',
			report_date: dayjs(new Date()).format('DD/MM/YYYY'),
			test_requested: analysis.sequencing_type,
			clinical_information: patient.phenotype,
			summary: formattedVariants.map((v) => ({
				text: `${v.classification.toUpperCase()} VARIANT IDENTIFIED`,
			})),
			variants: formattedVariants,
			details: detailsGeneAnhVariant,
			references: detailsReferences,
		};

		const { fileName } = await this.generateReportFile(
			templateData,
			user_id,
			analysis.id,
		);

		const report = this.reportRepository.create({
			report_name: createReportDto.report_name,
			analysis_id: createReportDto.analysisId,
			user_created: user_id,
			file_path: fileName,
			is_deleted: 0,
		});

		const downloadUrl = await this.s3Provider.generateDownloadUrl(
			`${this.configService.get('ANALYSIS_FOLDER')}/${user_id}/${analysis.id}/reports/${fileName}`,
		);
		await this.reportRepository.save(report);

		return {
			status: 'success',
			message: 'Report created successfully',
			data: {
				...report,
				downloadUrl,
			},
		};
	}

	private async generateReportFile(
		data: ReportTemplateData,
		user_id: number,
		analysis_id: number,
	) {
		const templatePath = path.resolve(
			__dirname,
			'templates/genetics_report_template.docx',
		);

		if (!fs.existsSync(templatePath)) {
			throw new BadRequestException('Report template not found');
		}

		const content = fs.readFileSync(templatePath);

		const zip = new PizZip(content);

		const doc = new Docxtemplater(zip, {
			paragraphLoop: true,
			linebreaks: true,
		});

		try {
			doc.render(data);
		} catch (error) {
			throw new BadRequestException('Error rendering report template');
		}

		const buffer = doc.getZip().generate({
			type: 'nodebuffer',
		});

		const fileName = `report_${Date.now()}.docx`;

		const outputPath = `${this.configService.get('MOUNT_FOLDER')}/${this.configService.get('ANALYSIS_FOLDER')}/${user_id}/${analysis_id}/reports/${fileName}`;
		if (!fs.existsSync(path.dirname(outputPath))) {
			fs.mkdirSync(path.dirname(outputPath), {
				recursive: true,
			});
		}

		fs.writeFileSync(outputPath, new Uint8Array(buffer));

		return {
			fileName,
			filePath: outputPath,
		};
	}

	async findAll(user_id: number, analysis_id: number) {
		const data = await this.reportRepository.find({
			where: {
				user_created: user_id,
				analysis_id: analysis_id,
				is_deleted: 0,
			},
			order: { createdAt: 'ASC' },
		});
		return {
			status: 'success',
			message: 'Get report successfully',
			data: data,
		};
	}

	async findOne(user_id: number, report_id: number) {
		const report = await this.reportRepository.findOne({
			where: {
				id: report_id,
				user_created: user_id,
				is_deleted: 0,
			},
		});

		if (!report) {
			throw new BadRequestException('Report not found');
		}

		const download_url = await this.s3Provider.generateDownloadUrl(
			`${this.configService.get('ANALYSIS_FOLDER')}/${user_id}/${report.analysis_id}/reports/${report.file_path}`,
		);

		return {
			status: 'success',
			message: 'Get report successfully',
			data: {
				...report,
				download_url,
			},
		};
	}

	async delete(user_id: number, report_id: number) {
		const report = await this.reportRepository.findOne({
			where: {
				id: report_id,
				user_created: user_id,
				is_deleted: 0,
			},
		});

		if (!report) {
			throw new BadRequestException('That report could not be found');
		}

		await this.reportRepository.update({ id: report_id }, { is_deleted: 1 });

		return {
			status: 'success',
			message: 'Deleted successfully!',
		};
	}

	async generateSummary(variants: VariantReportedDto[], assembly: string) {
		const detailsGeneAnhVariant = [];
		const variantData = await Promise.all(
			variants.map(async (v) => {
				const [chrom, pos, ref, alt] = v.id.split('_');
				const response = await this.httpProvider.getGenebeData(
					chrom,
					parseInt(pos),
					ref,
					alt,
					v.transcript,
					assembly,
				);
				return {
					chrom,
					pos,
					ref,
					alt,
					gene: v.gene,
					transcript: v.transcript,
					response,
				};
			}),
		);

		for (const geneBeRes of variantData) {
			const variantSummary = await this.chatbotService.getVariantDescription(
				geneBeRes.transcript,
				geneBeRes.response,
			);
			const geneInfo = await this.genesRepository.findOne({
				where: {
					name: geneBeRes.gene,
				},
			});
			detailsGeneAnhVariant.push({
				text: `${geneBeRes.gene}: ${geneInfo ? geneInfo.summary : 'No description available'}.`,
			});
			detailsGeneAnhVariant.push({
				text: `${variantSummary}`,
			});
		}
		return detailsGeneAnhVariant;
	}

	generateReferences(refs: ReferencesReportedDto[]) {
		const detailsReferences = [];

		for (const ref of refs) {
			detailsReferences.push({
				text: `${ref.authors.join(', ')} \n${ref.title} ${ref.source}, ${ref.date}, PMID: ${ref.id}. \n`,
			});
		}

		return detailsReferences;
	}

	async getReportData(analysisId: number): Promise<IReportData> {
		const pgxData: IPgxData[] = await this.getPgxData(analysisId);
		const categories = [];
		const data: IPgxReportData[] = [];

		for (const i in pgxData) {
			const item = pgxData[i];
			const annotationText = item.annotation_text.split('.,"').join('.","');

			const annotationArray = annotationText.split(',"');
			const annotationList = {};

			for (const k in annotationArray) {
				const anoItem = annotationArray[k].split('"').join('');
				annotationList[anoItem.split(':')[0]] = anoItem;
			}

			if (categories.indexOf(item.drug_response_category) == -1) {
				categories.push(item.drug_response_category);
			}

			const drugs = item.related_chemicals.split(',');

			for (const j in drugs) {
				data.push({
					chrom: item.chrom,
					pos: item.pos,
					ref: item.ref,
					alt: item.alt,
					af: item.af,
					rsid: item.rsid,
					drug: drugs[j].split('"').join('').trim(),
					evidence: item.evidence,
					drug_response_category: item.drug_response_category,
					gene: item.gene,
					variant: item.rsid,
					genotype: '',
					annotation_text: annotationList,
				});
			}
		}

		let resultList: IPgxReportData[] = [];

		for (const i in data) {
			const item = data[i];
			if (item.af >= 0.92) {
				resultList.push({
					chrom: item.chrom,
					pos: item.pos,
					ref: item.ref,
					alt: item.alt,
					af: item.af,
					drug: item.drug.split('(')[0],
					rsid: item.rsid,
					evidence: item.evidence,
					drug_response_category: item.drug_response_category,
					gene: item.gene,
					variant: item.variant,
					genotype: item.genotype,
					annotation_text: item.annotation_text[item.alt + item.alt]
						? item.annotation_text[item.alt + item.alt]
						: item.annotation_text[item.alt + '/' + item.alt],
				});
			} else {
				let annotationText = item.annotation_text[item.alt + item.ref]
					? item.annotation_text[item.alt + item.ref]
					: item.annotation_text[item.ref + item.alt];
				annotationText = annotationText
					? annotationText
					: item.annotation_text[item.ref + '/' + item.alt];
				resultList.push({
					chrom: item.chrom,
					pos: item.pos,
					ref: item.ref,
					alt: item.alt,
					af: item.af,
					drug: item.drug.split('(')[0],
					rsid: item.rsid,
					evidence: item.evidence,
					drug_response_category: item.drug_response_category,
					gene: item.gene,
					variant: item.variant,
					genotype: item.genotype,
					annotation_text: annotationText,
				});
			}
		}

		resultList = resultList
			.filter((item) => item.annotation_text)
			.sort((a, b) => (a.drug > b.drug ? 1 : a.drug < b.drug ? -1 : 0));

		return {
			pgxData: resultList,
			categories: categories,
		};
	}

	async getPgxData(analysisId: number) {
		const variants = await this.variantsService.getPgxVariants(analysisId);

		const rsIds = variants.map((variant) => variant.rsid);

		const pgxRecords = await this.pgxRepository.find({
			where: {
				rsid: In(rsIds),
			},
		});

		const result: IPgxData[] = [];

		for (const i in pgxRecords) {
			for (const j in variants) {
				if (
					pgxRecords[i].rsid == variants[j].rsid &&
					(pgxRecords[i].gene.indexOf(variants[j].gene) == 0 ||
						pgxRecords[i].gene == '.')
				) {
					result.push({
						chrom: variants[j].chrom,
						pos: variants[j].inputPos,
						ref: variants[j].REF,
						alt: variants[j].ALT,
						rsid: variants[j].rsid,
						af: variants[j].alleleFrequency,
						gene: variants[j].gene,
						evidence: pgxRecords[i].evidence,
						related_chemicals: pgxRecords[i].related_chemicals,
						drug_response_category: pgxRecords[i].drug_response_category,
						annotation_text: pgxRecords[i].annotation_text,
					});
				}
			}
		}

		return result;
	}

	async createPgxReport(analysisId: number, userId: number) {
		const { pgxData, categories } = await this.getReportData(analysisId);

		const patientResult =
			await this.patientsInformationService.findOne(analysisId);
		const patient = patientResult.data;

		const analysisResult = await this.analysisService.findOne(analysisId);
		const analysis = analysisResult.data;

		const groups = categories.map((cat) => ({
			drug_response_category: cat,
			rows: pgxData.filter((item) => item.drug_response_category === cat),
		}));

		const templateData: IPgxTemplateData = {
			patient_no: `GE-${patient.id}`,
			patient_name: `${patient.first_name} ${patient.last_name}`,
			dob: dayjs(patient.dob).format('DD/MM/YYYY'),
			gender: patient.gender,
			ethnicity: patient.ethnicity,
			physician_name: 'N/A',
			specimen: patient.sample_type,
			received_date: dayjs(analysis.createdAt).format('DD/MM/YYYY'),
			prepared_by: 'TLU GENETICS',
			report_date: dayjs(new Date()).format('DD/MM/YYYY'),
			groups,
		};
		const { fileName } = await this.generatePgxReportFile(
			templateData,
			userId,
			analysisId,
		);

		const report = this.reportRepository.create({
			report_name: `PGx_Report_${dayjs(new Date()).format('YYYYMMDD_HHmmss')}`,
			analysis_id: analysisId,
			user_created: userId,
			file_path: fileName,
			is_deleted: 0,
		});

		const downloadUrl = await this.s3Provider.generateDownloadUrl(
			`${this.configService.get('ANALYSIS_FOLDER')}/${userId}/${analysis.id}/reports/${fileName}`,
		);
		await this.reportRepository.save(report);

		return {
			status: 'success',
			message: 'PGx report created successfully',
			data: {
				...report,
				downloadUrl,
			},
		};
	}

	private async generatePgxReportFile(
		data: IPgxTemplateData,
		user_id: number,
		analysis_id: number,
	) {
		const templatePath = path.resolve(
			__dirname,
			'templates/genetics_Pgx_template.docx',
		);

		if (!fs.existsSync(templatePath)) {
			throw new BadRequestException('PGx report template not found');
		}

		const content = fs.readFileSync(templatePath);
		const zip = new PizZip(content);
		const doc = new Docxtemplater(zip, {
			paragraphLoop: true,
			linebreaks: true,
		});

		try {
			doc.render(data);
		} catch (error) {
			throw new BadRequestException('Error rendering PGx report template');
		}

		const buffer = doc.getZip().generate({ type: 'nodebuffer' });
		const fileName = `pgx_report_${Date.now()}.docx`;
		const outputPath = `${this.configService.get('MOUNT_FOLDER')}/${this.configService.get('ANALYSIS_FOLDER')}/${user_id}/${analysis_id}/reports/${fileName}`;

		if (!fs.existsSync(path.dirname(outputPath))) {
			fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		}

		fs.writeFileSync(outputPath, new Uint8Array(buffer));

		return { fileName, filePath: outputPath };
	}
}
