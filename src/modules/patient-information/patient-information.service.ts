import {
	BadRequestException,
	forwardRef,
	Inject,
	Injectable,
} from '@nestjs/common';
import { CreatePatientInformationDto } from './dto/create-patient-information.dto';
import { UpdatePatientInformationDto } from './dto/update-patient-information.dto';
import { PatientsInformation } from '@/entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalysisService } from '../analysis/analysis.service';
import { CacheProvider } from '@/common/providers/cache.provider';
import * as dayjs from 'dayjs';

@Injectable()
export class PatientsInformationService {
	constructor(
		@InjectRepository(PatientsInformation)
		private patientInformationRepository: Repository<PatientsInformation>,
		@Inject(forwardRef(() => AnalysisService))
		private readonly analysisService: AnalysisService,
		private readonly cacheProvider: CacheProvider,
	) {}

	async create(createPatientInformationDto: CreatePatientInformationDto) {
		const new_patient = new PatientsInformation();

		new_patient.first_name = createPatientInformationDto.first_name;
		new_patient.last_name = createPatientInformationDto.last_name;
		new_patient.dob = createPatientInformationDto.dob;
		new_patient.phenotype = createPatientInformationDto.phenotype;
		new_patient.sample_id = createPatientInformationDto.sample_id;

		return await this.patientInformationRepository.save(new_patient);
	}

	findAll() {
		return `This action returns all patientInformation`;
	}

	async findOne(analysis_id: number) {
		const cacheKey = `patient:analysis:${analysis_id}`;
		const ttlSeconds = 600; // 10 minutes

		const patientInfo = await this.cacheProvider.getOrSet(
			cacheKey,
			ttlSeconds,
			async () => {
				const temp = await this.analysisService.findOne(analysis_id);
				const analysis = temp.data;

				const patient = await this.patientInformationRepository.findOne({
					where: { sample_id: analysis.sample_id },
				});
				if (!patient) {
					throw new BadRequestException('The patient could not be found');
				}

				return {
					...patient,
					createdAt: dayjs(patient.createdAt).format('DD/MM/YYYY'),
					dob: dayjs(patient.dob).format('YYYY/MM/DD'),
					sample_name: analysis.sampleName,
				};
			},
		);

		return {
			status: 'success',
			message: 'Get patient information successfully',
			data: patientInfo,
		};
	}

	async update(
		id: number,
		updatePatientInformationDto: UpdatePatientInformationDto,
	) {
		try {
			await this.patientInformationRepository.update(id, {
				first_name: updatePatientInformationDto.first_name,
				last_name: updatePatientInformationDto.last_name,
				dob: updatePatientInformationDto.dob,
				phenotype: updatePatientInformationDto.phenotype,
				ethnicity: updatePatientInformationDto.ethnicity,
				sample_type: updatePatientInformationDto.sample_type,
				gender: updatePatientInformationDto.gender,
			});

			await this.cacheProvider.delByPattern(`patient:*`);

			return {
				status: 'success',
				message: 'Patient information updated successfully',
			};
		} catch (error) {
			console.log('PatientsInformationService@update', error);
			throw new BadRequestException('The patient could not be updated');
		}
	}

	remove(id: number) {
		return `This action removes a #${id} patientInformation`;
	}
}
