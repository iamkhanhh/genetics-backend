import { BadRequestException, Injectable } from '@nestjs/common';
import { UpdateUploadDto } from './dto/update-upload.dto';
import { Uploads } from '@/entities';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateUploadForSample } from './dto/create-upload-for-sample.dto';
import { UploadStatus } from '@/enums/uploads.enum';

@Injectable()
export class UploadsService {
	constructor(
		@InjectRepository(Uploads) private uploadsRepository: Repository<Uploads>,
	) {}

	async createUploadFastQ(
		createUploadDto: CreateUploadForSample,
		user_id: number,
	) {
		const uploadInfor = {
			original_name: createUploadDto.original_name,
			file_size: createUploadDto.file_size,
			file_type: createUploadDto.file_type,
			user_created: user_id,
			is_deleted: 0,
			upload_status: UploadStatus.UPLOADING,
		};
		const upload = await this.uploadsRepository.save(uploadInfor);
		if (!upload) {
			throw new BadRequestException(
				'There was an error creating the upload information!',
			);
		}
		return {
			status: 'success',
			message: 'Create upload record for fastq sample successfully',
			uploadId: upload.id,
		};
	}

	findAll() {
		return `This action returns all uploads`;
	}

	findOne(id: number) {
		return this.uploadsRepository.findOne({ where: { id } });
	}

	async update(id: number, updateUploadDto: UpdateUploadDto) {
		try {
			await this.uploadsRepository.update({ id: id }, { ...updateUploadDto });
			return {
				status: 'success',
				message: 'Update upload record successfully',
			};
		} catch (error) {
			console.log('err: ', error);
			return {
				status: 'error',
				message: 'Update upload record failed',
			};
		}
	}

	async remove(id: number) {
		try {
			await this.uploadsRepository.update({ id: id }, { is_deleted: 1 });
			return {
				status: 'success',
				message: 'Delete upload record successfully',
			};
		} catch (error) {
			console.log('err: ', error);
			return {
				status: 'error',
				message: 'Delete upload record failed',
			};
		}
	}

	async findUploadsBySampleId(sample_id: number) {
		return await this.uploadsRepository.find({
			where: {
				sample_id,
			},
		});
	}

	async updateSampleId(upload_id: number, sample_id: number) {
		return await this.uploadsRepository.update(
			{ id: upload_id },
			{ sample_id },
		);
	}

	async createUploadForSample(createUploadForSample: CreateUploadForSample) {
		const new_upload = new Uploads();

		new_upload.original_name = createUploadForSample.original_name;
		new_upload.file_size = createUploadForSample.file_size;
		new_upload.file_type = createUploadForSample.file_type;
		new_upload.upload_name = createUploadForSample.upload_name;
		new_upload.user_created = createUploadForSample.user_created;
		new_upload.file_path = createUploadForSample.file_path;
		new_upload.is_deleted = 0;
		new_upload.upload_status = createUploadForSample.upload_status;

		return await this.uploadsRepository.save(new_upload);
	}
}
