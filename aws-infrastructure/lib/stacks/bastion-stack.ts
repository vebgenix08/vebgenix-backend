import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { EnvConfig } from "../../config/types";

import * as s3 from "aws-cdk-lib/aws-s3";

interface BastionStackProps extends cdk.StackProps {
  config: EnvConfig;
  vpc: ec2.Vpc;
  sgDb: ec2.SecurityGroup;
}

export class BastionStack extends cdk.Stack {
  public readonly instanceId: string;

  constructor(scope: Construct, id: string, props: BastionStackProps) {
    super(scope, id, props);
    const { config, vpc, sgDb } = props;

    // Security Group for Bastion
    const sgBastion = new ec2.SecurityGroup(this, "SgBastion", {
      vpc,
      description: "Bastion host for SSM port forwarding",
      allowAllOutbound: true, // Needs to reach DB and AWS endpoints
    });

    // Import sgDb to add ingress rule in THIS stack (avoids cyclic dependency)
    const localSgDb = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "LocalSgDb",
      sgDb.securityGroupId,
    );

    // Allow Bastion to connect to DB
    localSgDb.addIngressRule(
      sgBastion,
      ec2.Port.tcp(5432),
      "Bastion to DB",
    );

    // IAM Role for SSM
    const role = new iam.Role(this, "BastionRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore",
        ),
      ],
    });

    // Grant access to S3 (for downloading prisma.zip)
    const bucket = s3.Bucket.fromBucketName(
      this,
      "DocumentsBucket",
      `vebgenix-documents-${config.stage}-${this.account}`,
    );
    bucket.grantRead(role);

    // Grant access to Secrets Manager (for DB credentials)
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:vebgenix/${config.stage}/db-master*`,
        ],
      }),
    );

    // EC2 Instance
    const instance = new ec2.Instance(this, "BastionHost", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: new ec2.InstanceType("t3.nano"), // Cheapest x86
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: sgBastion,
      role,
    });

    this.instanceId = instance.instanceId;

    new cdk.CfnOutput(this, "BastionInstanceId", {
      value: instance.instanceId,
      description: "Use this Instance ID for SSM Port Forwarding",
    });
  }
}
