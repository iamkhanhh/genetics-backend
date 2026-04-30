import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateUserDto } from './dto/create-user.dto';
import { ContactDto } from './dto/contact.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAuthDto } from '@/auth/dto/create-auth.dto';
import { v4 as uuidv4 } from 'uuid';
import * as dayjs from 'dayjs';
import { MailerService } from '@nestjs-modules/mailer';
import { Users } from '@/entities';
import { Like, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UserRole, UserStatus } from '@/enums';
import { HashingPasswordProvider } from '@/common/providers/hashing-password.provider';
import { FilterUsersDto } from './dto/filter-users.dto';
import { PaginationProvider } from '@/common/providers/pagination.provider';
import { DeleteMultipleUsersDto } from './dto/delete-multiple-users.dto';
import { UpdateAccountDto } from '../account/dto/update-account.dto';

@Injectable()
export class UsersService {
	constructor(
		@InjectRepository(Users) private usersRepository: Repository<Users>,
		private readonly mailerService: MailerService,
		private readonly configService: ConfigService,
		private readonly hashingPasswordProvider: HashingPasswordProvider,
		private readonly paginationProvider: PaginationProvider,
	) {}

	async create(createUserDto: CreateUserDto, user_id: number) {
		const isEmailExist = await this.isEMailExist(createUserDto.email);
		if (isEmailExist) {
			throw new BadRequestException(
				`${createUserDto.email} has been existed! Please use another email`,
			);
		}

		const hashPassword = await this.hashingPasswordProvider.hashPasswordHelper(
			createUserDto.password,
		);

		const newUser = new Users();
		newUser.email = createUserDto.email;
		newUser.password = hashPassword;
		newUser.first_name = createUserDto.first_name;
		newUser.last_name = createUserDto.last_name;
		newUser.phone_number = createUserDto.phone_number;
		newUser.role = Users.getUserRoleNumber(createUserDto.role);
		newUser.status = Users.getUserStatusNumber(createUserDto.status);
		newUser.user_created = user_id;
		await this.usersRepository.save(newUser);

		return {
			status: 'success',
			messsage: 'Create user successfully',
		};
	}

	async isEMailExist(email: string) {
		const user = await this.usersRepository.exists({ where: { email: email } });
		return user ? true : false;
	}

	async findAll(
		page: number,
		pageSize: number,
		filterUsersDto: FilterUsersDto,
	) {
		const filters: any = {};

		if (filterUsersDto.searchTerm != '') {
			// let searchTerm = `%${filterUsersDto.searchTerm}%`;
			// let orTerm = [
			//   { first_name: Like(searchTerm) },
			//   { last_name: Like(searchTerm) },
			//   { email: Like(searchTerm) }
			// ];
			// filters = {...orTerm};
			filters.email = Like(`%${filterUsersDto.searchTerm}%`);
		}

		if (filterUsersDto.role != '') {
			filters.role = Users.getUserRoleNumber(filterUsersDto.role);
		}

		if (filterUsersDto.status != '') {
			filters.status = Users.getUserStatusNumber(filterUsersDto.status);
		}

		const results = await this.paginationProvider.paginate<Users>(
			page,
			pageSize,
			this.usersRepository,
			filters,
		);

		const data = await Promise.all(
			results.data.map(async (user) => {
				const formatted_date = dayjs(user.createdAt).format('DD/MM/YYYY');
				return {
					id: user.id,
					name: `${user.first_name} ${user.last_name}`,
					email: user.email,
					role: Users.getUserRole(user.role),
					status: Users.getUserStatus(user.status),
					createdAt: formatted_date,
				};
			}),
		);

		return {
			...results,
			data,
			message: 'List all users successfully!',
		};
	}

	async findOne(id: number) {
		const results = await this.usersRepository.findOne({ where: { id } });
		return {
			...results,
			role: Users.getUserRole(results.role),
			status: Users.getUserStatus(results.status),
		};
	}

	async findByEmail(email: string) {
		return await this.usersRepository.findOne({ where: { email } });
	}

	async update(updateUserDto: UpdateUserDto) {
		const data = {
			...updateUserDto,
			role: Users.getUserRoleNumber(updateUserDto.role),
			status: Users.getUserStatusNumber(updateUserDto.status),
		};
		if (data.password) {
			data.password = await this.hashingPasswordProvider.hashPasswordHelper(
				data.password,
			);
		} else {
			delete data.password;
		}
		await this.usersRepository.update({ email: data.email }, { ...data });
		return {
			status: 'success',
			message: 'Update user successfully',
		};
	}

	async updatePassword(user_id: number, password: string) {
		const user = await this.usersRepository.findOne({ where: { id: user_id } });
		if (!user) {
			throw new BadRequestException('This account is not exist!');
		}

		const hashPassword =
			await this.hashingPasswordProvider.hashPasswordHelper(password);
		return await this.usersRepository.update(
			{ id: user_id },
			{ password: hashPassword },
		);
	}

	async remove(id: number) {
		await this.usersRepository.update({ id }, { status: UserStatus.DELETED });
		return {
			status: 'success',
			message: 'Delete user successfully',
		};
	}

	async removeMultipleUsers(deleteMultipleUsersDto: DeleteMultipleUsersDto) {
		for (const id of deleteMultipleUsersDto.ids) {
			await this.remove(id);
		}
		return {
			status: 'success',
			message: 'Delete users successfully',
		};
	}

	async register(createAuthDto: CreateAuthDto) {
		const {
			email,
			password,
			first_name,
			last_name,
			phone_number,
			address,
			institution,
		} = createAuthDto;

		const isEmailExist = await this.isEMailExist(email);
		if (isEmailExist) {
			throw new BadRequestException(
				`${email} has been existed! Please use another email!`,
			);
		}

		const hashPassword =
			await this.hashingPasswordProvider.hashPasswordHelper(password);
		const codeId = uuidv4();
		const newUser = new Users();
		newUser.email = email;
		newUser.password = hashPassword;
		newUser.first_name = first_name;
		newUser.last_name = last_name;
		newUser.address = address;
		newUser.institution = institution;
		newUser.phone_number = phone_number;
		newUser.role = UserRole.USER;
		newUser.status = UserStatus.PENDING;
		newUser.codeId = codeId;
		newUser.codeExpired = dayjs().add(30, 'minutes').toDate();
		const savedUser = await this.usersRepository.save(newUser);

		try {
			await this.mailerService.sendMail({
				to: savedUser.email,
				subject: 'Activate your account',
				template: 'register',
				context: {
					name:
						savedUser.first_name && savedUser.last_name
							? `${savedUser.first_name} ${savedUser.last_name}`
							: savedUser.email,
					activationCode: codeId,
				},
			});
		} catch (error) {
			throw new BadRequestException(
				'Failed to send activation email. Please try again later.',
			);
		}

		return {
			status: 'success',
			message: 'Created an account successfully!',
			data: {
				id: savedUser.id,
			},
		};
	}

	async activateAccount(code: string, id: number) {
		const user = await this.usersRepository.findOne({ where: { id } });
		if (!user) {
			throw new BadRequestException('This account is not exist!');
		}

		const isCodeValid = new Date() < user.codeExpired;
		if (isCodeValid) {
			if (code == user.codeId) {
				await this.usersRepository.update(
					{ id },
					{ status: UserStatus.ACTIVE },
				);
				return {
					status: 'success',
					message: 'Your account has been active!!',
				};
			} else {
				throw new BadRequestException('Code active is not correct!');
			}
		} else {
			throw new BadRequestException(
				'Code active has been expired! Please get another code!',
			);
		}
	}

	async updateAccount(id: number, updateAccountDto: UpdateAccountDto) {
		await this.usersRepository.update({ id }, { ...updateAccountDto });
		return {
			status: 'success',
			message: 'Update successfully',
		};
	}

	async sendContactEmail(dto: ContactDto): Promise<void> {
		const adminEmail = this.configService.get<string>('MAIL_USER');
		await this.mailerService.sendMail({
			to: adminEmail,
			subject: `[Contact] ${dto.interestedIn} - ${dto.name}`,
			template: 'contact',
			context: {
				name: dto.name,
				email: dto.email,
				phone: dto.phone || 'N/A',
				interestedIn: dto.interestedIn,
				message: dto.message,
			},
		});
	}

	async forgotPassword(email: string) {
		const isEmailExist = await this.isEMailExist(email);
		if (!isEmailExist) {
			throw new BadRequestException(
				`${email} has not been existed! Please use another email!`,
			);
		}

		const user = await this.usersRepository.findOne({ where: { email } });
		if (!user) {
			throw new BadRequestException('This account is not exist!');
		}

		const codeId = uuidv4();
		const hashPassword =
			await this.hashingPasswordProvider.hashPasswordHelper(codeId);
		await this.usersRepository.update(
			{ id: user.id },
			{ password: hashPassword },
		);

		try {
			await this.mailerService.sendMail({
				to: user.email,
				subject: 'Temp password',
				template: 'forgot-password',
				context: {
					name:
						user.first_name && user.last_name
							? `${user.first_name} ${user.last_name}`
							: user.email,
					tempPassword: codeId,
				},
			});
		} catch (error) {
			throw new BadRequestException(
				'Failed to send reset password email. Please try again later.',
			);
		}
		return {
			status: 'success',
			message: 'Your temp password will be send to your email!',
		};
	}
}
