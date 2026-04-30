import {
	Controller,
	Get,
	Post,
	Body,
	Patch,
	Param,
	Delete,
	Query,
	ParseIntPipe,
	DefaultValuePipe,
	Request,
	HttpCode,
} from '@nestjs/common';
import { Public } from '@/decorators/public.decorator';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiParam,
	ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { ContactDto } from './dto/contact.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FilterUsersDto } from './dto/filter-users.dto';
import { DeleteMultipleUsersDto } from './dto/delete-multiple-users.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Public()
	@Post('contact')
	@HttpCode(200)
	@ApiOperation({ summary: 'Send contact message to admin' })
	@ApiResponse({ status: 200, description: 'Message sent successfully' })
	async contact(@Body() dto: ContactDto) {
		await this.usersService.sendContactEmail(dto);
		return { message: 'Your message has been sent successfully.' };
	}

	@Post()
	@ApiOperation({ summary: 'Create a new user' })
	@ApiResponse({ status: 201, description: 'User created successfully' })
	@ApiResponse({ status: 400, description: 'Bad request' })
	create(@Body() createUserDto: CreateUserDto, @Request() req) {
		return this.usersService.create(createUserDto, req.user.id);
	}

	@Post('load-users')
	@ApiOperation({ summary: 'Get all users with pagination and filters' })
	@ApiQuery({ name: 'page', example: 1, description: 'Page number' })
	@ApiQuery({
		name: 'pageSize',
		example: 10,
		description: 'Number of items per page',
	})
	@ApiResponse({ status: 200, description: 'Users retrieved successfully' })
	findAll(
		@Query('page', ParseIntPipe, new DefaultValuePipe(1)) page: number,
		@Query('pageSize', ParseIntPipe, new DefaultValuePipe(10)) pageSize: number,
		@Body() filterUsersDto: FilterUsersDto,
	) {
		return this.usersService.findAll(page, pageSize, filterUsersDto);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a user by ID' })
	@ApiParam({ name: 'id', example: 1, description: 'User ID' })
	@ApiResponse({ status: 200, description: 'User retrieved successfully' })
	@ApiResponse({ status: 404, description: 'User not found' })
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.usersService.findOne(id);
	}

	@Patch()
	@ApiOperation({ summary: 'Update a user' })
	@ApiResponse({ status: 200, description: 'User updated successfully' })
	@ApiResponse({ status: 400, description: 'Bad request' })
	update(@Body() updateUserDto: UpdateUserDto) {
		return this.usersService.update(updateUserDto);
	}

	@Delete('multiple-user')
	@ApiOperation({ summary: 'Delete multiple users' })
	@ApiResponse({ status: 200, description: 'Users deleted successfully' })
	removeMultipleUsers(@Body() deleteMultipleUsersDto: DeleteMultipleUsersDto) {
		return this.usersService.removeMultipleUsers(deleteMultipleUsersDto);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a user by ID' })
	@ApiParam({ name: 'id', example: 1, description: 'User ID' })
	@ApiResponse({ status: 200, description: 'User deleted successfully' })
	@ApiResponse({ status: 404, description: 'User not found' })
	remove(@Param('id', ParseIntPipe) id: number) {
		return this.usersService.remove(id);
	}
}
