import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { EnvConfig } from "../../config/types";

interface DatabaseStackProps extends cdk.StackProps {
  config: EnvConfig;
  vpc: ec2.Vpc;
  sgProxy: ec2.SecurityGroup;
  sgDb: ec2.SecurityGroup;
}

export class DatabaseStack extends cdk.Stack {
  public readonly dbProxyEndpoint: string;
  public readonly dbSecretArn: string;
  public readonly dbName: string = "vebgenix";

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);
    const { config, vpc, sgProxy, sgDb } = props;

    // Import security groups by ID to prevent CDK from mutating the original NetworkStack SG with cross-stack tokens
    const localSgDb = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "LocalSgDb",
      sgDb.securityGroupId,
    );
    const localSgProxy = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "LocalSgProxy",
      sgProxy.securityGroupId,
    );

    // ---------------------------------------------------------------
    // DB Subnet Group — isolated subnets only (no internet route)
    // Use subnetType lookup — avoids cross-stack subnet reference issues
    // ---------------------------------------------------------------
    const subnetGroup = new rds.SubnetGroup(this, "DbSubnetGroup", {
      description: `RDS isolated subnet group for ${config.stage}`,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      removalPolicy:
        config.stage === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // ---------------------------------------------------------------
    // RDS PostgreSQL Instance
    // ---------------------------------------------------------------
    const instance = new rds.DatabaseInstance(this, "RdsInstance", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.of("16.6", "16"),
      }),
      instanceIdentifier: `vebgenix-${config.stage}`,
      instanceType: new ec2.InstanceType(config.dbInstanceClass),
      port: 5432,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      subnetGroup,
      securityGroups: [localSgDb],
      multiAz: config.dbMultiAz,
      databaseName: this.dbName,
      storageEncrypted: config.dbStorageEncrypted,
      storageType: rds.StorageType.GP3,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      backupRetention: cdk.Duration.days(config.dbBackupRetentionDays),
      deletionProtection: config.dbDeletionProtection,
      removalPolicy:
        config.stage === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      publiclyAccessible: false,
      credentials: rds.Credentials.fromGeneratedSecret("vebgenix_master", {
        secretName: `vebgenix/${config.stage}/db-master`,
      }),
    });

    this.dbSecretArn = instance.secret!.secretArn;

    // ---------------------------------------------------------------
    // RDS Proxy — enabled in BOTH dev and prod for connection parity
    // ---------------------------------------------------------------
    const proxy = new rds.DatabaseProxy(this, "RdsProxy", {
      proxyTarget: rds.ProxyTarget.fromInstance(instance),
      secrets: [instance.secret!],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [localSgProxy],
      requireTLS: true,
      idleClientTimeout: cdk.Duration.minutes(10),
      maxConnectionsPercent: 80,
      dbProxyName: `vebgenix-proxy-${config.stage}`,
    });

    this.dbProxyEndpoint = proxy.endpoint;

    // ---------------------------------------------------------------
    // App User Secret — for Prisma non-superuser role
    // SQL CREATE ROLE app_user is executed by migration runner
    // ---------------------------------------------------------------
    new secretsmanager.Secret(this, "AppUserSecret", {
      secretName: `vebgenix/${config.stage}/db-app-credentials`,
      description: "Non-superuser Prisma app credentials",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "app_user" }),
        generateStringKey: "password",
        excludeCharacters: '"@/\\',
      },
    });

    new cdk.CfnOutput(this, "ProxyEndpoint", { value: proxy.endpoint });
    new cdk.CfnOutput(this, "DbSecretArn", { value: this.dbSecretArn });
    new cdk.CfnOutput(this, "DbName", { value: this.dbName });
  }
}
