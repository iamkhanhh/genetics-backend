import {
	Controller,
	Post,
	UseGuards,
	Request,
	Get,
	Body,
	Param,
	Res,
	ParseIntPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiParam,
	ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './passport/local-auth.guard';
import { Public } from '@/decorators';
import { CreateAuthDto } from './dto/create-auth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { Response } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Public()
	@Throttle({ default: { ttl: 60000, limit: 5 } })
	@Post('login')
	@UseGuards(LocalAuthGuard)
	@ApiOperation({ summary: 'Login with email and password' })
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				email: { type: 'string', example: 'user@example.com' },
				password: { type: 'string', example: 'Pass@123' },
			},
			required: ['email', 'password'],
		},
	})
	@ApiResponse({ status: 200, description: 'Logged in successfully' })
	@ApiResponse({ status: 401, description: 'Invalid credentials' })
	async signIn(@Res({ passthrough: true }) res: Response, @Request() req) {
		const { access_token } = await this.authService.login(req.user);
		res.cookie('access_token', access_token, {
			maxAge: 365 * 24 * 60 * 60 * 100,
			sameSite: 'strict',
			httpOnly: true,
		});
		return {
			status: 'success',
			message: 'Logged in successfully !',
		};
	}

	@Public()
	@Throttle({ default: { ttl: 60000, limit: 5 } })
	@Post('register')
	@ApiOperation({ summary: 'Register a new account' })
	@ApiResponse({ status: 201, description: 'Account registered successfully' })
	@ApiResponse({ status: 400, description: 'Bad request' })
	register(@Body() createAuthDto: CreateAuthDto) {
		return this.authService.register(createAuthDto);
	}

	@Public()
	@Post('google-authentication')
	@ApiOperation({ summary: 'Authenticate with Google' })
	@ApiResponse({ status: 200, description: 'Google authentication successful' })
	googleAuthentication(@Body() body: any) {
		console.log(body);
		return true;
	}

	@Public()
	@Post('activate-account/:id')
	@ApiOperation({ summary: 'Activate a user account' })
	@ApiParam({ name: 'id', example: 1, description: 'User ID' })
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				token: { type: 'string', example: 'activation-token-here' },
			},
		},
	})
	@ApiResponse({ status: 200, description: 'Account activated successfully' })
	@ApiResponse({ status: 404, description: 'User not found' })
	activateAccount(
		@Body() activateDto: any,
		@Param('id', ParseIntPipe) id: number,
	) {
		return this.authService.activateAccount(activateDto, id);
	}

	@Public()
	@Throttle({ default: { ttl: 60000, limit: 5 } })
	@Post('forgot-password')
	@ApiOperation({ summary: 'Request password reset' })
	@ApiBody({
		schema: {
			type: 'object',
			properties: { email: { type: 'string', example: 'user@example.com' } },
			required: ['email'],
		},
	})
	@ApiResponse({ status: 200, description: 'Password reset email sent' })
	forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
		return this.authService.forgotPassword(forgotPasswordDto.email);
	}

	@Get('me')
	@ApiOperation({ summary: 'Get current user profile' })
	@ApiResponse({ status: 200, description: 'Current user profile retrieved' })
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	getProfile(@Request() req) {
		return {
			status: 'success',
			data: req.user,
		};
	}

	@Post('logout')
	@ApiOperation({ summary: 'Logout and clear session' })
	@ApiResponse({ status: 200, description: 'Logged out successfully' })
	logout(@Res() res) {
		res.clearCookie('access_token', {
			maxAge: 365 * 24 * 60 * 60 * 100,
			sameSite: 'strict',
			httpOnly: true,
		});
		return res.json({ status: 'success', message: 'Logged out successfully!' });
	}
}
