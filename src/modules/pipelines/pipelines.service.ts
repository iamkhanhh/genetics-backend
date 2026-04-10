import { BadRequestException, Injectable } from '@nestjs/common';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { Pipelines } from '@/entities';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CacheProvider } from '@/common/providers/cache.provider';

@Injectable()
export class PipelinesService {
	constructor(
		@InjectRepository(Pipelines)
		private pipelinesRepository: Repository<Pipelines>,
		private readonly cacheProvider: CacheProvider,
	) {}

	async create(createPipelineDto: CreatePipelineDto) {
		const pipeline = await this.pipelinesRepository.findOne({
			where: {
				name: createPipelineDto.name,
			},
		});
		if (pipeline) {
			throw new BadRequestException('This pipeline name is already existed!');
		}

		const newPipeline = new Pipelines();
		newPipeline.name = createPipelineDto.name;
		newPipeline.version = createPipelineDto.version;
		newPipeline.is_deleted = 0;
		const savedPipeline = await this.pipelinesRepository.save(newPipeline);
		await this.cacheProvider.del('pipelines:all');
		return {
			status: 'success',
			message: 'Created a pipeline successfully!',
			data: savedPipeline,
		};
	}

	async findAll() {
		const cacheKey = 'pipelines:all';
		const ttlSeconds = 24 * 60 * 60;
		const pipelines = await this.cacheProvider.getOrSet(
			cacheKey,
			ttlSeconds,
			async () => {
				const pipelines = await this.pipelinesRepository.find({
					where: {
						is_deleted: 0,
					},
				});
				if (pipelines.length === 0) {
					throw new BadRequestException('No pipelines found');
				}
				return pipelines;
			},
		);
		return {
			status: 'success',
			message: 'load all pipelines successfully!',
			data: pipelines,
		};
	}

	async findOne(id: number) {
		const cacheKey = `pipeline:${id}`;
		const ttlSeconds = 24 * 60 * 60;
		const pipeline = await this.cacheProvider.getOrSet(
			cacheKey,
			ttlSeconds,
			async () => {
				const result = await this.pipelinesRepository.findOne({
					where: {
						id: id,
					},
				});
				if (!result) {
					throw new BadRequestException('The pipeline could not be found!');
				}
				if (result.is_deleted) {
					throw new BadRequestException('The pipeline is deleted!');
				}
				return result;
			},
		);

		return {
			status: 'success',
			message: 'Get pipeline successfully!',
			data: pipeline,
		};
	}

	async update(id: number, updatePipelineDto: UpdatePipelineDto) {
		const pipeline = await this.pipelinesRepository.findOne({ where: { id } });
		if (!pipeline) {
			throw new BadRequestException('That pipeline could not be found');
		}
		await this.pipelinesRepository.update({ id }, { ...updatePipelineDto });
		await this.cacheProvider.del('pipelines:all', `pipeline:${id}`);
		return {
			status: 'success',
			message: 'Updated pipeline successfully!',
		};
	}

	async remove(id: number) {
		const pipeline = await this.pipelinesRepository.findOne({ where: { id } });
		if (!pipeline) {
			throw new BadRequestException('That pipeline could not be found');
		}
		await this.pipelinesRepository.update({ id }, { is_deleted: 1 });
		await this.cacheProvider.del('pipelines:all', `pipeline:${id}`);
		return {
			status: 'success',
			message: 'Deleted pipeline successfully!',
		};
	}

	async getPipelineNameFromId(id: number) {
		const cacheKey = `pipeline:${id}`;
		const pipeline = await this.cacheProvider.getOrSet(
			cacheKey,
			24 * 60 * 60,
			async () => {
				const result = await this.pipelinesRepository.findOne({
					where: { id },
				});
				if (!result) {
					throw new BadRequestException('The pipeline could not be found!');
				}
				return result;
			},
		);
		return pipeline.name;
	}
}
