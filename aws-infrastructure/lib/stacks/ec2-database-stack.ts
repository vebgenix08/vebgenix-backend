import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { EnvConfig } from "../../config/types";

interface Ec2DatabaseStackProps extends cdk.StackProps {
  config: EnvConfig;
  vpc: ec2.Vpc;
  sgDb: ec2.SecurityGroup;
  documentsBucket: s3.IBucket;
}

export class Ec2DatabaseStack extends cdk.Stack {
  public readonly instance: ec2.Instance;
  public readonly dbSecret: secretsmanager.Secret;
  public readonly privateIp: string;
  public readonly dbName = "vebgenix";

  constructor(scope: Construct, id: string, props: Ec2DatabaseStackProps) {
    super(scope, id, props);
    const { config, vpc, sgDb, documentsBucket } = props;

    this.dbSecret = new secretsmanager.Secret(this, "Ec2DbSecret", {
      secretName: `vebgenix/${config.stage}/ec2-postgres`,
      description: `EC2 PostgreSQL credentials for ${config.stage}`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: "vebgenix_app",
          dbname: this.dbName,
        }),
        generateStringKey: "password",
        excludeCharacters: "\"@/\\:%?&=#",
      },
    });

    const role = new iam.Role(this, "DbInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore",
        ),
      ],
    });

    this.dbSecret.grantRead(role);
    documentsBucket.grantRead(role);

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "set -euxo pipefail",
      "mkdir -p /var/lib/vebgenix-postgres",
      "chmod 700 /var/lib/vebgenix-postgres",
    );

    const dbSubnet = config.ec2DbSubnetId
      ? ec2.Subnet.fromSubnetAttributes(this, "DbHostSubnet", {
          subnetId: config.ec2DbSubnetId,
          availabilityZone: config.ec2DbSubnetAz ?? cdk.Stack.of(this).availabilityZones[0],
          routeTableId: config.ec2DbSubnetRouteTableId,
        })
      : undefined;

    this.instance = new ec2.Instance(this, "DbInstance", {
      vpc,
      vpcSubnets: dbSubnet
        ? { subnets: [dbSubnet] }
        : { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: sgDb,
      instanceType: new ec2.InstanceType(config.ec2DbInstanceClass),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      role,
      userData,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(config.ec2DbVolumeSizeGb, {
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      requireImdsv2: true,
    });

    this.privateIp = this.instance.instancePrivateIp;

    new ssm.StringParameter(this, "DbHostParam", {
      parameterName: `/vebgenix/${config.stage}/rest/DB_HOST`,
      stringValue: this.privateIp,
    });
    new ssm.StringParameter(this, "DbNameParam", {
      parameterName: `/vebgenix/${config.stage}/rest/DB_NAME`,
      stringValue: this.dbName,
    });
    new ssm.StringParameter(this, "DbSecretArnParam", {
      parameterName: `/vebgenix/${config.stage}/rest/DB_SECRET_ARN`,
      stringValue: this.dbSecret.secretArn,
    });

    new cdk.CfnOutput(this, "InstanceId", { value: this.instance.instanceId });
    new cdk.CfnOutput(this, "PrivateIp", { value: this.privateIp });
    new cdk.CfnOutput(this, "DbSecretArn", { value: this.dbSecret.secretArn });
  }
}
