import { BadRequestException, Injectable } from '@nestjs/common';
import { FilterVariantsDto } from './dto/filter-variants.dto';
import { ConfigService } from '@nestjs/config';
import { MongodbProvider } from '@/common/providers/mongodb.provider';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { GeneClinicalSynopsis } from '@/entities';
import { AnalysisService } from '../analysis/analysis.service';
import { AddVariantsToReport } from './dto/add-variants-to-report.dto';
import { VariantToReportDto } from './dto/variant-to-report.dto';

@Injectable()
export class VariantsService {
	constructor(
		@InjectRepository(GeneClinicalSynopsis)
		private geneClinicalSynopsisRepository: Repository<GeneClinicalSynopsis>,
		private readonly configService: ConfigService,
		private readonly mongodbProvider: MongodbProvider,
		private readonly analysisServive: AnalysisService,
	) {}

	async findOne(
		id: number,
		page: number,
		pageSize: number,
		filter: FilterVariantsDto,
	) {
		const offset = (page - 1) * pageSize;
		const pageBegin = offset + 1;
		const pageEnd = pageBegin + pageSize - 1;

		const db = await this.mongodbProvider.mongodbConnect();
		const collection = db.collection(
			`${this.configService.get<string>('MONGO_DB_PREFIX')}_${id}`,
		);
		if (!collection) {
			return {
				status: 'error',
				message: 'Collection not found',
				data: [],
			};
		}

		const pipeline = [];
		const pipeCount = [];
		const matchAnd = this.matchFilter(filter);

		if (matchAnd.length > 0) {
			const match = { $match: { $and: matchAnd } };
			pipeline.push(match);
			pipeCount.push(match);
		}

		pipeline.push({
			$addFields: {
				clinsigPriority: this.makeClinsigPriority(),
			},
		});
		pipeline.push({ $sort: { clinsigPriority: 1 } });
		pipeline.push({ $skip: offset });
		pipeline.push({ $limit: pageSize });
		pipeline.push({ $project: this.projectFields() });
		pipeCount.push({ $group: { _id: null, count: { $sum: 1 } } });

		const [data, count] = await Promise.all([
			collection.aggregate(pipeline, { allowDiskUse: true }).toArray(),
			collection.aggregate(pipeCount, { allowDiskUse: true }).toArray(),
		]);

		for (const item of data) {
			const omim = await this.getOmimDiseaseForGeneName(item.gene);
			item.omimDisease = omim?.pheno_name || null;
			item.gene_omim = omim?.gene_omim || null;
		}

		// await this.mongodbProvider.mongodbDisconnect();

		return {
			status: 'success',
			message: 'Get variants successfully',
			data: data,
			totalItems: count[0]?.count || 0,
			totalPages: Math.ceil((count[0]?.count || 0) / pageSize),
			pageBegin,
			pageEnd,
		};
	}

	async getVariantsSelected(id: number) {
		const chrom_pos_ref_alt_arr = [];
		const temp = await this.analysisServive.findOne(id);
		if (temp.status != 'success') {
			throw new BadRequestException('Failed to fetch analysis');
		}
		const analysis = temp.data;

		const variantToReport = analysis.variants_to_report
			? JSON.parse(analysis.variants_to_report)
			: [];

		for (const i in variantToReport) {
			const chrom_pos_ref_alt_analysis =
				variantToReport[i].chrom +
				'_' +
				variantToReport[i].pos +
				'_' +
				variantToReport[i].ref +
				'_' +
				variantToReport[i].alt +
				'_' +
				variantToReport[i].gene;
			chrom_pos_ref_alt_arr.push(chrom_pos_ref_alt_analysis);
		}

		const db = await this.mongodbProvider.mongodbConnect();
		const collection = db.collection(
			`${this.configService.get<string>('MONGO_DB_PREFIX')}_${id}`,
		);
		if (!collection) {
			return {
				status: 'error',
				message: 'Collection not found',
				data: [],
			};
		}

		const pipeline = [];
		const matchAnd = [];

		matchAnd.push({ chrom_pos_ref_alt_gene: { $in: chrom_pos_ref_alt_arr } });
		const match = { $match: { $and: matchAnd } };
		pipeline.push(match);

		pipeline.push({
			$project: {
				_id: '$_id',
				id: '$chrom_pos_ref_alt_gene',
				gene: '$gene',
				transcript_id: '$transcript',
				position: '$inputPos',
				chrom: '$chrom',
				rsid: '$rsId',
				REF: '$REF',
				ALT: '$ALT',
				cnomen: '$cNomen',
				pnomen: '$pNomen',
				function: '$codingEffect',
				location: '$varLocation',
				coverage: '$coverage',
				gnomad: '$gnomAD_exome_ALL',
				cosmicID: '$cosmicIds',
				classification: '$CLINSIG_FINAL',
				clinvar: '$Clinvar_VARIANT_ID',
				gnomAD_AFR: '$gnomAD_exome_AFR',
				gnomAD_AMR: '$gnomAD_exome_AMR',
				inheritance: '$inheritance',
			},
		});

		const [data] = await Promise.all([
			collection.aggregate(pipeline, { allowDiskUse: true }).toArray(),
		]);

		// await this.mongodbProvider.mongodbDisconnect();

		return {
			status: 'success',
			message: 'Get selected variants successfully',
			data,
		};
	}

	async selectVariantToReport(id: number, body: AddVariantsToReport) {
		const temp = await this.analysisServive.findOne(id);
		if (temp.status != 'success') {
			throw new BadRequestException('Failed to fetch analysis');
		}
		const analysis = temp.data;
		const variants = body.variants;

		const variantToReport = analysis.variants_to_report
			? JSON.parse(analysis.variants_to_report)
			: [];
		const newVariantToReport = [];
		for (const i in variants) {
			let check = true;
			const chrom_pos_ref_alt =
				variants[i].chrom +
				'_' +
				variants[i].pos +
				'_' +
				variants[i].ref +
				'_' +
				variants[i].alt +
				variants[i].gene;
			for (const j in variantToReport) {
				const chrom_pos_ref_alt_analysis =
					variantToReport[j].chrom +
					'_' +
					variantToReport[j].pos +
					'_' +
					variantToReport[j].ref +
					'_' +
					variantToReport[j].alt +
					variantToReport[j].gene;

				if (chrom_pos_ref_alt == chrom_pos_ref_alt_analysis) {
					check = false;
					break;
				}
			}
			if (check) {
				newVariantToReport.push(variants[i]);
			}
		}
		const arr = newVariantToReport.concat(variantToReport);
		await this.analysisServive.updateVariantsSelected(id, arr);
		return {
			status: 'success',
			message: 'Add variants to report successfully',
		};
	}

	private matchFilter(filter: FilterVariantsDto) {
		const matchAnd = [];

		// Find variants with filter:  FilterVariantsDto {
		//   chrom: [ '2', '20', 'X' ],
		//   readDepthSign: 'lower',
		//   readDepth: 2,
		//   AFSign: 'lower',
		//   alleleFraction: -2,
		//   gnomAdSign: 'lower',
		//   gnomAd: 0.01,
		//   gene: [ 'WASH7P' ],
		//   annotation: [ 'missense' ],
		//   classification: [ 'likely benign', 'pathogenic' ]
		// }

		if (filter?.chrom?.length) {
			matchAnd.push({ chrom: { $in: filter.chrom } });
		}

		if (filter?.gene?.length) {
			matchAnd.push({ gene: { $in: filter.gene } });
		}

		if (filter?.annotation?.length) {
			matchAnd.push({ codingEffect: { $in: filter.annotation } });
		}

		if (filter?.classification?.length) {
			matchAnd.push({ CLINSIG_FINAL: { $in: filter.classification } });
		}

		if (filter?.alleleFraction !== undefined && filter?.AFSign) {
			matchAnd.push({
				alleleFrequency: {
					[filter.AFSign === 'lower' ? '$lte' : '$gte']: filter.alleleFraction,
				},
			});
		}

		if (filter?.gnomAd !== undefined && filter?.gnomAdSign) {
			matchAnd.push({
				gnomAD_exome_ALL: {
					[filter.gnomAdSign === 'lower' ? '$lte' : '$gte']: filter.gnomAd,
				},
			});
		}

		if (filter?.readDepth !== undefined && filter?.readDepthSign) {
			matchAnd.push({
				readDepth: {
					[filter.readDepthSign === 'lower' ? '$lte' : '$gte']:
						filter.readDepth,
				},
			});
		}

		return matchAnd;
	}

	async getPgxVariants(analysisId: number) {
		const db = await this.mongodbProvider.mongodbConnect();
		const collection = db.collection(
			`${this.configService.get<string>('MONGO_DB_PREFIX')}_${analysisId}`,
		);
		if (!collection) {
			return [];
		}

		const pipeline = [];
		const matchAnd = [];

		matchAnd.push({ PGx: 1 });
		const match = { $match: { $and: matchAnd } };
		pipeline.push(match);

		pipeline.push({
			$project: {
				_id: '$_id',
				gene: '$gene',
				transcript_id: '$transcript',
				inputPos: '$inputPos',
				chrom: '$chrom',
				rsid: '$rsId',
				REF: '$REF',
				ALT: '$ALT',
				alleleFrequency: `$alleleFrequency`,
				classification: '$CLINSIG_FINAL',
			},
		});

		const [variants] = await Promise.all([
			collection.aggregate(pipeline, { allowDiskUse: true }).toArray(),
		]);

		return variants;
	}

	private projectFields() {
		return {
			id: '$_id',
			gene: '$gene',
			transcript_id: '$transcript',
			position: '$inputPos',
			chrom: '$chrom',
			rsid: '$rsId',
			REF: '$REF',
			ALT: '$ALT',
			cnomen: '$cNomen',
			pnomen: '$pNomen',
			function: '$codingEffect',
			location: '$varLocation',
			coverage: '$coverage',
			gnomad: '$gnomAD_exome_ALL',
			gnomad_ALL: '$gnomAD_exome_ALL',
			cosmicID: '$cosmicIds',
			classification: '$CLINSIG_FINAL',
			clinvar: '$Clinvar_VARIANT_ID',
			gnomAD_AFR: '$gnomAD_exome_AFR',
			gnomAD_AMR: '$gnomAD_exome_AMR',
			Consequence: '$Consequence',
			EXON: '$EXON',
			INTRON: '$INTRON',
			DOMAINS: '$DOMAINS',
			gnomAD_genome_AMR: '$gnomAD_genome_AMR',
			gnomADe_AMR: '$gnomADe_AMR',
			CLINSIG: '$CLINSIG',
			NEW_CLINSIG: '$NEW_CLINSIG',
			CLNACC: '$CLNACC',
			SOMATIC: '$SOMATIC',
			cosmics: '$cosmics',
			SIFT_score: '$SIFT_score',
			Polyphen2_HDIV_score: '$Polyphen2_HDIV_score',
			CADD_PHRED: '$CADD_PHRED',
			PUBMED: '$PUBMED',
			gold_stars: '$gold_stars',
			review_status: '$review_status',
			Clinvar_VARIANT_ID: '$Clinvar_VARIANT_ID',
			gene_omim: '$gene_omim',
			GeneSplicer: '$GeneSplicer',
			gnomADe_AFR: '$gnomADe_AFR',
			gnomAD_genome_AFR: '$gnomAD_genome_AFR',
			'1000g_AFR_AF': '$1000g_AFR_AF',
			'1000g_AMR_AF': '$1000g_AMR_AF',
			gnomADe_EAS: '$gnomADe_EAS',
			gnomAD_genome_EAS: '$gnomAD_genome_EAS',
			gnomADe_SAS: '$gnomADe_SAS',
			'1000g_SAS_AF': '$1000g_SAS_AF',
			gnomADe_ASJ: '$gnomADe_ASJ',
			gnomAD_genome_ASJ: '$gnomAD_genome_ASJ',
			gnomADe_FIN: '$gnomADe_FIN',
			gnomAD_genome_FIN: '$gnomAD_genome_FIN',
			'1000g_EUR_AF': '$1000g_EUR_AF',
			gnomADe_NFE: '$gnomADe_NFE',
			gnomAD_genome_NFE: '$gnomAD_genome_NFE',
			gnomADe_OTH: '$gnomADe_OTH',
			gnomADe_ALL: '$gnomADe_ALL',
			gnomAD_genome_ALL: '$gnomAD_genome_ALL',
			'1000g_AF': '$1000g_AF',
			gnomAD_genome_OTH: '$gnomAD_genome_OTH',
			CANONICAL: '$CANONICAL',
			'1000g_EAS_AF': '$1000g_EAS_AF',
			HGNC_SYMONYMS: '$HGNC_SYMONYMS',
			HGNC_PRE_SYMBOL: '$HGNC_PRE_SYMBOL',
			VAR_SCORE: '$VAR_SCORE',
			HGVSc: '$varHGVSc',
			HGVSp: '$varHGVSp',
		};
	}

	async getOmimDiseaseForGeneName(geneName: string) {
		try {
			const results = await this.geneClinicalSynopsisRepository
				.createQueryBuilder('gene')
				.select([
					'gene.gene_name AS gene_name',
					'gene.gene_omim AS gene_omim',
					'GROUP_CONCAT(gene.pheno_name) AS pheno_name',
				])
				.where('gene.gene_name = :geneName', { geneName })
				.groupBy('gene.gene_name, gene.gene_omim')
				.getRawOne();

			if (results && results.pheno_name) {
				return {
					pheno_name: results.pheno_name,
					gene_omim: results.gene_omim,
				};
			}

			return {
				pheno_name: '',
				gene_omim: '',
			};
		} catch (error) {
			console.log('VariantsService@getOmimDiseaseForGeneName:', error);
			throw new BadRequestException(
				'Unable to connect to the database, please try again later!',
			);
		}
	}

	async deleteSelectedVariant(id: number, variant: VariantToReportDto) {
		try {
			const temp = await this.analysisServive.findOne(id);
			if (temp.status != 'success') {
				throw new BadRequestException('Failed to fetch analysis');
			}
			const analysis = temp.data;
			const variantToDelete =
				variant.chrom +
				'_' +
				variant.pos +
				'_' +
				variant.ref +
				'_' +
				variant.alt +
				variant.gene;
			const variants = analysis.variants_to_report
				? JSON.parse(analysis.variants_to_report)
				: [];

			const newVariantToReport = [];
			for (const i in variants) {
				const chrom_pos_ref_alt =
					variants[i].chrom +
					'_' +
					variants[i].pos +
					'_' +
					variants[i].ref +
					'_' +
					variants[i].alt +
					variants[i].gene;

				if (chrom_pos_ref_alt != variantToDelete) {
					newVariantToReport.push(variants[i]);
				}
			}

			await this.analysisServive.updateVariantsSelected(id, newVariantToReport);

			return {
				status: 'success',
				message: 'Delete selected variant successfully',
			};
		} catch (error) {
			console.log('VariantsService@deleteSelectedVariant:', error);
			throw new BadRequestException('Error!');
		}
	}

	makeClinsigPriority() {
		return {
			$ifNull: [
				'$CLINSIG_PRIORITY',
				{
					$cond: {
						if: {
							$eq: ['$CLINSIG_FINAL', 'drug response'],
						},
						then: 0,
						else: {
							$cond: {
								if: {
									$eq: ['$CLINSIG_FINAL', 'pathogenic'],
								},
								then: 1,
								else: {
									$cond: {
										if: {
											$eq: ['$CLINSIG_FINAL', 'likely pathogenic'],
										},
										then: 2,
										else: {
											$cond: {
												if: {
													$eq: ['$CLINSIG_FINAL', 'uncertain significance'],
												},
												then: 3,
												else: {
													$cond: {
														if: {
															$eq: ['$CLINSIG_FINAL', 'likely benign'],
														},
														then: 4,
														else: {
															$cond: {
																if: {
																	$eq: ['$CLINSIG_FINAL', 'benign'],
																},
																then: 5,
																else: 6,
															},
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			],
		};
	}
}
