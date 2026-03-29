import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { EnvConfig } from "../../config/types";

interface Ec2DatabaseStackProps extends cdk.StackProps {
  config: EnvConfig;
  vpc: ec2.Vpc;
  sgDb: ec2.SecurityGroup;
}

export class Ec2DatabaseStack extends cdk.Stack {
  public readonly instance: ec2.Instance;
  public readonly dbSecret: secretsmanager.Secret;
  public readonly privateIp: string;
  public readonly dbName = "vebgenix";

  constructor(scope: Construct, id: string, props: Ec2DatabaseStackProps) {
    super(scope, id, props);
    const { config, vpc, sgDb } = props;

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

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "set -euxo pipefail",
      "dnf update -y",
      "dnf install -y docker jq",
      "systemctl enable docker",
      "systemctl start docker",
      `SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id ${this.dbSecret.secretArn} --region ${config.region} --query SecretString --output text)`,
      "DB_USER=$(echo \"$SECRET_JSON\" | jq -r '.username')",
      "DB_PASS=$(echo \"$SECRET_JSON\" | jq -r '.password')",
      "DB_NAME=$(echo \"$SECRET_JSON\" | jq -r '.dbname')",
      "mkdir -p /var/lib/vebgenix-postgres",
      "chmod 700 /var/lib/vebgenix-postgres",
      "if ! docker ps -a --format '{{.Names}}' | grep -q '^vebgenix-postgres$'; then",
      "  docker run -d --name vebgenix-postgres --restart unless-stopped " +
        "-e POSTGRES_USER=\"$DB_USER\" " +
        "-e POSTGRES_PASSWORD=\"$DB_PASS\" " +
        "-e POSTGRES_DB=\"$DB_NAME\" " +
        "-p 5432:5432 " +
        "-v /var/lib/vebgenix-postgres:/var/lib/postgresql/data postgres:16",
      "else",
      "  docker start vebgenix-postgres || true",
      "fi",
    );

    this.instance = new ec2.Instance(this, "DbInstance", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
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
