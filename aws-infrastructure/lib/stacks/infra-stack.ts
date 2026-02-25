import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { EnvConfig } from '../../config/types';

/**
 * InfraStack: VPC + Security Groups + RDS PostgreSQL + RDS Proxy
 *
 * These resources are co-located in one stack because:
 * - Security groups reference each other (Lambda→Proxy→DB chain)
 * - RDS Proxy is assigned SG from the same stack
 * - Separating them into Network + Database stacks creates CDK cross-stack
 *   CfnExport cycles via the RDS Endpoint.Port token
 */
interface InfraStackProps extends cdk.StackProps {
  config: EnvConfig;
}

export class InfraStack extends cdk.Stack {
  // Network exports
  public readonly vpc: ec2.Vpc;
  public readonly sgLambda: ec2.SecurityGroup;

  // DB exports
  public readonly proxyEndpoint: string;
  public readonly secretArn: string;
  public readonly dbName: string = 'vebgenix';

  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);
    const { config } = props;

    // ---------------------------------------------------------------
    // VPC
    // ---------------------------------------------------------------
    const subnetConfig: ec2.SubnetConfiguration[] = [
      { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 28 },
    ];

    if (config.enableNat) {
      subnetConfig.unshift({ name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 28 });
    }

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: config.enableNat ? 1 : 0,
      subnetConfiguration: subnetConfig,
    });

    // ---------------------------------------------------------------
    // VPC Endpoints — avoid NAT for all AWS service traffic
    // ---------------------------------------------------------------
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    this.vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    this.vpc.addInterfaceEndpoint('StsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.STS,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // ---------------------------------------------------------------
    // Security Groups — least privilege: Lambda → Proxy → DB
    // All in the same stack to avoid cross-stack CfnExport cycles
    // ---------------------------------------------------------------
    const sgDb = new ec2.SecurityGroup(this, 'SgDb', {
      vpc: this.vpc,
      description: 'RDS PostgreSQL - ingress from RDS Proxy only',
      allowAllOutbound: false,
    });

    const sgProxy = new ec2.SecurityGroup(this, 'SgProxy', {
      vpc: this.vpc,
      description: 'RDS Proxy - ingress from Lambda SG only',
      allowAllOutbound: false,
    });

    this.sgLambda = new ec2.SecurityGroup(this, 'SgLambda', {
      vpc: this.vpc,
      description: 'Lambda resolvers and workers',
      allowAllOutbound: false,
    });

    // Ingress rules — use literal 5432 (no dynamic DB port reference = no cycle)
    sgProxy.addIngressRule(this.sgLambda, ec2.Port.tcp(5432), 'Lambda to Proxy');
    sgDb.addIngressRule(sgProxy, ec2.Port.tcp(5432), 'Proxy to DB');

    // Egress rules
    this.sgLambda.addEgressRule(sgProxy, ec2.Port.tcp(5432), 'Lambda egress to Proxy');
    sgProxy.addEgressRule(sgDb, ec2.Port.tcp(5432), 'Proxy egress to DB');
    // Lambda HTTPS to VPC Interface Endpoints (Secrets Manager, CW Logs, STS)
    this.sgLambda.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS to VPC endpoints');

    // ---------------------------------------------------------------
    // RDS PostgreSQL
    // ---------------------------------------------------------------
    const subnetGroup = new rds.SubnetGroup(this, 'DbSubnetGroup', {
      description: `RDS isolated subnetGroup ${config.stage}`,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      removalPolicy: config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const instance = new rds.DatabaseInstance(this, 'RdsInstance', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceIdentifier: `vebgenix-${config.stage}`,
      instanceType: new ec2.InstanceType(config.dbInstanceClass),
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      subnetGroup,
      securityGroups: [sgDb],
      multiAz: config.dbMultiAz,
      databaseName: this.dbName,
      storageEncrypted: config.dbStorageEncrypted,
      storageType: rds.StorageType.GP2,
      allocatedStorage: 20,
      backupRetention: cdk.Duration.days(config.dbBackupRetentionDays),
      deletionProtection: config.dbDeletionProtection,
      removalPolicy: config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      publiclyAccessible: false,
      credentials: rds.Credentials.fromGeneratedSecret('vebgenix_master', {
        secretName: `vebgenix/${config.stage}/db-master-credentials`,
      }),
    });

    this.secretArn = instance.secret!.secretArn;

    // ---------------------------------------------------------------
    // RDS Proxy — enabled in BOTH dev and prod for connection parity
    // ---------------------------------------------------------------
    const proxy = new rds.DatabaseProxy(this, 'RdsProxy', {
      proxyTarget: rds.ProxyTarget.fromInstance(instance),
      secrets: [instance.secret!],
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [sgProxy],
      requireTLS: true,
      idleClientTimeout: cdk.Duration.minutes(10),
      maxConnectionsPercent: 80,
      dbProxyName: `vebgenix-proxy-${config.stage}`,
    });

    this.proxyEndpoint = proxy.endpoint;

    // ---------------------------------------------------------------
    // App user credentials secret (for non-superuser Prisma role)
    // ---------------------------------------------------------------
    new secretsmanager.Secret(this, 'AppUserSecret', {
      secretName: `vebgenix/${config.stage}/db-app-credentials`,
      description: 'Non-superuser Prisma app_user credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'app_user' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\',
      },
    });

    // ---------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------
    new cdk.CfnOutput(this, 'VpcId', { value: this.vpc.vpcId });
    new cdk.CfnOutput(this, 'ProxyEndpoint', { value: proxy.endpoint });
    new cdk.CfnOutput(this, 'SecretArn', { value: this.secretArn });
    new cdk.CfnOutput(this, 'NatEnabled', { value: String(config.enableNat) });
  }
}
