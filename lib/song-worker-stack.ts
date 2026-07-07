import * as path from 'node:path';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';

const AI_PROVIDER_PARAM = '/song-worker/ai-provider';
const OPENAI_KEY_PARAM = '/song-worker/openai-api-key';
const ANTHROPIC_KEY_PARAM = '/song-worker/anthropic-api-key';
const COMIC_DEADLINE_PARAM = '/song-worker/comic-deadline-ms';

export class SongWorkerStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'RunsTable', {
      partitionKey: { name: 'runId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const deadLetterQueue = new sqs.Queue(this, 'JobsDlq', {
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });

    const queue = new sqs.Queue(this, 'JobsQueue', {
      visibilityTimeout: Duration.minutes(6),
      retentionPeriod: Duration.days(4),
      enforceSSL: true,
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 3 },
    });

    const comicsBucket = new s3.Bucket(this, 'ComicsBucket', {
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(30) }],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    comicsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [comicsBucket.arnForObjects('comics/*')],
        principals: [new iam.AnyPrincipal()],
      }),
    );

    const aiProviderParam = new ssm.StringParameter(this, 'AiProviderParam', {
      parameterName: AI_PROVIDER_PARAM,
      stringValue: 'stub',
      description: 'song-worker AI provider: stub | openai | anthropic',
    });

    new ssm.StringParameter(this, 'ComicDeadlineParam', {
      parameterName: COMIC_DEADLINE_PARAM,
      stringValue: '13500',
      description: 'song-worker comic generation deadline in ms (3000-45000)',
    });

    const receiver = new NodejsFunction(this, 'ReceiverFn', {
      entry: path.join(__dirname, '..', 'src', 'receiver', 'handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
      logGroup: new logs.LogGroup(this, 'ReceiverLogs', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        TABLE_NAME: table.tableName,
        QUEUE_URL: queue.queueUrl,
      },
    });
    table.grantWriteData(receiver);
    queue.grantSendMessages(receiver);

    const functionUrl = receiver.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    const worker = new NodejsFunction(this, 'WorkerFn', {
      entry: path.join(__dirname, '..', 'src', 'worker', 'handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 1024,
      timeout: Duration.seconds(55),
      logGroup: new logs.LogGroup(this, 'WorkerLogs', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        TABLE_NAME: table.tableName,
        COMICS_BUCKET: comicsBucket.bucketName,
        AI_PROVIDER_PARAM,
        OPENAI_KEY_PARAM,
        ANTHROPIC_KEY_PARAM,
        COMIC_DEADLINE_PARAM,
      },
    });
    table.grantReadWriteData(worker);
    comicsBucket.grantPut(worker, 'comics/*');
    worker.addEventSource(
      new SqsEventSource(queue, { batchSize: 1, reportBatchItemFailures: true }),
    );
    worker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          aiProviderParam.parameterArn,
          Stack.of(this).formatArn({
            service: 'ssm',
            resource: 'parameter',
            resourceName: 'song-worker/*',
          }),
        ],
      }),
    );

    new CfnOutput(this, 'CallbackUrl', {
      value: functionUrl.url,
      description: 'Public HTTPS callback URL to register in the coordinator UI',
    });
    new CfnOutput(this, 'QueueUrlOutput', { value: queue.queueUrl });
    new CfnOutput(this, 'TableNameOutput', { value: table.tableName });
    new CfnOutput(this, 'ComicsBucketOutput', { value: comicsBucket.bucketName });
  }
}
