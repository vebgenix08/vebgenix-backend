import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvConfig } from '../../config/types';

/**
 * NetworkStack: VPC + Subnets + VPC Endpoints + Security Groups + Secrets
 *
 * Exports VPC ID and SG IDs via SSM Parameters so other stacks
 * can consume them via lookup (no cross-stack CDK token cycles).
 */
interface NetworkStackProps extends cdk.StackProps {
  config: EnvConfig;
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly sgLambda: ec2.SecurityGroup;
  public readonly sgApp: ec2.SecurityGroup;
  public readonly sgProxy: ec2.SecurityGroup;
  public readonly sgDb: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
    const { config } = props;

    // ---------------------------------------------------------------
    // VPC — preserve existing private/isolated CIDRs and append public subnets
    // for EC2 hosts. Reordering these groups would force subnet replacement.
    // ---------------------------------------------------------------
    const subnetConfig: ec2.SubnetConfiguration[] = [
      { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 28 },
      { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
    ];

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: config.enableNat ? 1 : 0,
      subnetConfiguration: subnetConfig,
    });

    // ---------------------------------------------------------------
    // VPC Endpoints — avoid NAT for proven AWS service traffic
    // ---------------------------------------------------------------
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });
    this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });
    this.vpc.addInterfaceEndpoint('SsmEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });
    this.vpc.addInterfaceEndpoint('SsmMessagesEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });
    this.vpc.addInterfaceEndpoint('EventsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.EVENTBRIDGE,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });
    this.vpc.addInterfaceEndpoint('CognitoIdpEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.COGNITO_IDP,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // ---------------------------------------------------------------
    // Security Groups — least privilege: Lambda -> Proxy -> DB
    // ---------------------------------------------------------------
    this.sgDb = new ec2.SecurityGroup(this, 'SgDb', {
      vpc: this.vpc,
      description: 'RDS PostgreSQL - ingress from RDS Proxy only',
      allowAllOutbound: false,
    });
    this.sgApp = new ec2.SecurityGroup(this, 'SgApp', {
      vpc: this.vpc,
      description: 'REST API EC2 runtime host',
      allowAllOutbound: true,
    });
    this.sgProxy = new ec2.SecurityGroup(this, 'SgProxy', {
      vpc: this.vpc,
      description: 'RDS Proxy - ingress from Lambda SG only',
      allowAllOutbound: false,
    });
    this.sgLambda = new ec2.SecurityGroup(this, 'SgLambda', {
      vpc: this.vpc,
      description: 'Lambda resolvers and workers',
      allowAllOutbound: false,
    });

    // Ingress/Egress rules
    this.sgApp.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Public HTTP to REST origin');
    this.sgDb.addIngressRule(this.sgApp, ec2.Port.tcp(5432), 'REST app to DB');
    this.sgApp.addEgressRule(this.sgDb, ec2.Port.tcp(5432), 'REST egress to DB');
    this.sgProxy.addIngressRule(this.sgLambda, ec2.Port.tcp(5432), 'Lambda to Proxy');
    this.sgDb.addIngressRule(this.sgProxy, ec2.Port.tcp(5432), 'Proxy to DB');
    this.sgLambda.addEgressRule(this.sgProxy, ec2.Port.tcp(5432), 'Lambda egress to Proxy');
    this.sgProxy.addEgressRule(this.sgDb, ec2.Port.tcp(5432), 'Proxy egress to DB');
    // Proxy needs to reach Secrets Manager (443) to fetch credentials
    this.sgProxy.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Proxy HTTPS to Secrets Manager');
    this.sgLambda.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS to VPC endpoints');

    // ---------------------------------------------------------------
    // Export IDs to SSM — consumed by DatabaseStack without CDK token refs
    // ---------------------------------------------------------------
    new ssm.StringParameter(this, 'VpcIdParam', {
      parameterName: `/vebgenix/${config.stage}/vpc-id`,
      stringValue: this.vpc.vpcId,
    });
    new ssm.StringParameter(this, 'SgLambdaIdParam', {
      parameterName: `/vebgenix/${config.stage}/sg-lambda-id`,
      stringValue: this.sgLambda.securityGroupId,
    });
    new ssm.StringParameter(this, 'SgAppIdParam', {
      parameterName: `/vebgenix/${config.stage}/sg-app-id`,
      stringValue: this.sgApp.securityGroupId,
    });
    new ssm.StringParameter(this, 'SgProxyIdParam', {
      parameterName: `/vebgenix/${config.stage}/sg-proxy-id`,
      stringValue: this.sgProxy.securityGroupId,
    });
    new ssm.StringParameter(this, 'SgDbIdParam', {
      parameterName: `/vebgenix/${config.stage}/sg-db-id`,
      stringValue: this.sgDb.securityGroupId,
    });

    new cdk.CfnOutput(this, 'VpcId', { value: this.vpc.vpcId });
    new cdk.CfnOutput(this, 'SgLambdaId', { value: this.sgLambda.securityGroupId });
    new cdk.CfnOutput(this, 'SgAppId', { value: this.sgApp.securityGroupId });
    new cdk.CfnOutput(this, 'SgProxyId', { value: this.sgProxy.securityGroupId });
    new cdk.CfnOutput(this, 'SgDbId', { value: this.sgDb.securityGroupId });
  }
}
