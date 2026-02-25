import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import { Construct } from 'constructs';
import { EnvConfig } from '../../config/types';
import { AsyncStack } from './async-stack';

interface MonitoringStackProps extends cdk.StackProps {
  config: EnvConfig;
  asyncStack: AsyncStack;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
    const { config, asyncStack } = props;

    // ---------------------------------------------------------------
    // SNS Alert Topic
    // ---------------------------------------------------------------
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `vebgenix-alerts-${config.stage}`,
      displayName: `Vebgenix ${config.stage.toUpperCase()} Alerts`,
    });

    // Subscribe engineering team email
    alertTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('alerts@vebgenix.com')
    );

    // ---------------------------------------------------------------
    // Helper: create an alarm and wire it to SNS
    // ---------------------------------------------------------------
    const alarm = (
      id: string,
      metric: cloudwatch.Metric,
      threshold: number,
      description: string,
      comparisonOperator = cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    ) => {
      const a = new cloudwatch.Alarm(this, id, {
        alarmName: `vebgenix-${config.stage}-${id}`,
        alarmDescription: description,
        metric,
        threshold,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        comparisonOperator,
      });
      a.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
      return a;
    };

    // ---------------------------------------------------------------
    // SQS Alarms: Email queue + Jobs queue age (stalled processing)
    // ---------------------------------------------------------------
    alarm(
      'EmailQueueOldMessage',
      asyncStack.emailQueue.metricApproximateAgeOfOldestMessage({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      600, // 10 minutes
      'Email queue has messages older than 10 minutes — worker may be stalled',
    );

    alarm(
      'JobsQueueOldMessage',
      asyncStack.jobsQueue.metricApproximateAgeOfOldestMessage({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      600,
      'Jobs queue has messages older than 10 minutes — worker may be stalled',
    );

    // ---------------------------------------------------------------
    // Budget Alerts
    // ---------------------------------------------------------------
    new budgets.CfnBudget(this, 'Budget', {
      budget: {
        budgetName: `vebgenix-${config.stage}-budget`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: config.budgetCriticalAmountUsd,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: (config.budgetWarnAmountUsd / config.budgetCriticalAmountUsd) * 100,
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: 'alerts@vebgenix.com' }],
        },
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100, // 100% = critical
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: 'alerts@vebgenix.com' }],
        },
      ],
    });

    // ---------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------
    new cdk.CfnOutput(this, 'AlertTopicArn', { value: alertTopic.topicArn });
  }
}
