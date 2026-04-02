import { forwardRef, Global, Module } from '@nestjs/common';
import { PaginationProvider } from './providers/pagination.provider';
import { HashingPasswordProvider } from './providers/hashing-password.provider';
import { S3Provider } from './providers/s3.provider';
import { MongodbProvider } from './providers/mongodb.provider';
import { SampleImportProvider } from './providers/sample-import.provider';
import { Analysis } from '@/entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonProvider } from './providers/common.provider';
import { AnalysisGateway } from './gateways/analysis.gateway';
import { HttpProvider } from './providers/http.provider';
import { HttpModule } from '@nestjs/axios';
import { UserSubscription } from '@/entities/user-subscription.entity';
import { UsageLimitService } from './services/usage-limit.service';
import { UsageLimitGuard } from '@/auth/passport/usage-limit.guard';
import { RedisModule } from '@/redis/redis.module';
import { ReportModule } from '@/modules/report/report.module';
@Global()
@Module({
	imports: [
		TypeOrmModule.forFeature([Analysis, UserSubscription]),
		HttpModule.register({
			timeout: 5000,
			maxRedirects: 5,
		}),
		RedisModule,
		forwardRef(() => ReportModule),
	],
	providers: [
		PaginationProvider,
		HashingPasswordProvider,
		S3Provider,
		MongodbProvider,
		SampleImportProvider,
		CommonProvider,
		AnalysisGateway,
		HttpProvider,
		UsageLimitService,
		UsageLimitGuard,
	],
	exports: [
		PaginationProvider,
		HashingPasswordProvider,
		S3Provider,
		MongodbProvider,
		CommonProvider,
		AnalysisGateway,
		HttpProvider,
		UsageLimitService,
		UsageLimitGuard,
	],
})
export class CommonModule {}
