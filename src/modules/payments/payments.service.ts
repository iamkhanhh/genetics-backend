import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { SubscriptionPlan } from '@/entities/subscription-plan.entity';
import { PaymentOrder } from '@/entities/payment-order.entity';
import { Repository } from 'typeorm';
import { UserSubscription } from '@/entities/user-subscription.entity';
import { UsageLimitService } from '@/common/services/usage-limit.service';
import { ConfigService } from '@nestjs/config';
import { PayOS, Webhook, WebhookData } from '@payos/node';
import { PaymentStatus } from '@/enums/payment.enum';
import { Users } from '@/entities/users.entity';
import { Subject, takeUntil, timer } from 'rxjs';

@Injectable()
export class PaymentsService {
	private payos: PayOS;
	private sseSubjects = new Map<number, Subject<MessageEvent>>();

	constructor(
		@InjectRepository(PaymentOrder) private orderRepo: Repository<PaymentOrder>,
		@InjectRepository(SubscriptionPlan)
		private planRepo: Repository<SubscriptionPlan>,
		@InjectRepository(UserSubscription)
		private subscriptionRepo: Repository<UserSubscription>,
		private usageLimitService: UsageLimitService,
		private configService: ConfigService,
	) {
		this.payos = new PayOS({
			clientId: this.configService.get('PAYOS_CLIENT_ID'),
			apiKey: this.configService.get('PAYOS_API_KEY'),
			checksumKey: this.configService.get('PAYOS_CHECKSUM_KEY'),
		});
	}

	createSseStream(orderCode: number) {
		if (this.sseSubjects.has(orderCode)) {
			this.sseSubjects.get(orderCode).complete();
			this.sseSubjects.delete(orderCode);
		}
		const subject = new Subject<MessageEvent>();
		this.sseSubjects.set(orderCode, subject);
		return subject.asObservable().pipe(takeUntil(timer(10 * 60 * 1000)));
	}

	private notifySse(orderCode: number, status: string) {
		const subject = this.sseSubjects.get(orderCode);
		if (!subject) {
			return;
		}
		subject.next({ data: { status } } as MessageEvent);
		subject.complete();
		this.sseSubjects.delete(orderCode);
	}

	async create(userId: number, createPaymentDto: CreatePaymentDto) {
		const plan = await this.planRepo.findOne({
			where: { id: createPaymentDto.planId },
		});
		if (!plan) throw new NotFoundException('Plan not found');

		const orderCode = Date.now() * 1000 + Math.floor(Math.random() * 1000);
		const paymentData = {
			orderCode: orderCode,
			amount: plan.price,
			description: `${plan.name} 1 month`,
			returnUrl: `${this.configService.get(`ALLOWED_ORIGINS`)}/payments/result`,
			cancelUrl: `${this.configService.get(`ALLOWED_ORIGINS`)}/payments/cancel`,
		};
		const paymentLink = await this.payos.paymentRequests.create(paymentData);
		const order = this.orderRepo.create({
			orderCode,
			user: { id: userId } as Users,
			plan,
			amount: plan.price,
			description: paymentData.description,
			status: PaymentStatus.PENDING,
			checkoutUrl: paymentLink.checkoutUrl,
			paymentLinkId: paymentLink.paymentLinkId,
		});
		await this.orderRepo.save(order);
		return {
			checkoutUrl: paymentLink.checkoutUrl,
			qrCode: paymentLink.qrCode,
			orderCode,
		};
	}

	async handleWebhook(webhookBody: Webhook) {
		let webhookData: WebhookData;
		try {
			webhookData = await this.payos.webhooks.verify(webhookBody);
		} catch {
			return { received: true };
		}

		const { orderCode, code } = webhookData;
		const order = await this.orderRepo.findOne({
			where: { orderCode },
			relations: ['user', 'plan'],
		});
		if (!order) return { received: true };

		if (code === '00' && order.status !== PaymentStatus.PAID) {
			order.status = PaymentStatus.PAID;
			order.paidAt = new Date();
			await this.orderRepo.save(order);
			await this.activateSubscription(order);
			await this.usageLimitService.invalidatePlanCache(order.user.id);
			this.notifySse(+order.orderCode, 'PAID');
		} else if (code !== '00' && order.status === PaymentStatus.PENDING) {
			order.status = PaymentStatus.CANCELLED;
			this.notifySse(+order.orderCode, 'CANCELLED');
			await this.orderRepo.save(order);
		}

		return { received: true };
	}

	private async activateSubscription(order: PaymentOrder) {
		const now = new Date();

		let subscription = await this.subscriptionRepo.findOne({
			where: { user: { id: order.user.id }, isActive: true },
			relations: ['plan'],
		});

		if (subscription) {
			const isSamePlan = subscription.plan.id === order.plan.id;
			if (isSamePlan) {
				const base = subscription.endDate > now ? subscription.endDate : now;
				const newEnd = new Date(base);
				newEnd.setDate(newEnd.getDate() + order.plan.duration);
				subscription.endDate = newEnd;
			} else {
				const newEnd = new Date(now);
				newEnd.setDate(newEnd.getDate() + order.plan.duration);
				subscription.plan = order.plan;
				subscription.startDate = now;
				subscription.endDate = newEnd;
			}
			subscription.order = order;
			subscription.isActive = true;
		} else {
			const endDate = new Date(now);
			endDate.setDate(endDate.getDate() + order.plan.duration);
			subscription = this.subscriptionRepo.create({
				user: order.user,
				plan: order.plan,
				order,
				startDate: now,
				endDate,
				isActive: true,
			});
		}

		await this.subscriptionRepo.save(subscription);
	}

	async getOrderStatus(orderCode: number) {
		const order = await this.orderRepo.findOne({
			where: { orderCode },
			relations: ['plan'],
		});
		if (!order) throw new NotFoundException('Order not found');
		return {
			status: 'success',
			message: 'Get OrderStatus success',
			data: order,
		};
	}

	async getUserSubscription(userId: number) {
		const data = await this.subscriptionRepo.findOne({
			where: { user: { id: userId }, isActive: true },
			relations: ['plan'],
		});
		return {
			status: 'success',
			message: 'Get UserSubscription success',
			data: data,
		};
	}

	async getAllPlans() {
		const data = await this.planRepo.find({
			where: { isActive: true },
			order: { price: 'ASC' },
		});
		return {
			status: 'success',
			message: 'Get All Plans success',
			data: data,
		};
	}

	async getAllPaymentMethods(userId: number) {
		const data = await this.orderRepo.find({
			where: { user: { id: userId } },
			order: { createdAt: 'DESC' },
		});
		return {
			status: 'success',
			message: 'Get All Payment Methods success',
			data: data,
		};
	}

	async update(userId: number, orderCode: number, status: PaymentStatus) {
		const order = await this.orderRepo.findOne({
			where: { orderCode, user: { id: userId } },
			relations: ['user', 'plan'],
		});
		if (!order) throw new NotFoundException('Order not found');

		order.status = status;
		await this.orderRepo.save(order);
		this.notifySse(order.orderCode, status);
	}
}
