import { ClientConfig, PubSub, v1 } from '@google-cloud/pubsub';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppService } from './app.service';
import { firstValueFrom, timer } from 'rxjs';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const appService = app.get(AppService);
  const logger = new Logger('CloudRunJobTest');

  const apiEndpoint = 'http://localhost:8085';

  const projectId = process.env.APP_PROJECT_ID;
  const subscriptionName = 'cloud-run-job-test-sub';

  const config: ClientConfig = {
    projectId,
  };

  if (process.env.NODE_ENV === 'development') {
    config.apiEndpoint = apiEndpoint;
  }

  const pubsub = new PubSub(config);

  const [topic] = await pubsub
    .topic('cloud-run-job-test-topic')
    .get({ autoCreate: true });
  const [subscription] = await topic
    .subscription(subscriptionName)
    .get({ autoCreate: true });

  const subClient = new v1.SubscriberClient(pubsub.options as any);

  const [response] = await subClient.pull({
    subscription: subscription.name,
    maxMessages: 2,
    returnImmediately: true,
  });

  const ackIds = [];
  const messagesReceived = response.receivedMessages || [];
  const processedAckIdMap = new Map<string, boolean>(
    messagesReceived.map((message) => [message.ackId, false]),
  );

  const jobs = messagesReceived.map((message) => {
    return appService
      .businessLogic(message.message.data)
      .catch((error) => {
        logger.error(`Error processing message: ${error}`);
        logger.error(`Message data: ${message.message.data}`);
      })
      .finally(() => {
        processedAckIdMap.set(message.ackId, true);
        ackIds.push(message.ackId);
      });
  });

  Promise.all(jobs);

  while (true) {
    await firstValueFrom(timer(10000));

    if (ackIds.length !== 0) {
      // Acknowledge all of the messages. You could also acknowledge
      // these individually, but this is more efficient.
      const ackRequest = {
        subscription: subscription.name,
        ackIds: ackIds.splice(0, ackIds.length),
      };

      await subClient.acknowledge(ackRequest);
    }

    const allMessagesProcessed = Array.from(processedAckIdMap.values()).every(
      (isProcessed) => isProcessed,
    );

    if (allMessagesProcessed) {
      logger.log(`All ${messagesReceived.length} messages processed`);
      break;
    } else {
      const newAckDeadlineSeconds = 30;

      // If the message is not yet processed..
      const uprocessedAckIds = Array.from(processedAckIdMap.entries())
        .filter(([, isProcessed]) => !isProcessed)
        .map(([ackId]) => ackId);
      const modifyAckRequest = {
        subscription: subscription.name,
        ackIds: uprocessedAckIds,
        ackDeadlineSeconds: newAckDeadlineSeconds,
      };

      //..reset its ack deadline.
      await subClient.modifyAckDeadline(modifyAckRequest);

      logger.log(
        `Reset ack deadline for "${uprocessedAckIds}" for ${newAckDeadlineSeconds}s.`,
      );
    }
  }

  await app.close();
}
bootstrap();
