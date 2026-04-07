import { UsageLimitService } from '@/common/services/usage-limit.service';
import {
	PlanFeature,
	REQUIRES_FEATURE_KEY,
} from '@/decorators/requires-plan-feature.decorator';
import {
	TRACK_USAGE_KEY,
	UsageAction,
} from '@/decorators/track-daily-usage.decorator';
import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	HttpException,
	HttpStatus,
	Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class UsageLimitGuard implements CanActivate {
	constructor(
		private reflector: Reflector,
		private usageLimitService: UsageLimitService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();
		const userId: number = request.user?.id;
		if (!userId) return true;
		if (request.user?.role === 'Admin') return true;

		const requiredFeature = this.reflector.getAllAndOverride<PlanFeature>(
			REQUIRES_FEATURE_KEY,
			[context.getHandler(), context.getClass()],
		);
		if (requiredFeature) {
			const planlimits = await this.usageLimitService.getUserPlanLimits(userId);
			const allowed =
				requiredFeature === 'qc'
					? (await planlimits).data.canUseQC
					: requiredFeature === 'report'
						? (await planlimits).data.canUseReport
						: true;
			if (!allowed) {
				throw new ForbiddenException(
					`Your current plan does not include this feature. Please upgrade to Standard or Premium.`,
				);
			}
		}

		const action = this.reflector.get<UsageAction>(
			TRACK_USAGE_KEY,
			context.getHandler(),
		);
		if (action) {
			const allowed = await this.usageLimitService.canPerformAction(
				userId,
				action,
			);
			if (!allowed) {
				const planlimits = this.usageLimitService.getUserPlanLimits(userId);
				const limits =
					action === 'upload'
						? (await planlimits).data.dailyUploadLimit
						: (await planlimits).data.dailyAnalysisLimit;
				throw new HttpException(
					`Daily ${action} limit of ${limits} reached. Upgrade your plan for more.`,
					HttpStatus.TOO_MANY_REQUESTS,
				);
			}
			await this.usageLimitService.incrementDailyUsage(userId, action);
		}

		return true;
	}
}
