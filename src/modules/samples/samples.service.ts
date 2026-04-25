import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateSampleFastQDto } from './dto/create-sample-fastq.dto';
import { UpdateSampleDto } from './dto/update-sample.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Samples } from '@/entities';
import { Like, Repository } from 'typeorm';
import { PaginationProvider } from '@/common/providers/pagination.provider';
import { CacheProvider } from '@/common/providers/cache.provider';
import * as dayjs from 'dayjs';
import { FilterSampleDto } from './dto/filter-sample.dto';
import { S3Provider } from '@/common/providers/s3.provider';
import { PostFileInforDto } from './dto/post-file-infor.dto';
import { ConfigService } from '@nestjs/config';
import { SampleStatus } from '@/enums/samples.enum';
import { UploadStatus } from '@/enums/uploads.enum';
import { UploadsService } from '../uploads/uploads.service';
import { PatientsInformationService } from '../patient-information/patient-information.service';
import { GeneratePresignedUrls } from './dto/generate-presigned-urls.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { UpdateUploadDto } from '../uploads/dto/update-upload.dto';
import { createHash } from 'crypto';

@Injectable()
export class SamplesService {
	constructor(
		@InjectRepository(Samples) private samplesRepository: Repository<Samples>,
		private readonly paginationProvider: PaginationProvider,
		private readonly cacheProvider: CacheProvider,
		private readonly s3Provider: S3Provider,
		private readonly configService: ConfigService,
		private readonly uploadsService: UploadsService,
		private readonly patientsInformationService: PatientsInformationService,
	) {}

	create(_createSampleFastQDto: CreateSampleFastQDto) {
		return 'This action adds a new sample';
	}

	async createSampleFastQ(body: CreateSampleFastQDto[], user_id: number) {
		for (const sample of body) {
			const reverse = sample.reverse[0];
			const forward = sample.forward[0];

			const forwardUploadInfor: UpdateUploadDto = {
				file_path: `${this.configService.get('UPLOAD_FOLDER')}/${user_id}/${forward.uploadName}`,
				upload_name: forward.uploadName,
				upload_status: UploadStatus.COMPLETED,
				fastq_pair_index: 1,
			};

			const reverseUploadInfor: UpdateUploadDto = {
				file_path: `${this.configService.get('UPLOAD_FOLDER')}/${user_id}/${reverse.uploadName}`,
				upload_name: reverse.uploadName,
				upload_status: UploadStatus.COMPLETED,
				fastq_pair_index: 2,
			};

			await this.uploadsService.update(forward.uploadId, forwardUploadInfor);
			await this.uploadsService.update(reverse.uploadId, reverseUploadInfor);

			// create sample
			const sampleInfor = {
				name: sample.sampleName,
				user_id: user_id,
				file_size: sample.file_size,
				file_type: sample.file_type,
				complete_status: SampleStatus.COMPLETED,
			};
			const sampleSaved = await this.createSample(sampleInfor);
			if (!sampleSaved) {
				throw new BadRequestException('Sample created failed!');
			}

			await this.uploadsService.updateSampleId(
				forward.uploadId,
				sampleSaved.id,
			);
			await this.uploadsService.updateSampleId(
				reverse.uploadId,
				sampleSaved.id,
			);

			// create patient infor
			const patientInfor = {
				first_name: sample.firstName,
				last_name: sample.lastName,
				dob: sample.dob,
				phenotype: sample.phenotype,
				sample_id: sampleSaved.id,
				gender: '',
				ethnicity: '',
				sample_type: '',
			};
			const patient =
				await this.patientsInformationService.create(patientInfor);
			if (!patient) {
				throw new BadRequestException('Patient Information create failed');
			}
		}

		await this.cacheProvider.delByPattern(`sample:list:user:${user_id}:*`);

		return {
			status: 'success',
			message: 'Create FastQ samples successfully',
		};
	}

	async findAll(
		id: number,
		page: number,
		pageSize: number,
		filterSampleDto: FilterSampleDto,
	) {
		const filterHash = createHash('md5')
			.update(JSON.stringify(filterSampleDto))
			.digest('hex')
			.slice(0, 8);
		const cacheKey = `sample:list:user:${id}:p${page}:ps${pageSize}:${filterHash}`;

		const cached = await this.cacheProvider.getOrSet(
			cacheKey,
			5 * 60,
			async () => {
				const filters: any = {
					user_id: id,
				};

				if (filterSampleDto.type != '') {
					filters.file_type = filterSampleDto.type;
				}
				if (filterSampleDto.assembly != '') {
					filters.assembly = filterSampleDto.assembly;
				}
				if (filterSampleDto.searchTerm != '') {
					filters.name = Like(`%${filterSampleDto.searchTerm}%`);
				}

				const results = await this.paginationProvider.paginate<Samples>(
					page,
					pageSize,
					this.samplesRepository,
					filters,
				);

				const data = await Promise.all(
					results.data.map(async (sample) => {
						const formatted_date = dayjs(sample.createdAt).format('DD/MM/YYYY');
						const sample_status = Samples.getSampleStatus(
							sample.complete_status,
						);
						return {
							id: sample.id,
							name: sample.name,
							createdAt: formatted_date,
							type: sample.file_type,
							status: sample_status,
							size: sample.file_size,
							assembly: sample.assembly,
						};
					}),
				);

				return { ...results, data };
			},
		);
		return { ...cached, message: 'List all samples successfully!' };
	}

	async findOne(id: number) {
		const cacheKey = `sample:${id}`;
		const ttlSeconds = 300;

		const sample = await this.cacheProvider.getOrSet(
			cacheKey,
			ttlSeconds,
			async () => {
				const sampleData = await this.samplesRepository.findOne({
					where: { id },
				});
				if (!sampleData) {
					throw new BadRequestException('That sample could not be found');
				}
				let uploadsData = await this.uploadsService.findUploadsBySampleId(
					sampleData.id,
				);
				uploadsData = await Promise.all(
					uploadsData.map(async (upload) => ({
						...upload,
						file_path: await this.s3Provider.generateDownloadUrl(
							upload.file_path,
						),
					})),
				);
				return { ...sampleData, uploads: uploadsData };
			},
		);

		return {
			status: 'success',
			message: 'got sample successfully!',
			data: sample,
		};
	}

	async getSamplesByPipeLine(id: number) {
		let file_type;
		if (id == 1) {
			file_type = 'fastq';
		} else if (id == 2) {
			file_type = 'vcf';
		} else {
			throw new BadRequestException('There is not a pipeline has that id!');
		}

		const samples = await this.cacheProvider.getOrSet(
			`sample:pipeline:${id}`,
			5 * 60,
			() => this.samplesRepository.find({ where: { file_type } }),
		);

		return {
			status: 'success',
			message: 'getSamplesByPipeLine successfully!',
			data: samples,
		};
	}

	async generateSinglePresignedUrl(fileName: string, user_id: number) {
		const uploadName = this.s3Provider.generateFileName(fileName);
		return {
			status: 'success',
			message: 'Generate single presigned url successfully',
			data: {
				url: await this.s3Provider.generateSinglePresignedUrl(
					`${this.configService.get('UPLOAD_FOLDER')}/${user_id}/${uploadName}`,
				),
				uploadName,
			},
		};
	}

	async startMultipartUpload(fileName: string, user_id: number) {
		const uploadName = this.s3Provider.generateFileName(fileName);
		return {
			status: 'success',
			message: 'Start multipart upload successfully',
			data: {
				UploadId: await this.s3Provider.startMultipartUpload(
					`${this.configService.get('UPLOAD_FOLDER')}/${user_id}/${uploadName}`,
				),
				uploadName,
			},
		};
	}

	async generatePresignedUrls(
		generatePresignedUrls: GeneratePresignedUrls,
		user_id: number,
	) {
		return {
			status: 'success',
			message: 'Start multipart upload successfully',
			data: {
				urls: await this.s3Provider.generatePresignedUrls(
					`${this.configService.get('UPLOAD_FOLDER')}/${user_id}/${generatePresignedUrls.fileName}`,
					generatePresignedUrls.uploadId,
					generatePresignedUrls.partNumbers,
				),
			},
		};
	}

	async completeMultipartUpload(
		completeUploadDto: CompleteUploadDto,
		user_id: number,
	) {
		return {
			status: 'success',
			message: 'Start multipart upload successfully',
			data: await this.s3Provider.completeMultipartUpload(
				`${this.configService.get('UPLOAD_FOLDER')}/${user_id}/${completeUploadDto.fileName}`,
				completeUploadDto.uploadId,
				completeUploadDto.parts,
			),
		};
	}

	async postFileInfor(postFileInforDto: PostFileInforDto, user_id: number) {
		const uploadInfor = {
			original_name: postFileInforDto.original_name,
			file_size: postFileInforDto.file_size,
			file_type: postFileInforDto.file_type,
			upload_name: postFileInforDto.upload_name,
			user_created: user_id,
			file_path: `${this.configService.get('UPLOAD_FOLDER')}/${user_id}/${postFileInforDto.upload_name}`,
			is_deleted: 0,
			upload_status: UploadStatus.COMPLETED,
		};

		const sampleInfor = {
			name: postFileInforDto.sample_name,
			user_id: user_id,
			file_size: postFileInforDto.file_size,
			file_type: postFileInforDto.file_type,
			assembly: postFileInforDto.assembly,
			complete_status: SampleStatus.COMPLETED,
		};

		// create upload
		const upload = await this.uploadsService.createUploadForSample(uploadInfor);
		if (!upload) {
			throw new BadRequestException(
				'There was an error creating the upload information!',
			);
		}

		// create sample
		const sample = await this.createSample(sampleInfor);
		if (!sample) {
			throw new BadRequestException('Sample created failed!');
		}
		await this.uploadsService.updateSampleId(upload.id, sample.id);

		// create patient infor
		const patientInfor = {
			first_name: postFileInforDto.first_name,
			last_name: postFileInforDto.last_name,
			dob: postFileInforDto.dob,
			phenotype: postFileInforDto.phenotype,
			sample_id: sample.id,
			gender: '',
			ethnicity: '',
			sample_type: '',
		};
		const patient = await this.patientsInformationService.create(patientInfor);
		if (!patient) {
			throw new BadRequestException('Patient Information create failed');
		}

		await this.cacheProvider.delByPattern(`sample:list:user:${user_id}:*`);

		return {
			status: 'success',
			message: 'Create sample successfully',
		};
	}

	async createSample(data) {
		const new_sample = new Samples();

		new_sample.name = data.name;
		new_sample.user_id = data.user_id;
		new_sample.file_size = data.file_size;
		new_sample.file_type = data.file_type;
		new_sample.assembly = data.assembly;
		new_sample.complete_status = data.complete_status;

		return await this.samplesRepository.save(new_sample);
	}

	async getSamplesBySampleName(sampleName: string) {
		const samples = await this.samplesRepository.find({
			where: {
				name: Like(`%${sampleName}%`),
			},
		});

		return samples.map((sample) => sample.id);
	}

	async getTotal(user_id: number) {
		const samples = await this.samplesRepository.find({
			where: { user_id: user_id, complete_status: SampleStatus.COMPLETED },
		});
		return samples.length;
	}

	async getSamplesStaticsByAssembly(user_id: number) {
		const hg19 = await this.samplesRepository.count({
			where: {
				user_id: user_id,
				complete_status: SampleStatus.COMPLETED,
				assembly: 'hg19',
			},
		});
		const hg38 = await this.samplesRepository.count({
			where: {
				user_id: user_id,
				complete_status: SampleStatus.COMPLETED,
				assembly: 'hg38',
			},
		});

		return {
			hg19,
			hg38,
		};
	}

	async getSamplesStaticsByFileType(user_id: number) {
		const vcf = await this.samplesRepository.count({
			where: {
				user_id: user_id,
				complete_status: SampleStatus.COMPLETED,
				file_type: 'vcf',
			},
		});
		const fastq = await this.samplesRepository.count({
			where: {
				user_id: user_id,
				complete_status: SampleStatus.COMPLETED,
				file_type: 'fastq',
			},
		});

		return {
			vcf,
			fastq,
		};
	}

	async getSamplesLastSixMonths(
		user_id: number,
		lastSixMonthsNumbers: number[],
	) {
		const data = [];

		const now = new Date();
		const currentYear = now.getFullYear();
		const currentMonth = now.getMonth() + 1;

		for (const month of lastSixMonthsNumbers) {
			const year = month > currentMonth ? currentYear - 1 : currentYear;

			const results = await this.samplesRepository
				.createQueryBuilder('samples')
				.where('MONTH(samples.createdAt) = :month', { month })
				.andWhere('YEAR(samples.createdAt) = :year', { year })
				.andWhere('samples.user_id = :user_id', { user_id })
				.getMany();

			data.push(results.length);
		}

		return data;
	}

	update(id: number, _updateSampleDto: UpdateSampleDto) {
		return `This action updates a #${id} sample`;
	}

	remove(id: number) {
		return `This action removes a #${id} sample`;
	}
}
