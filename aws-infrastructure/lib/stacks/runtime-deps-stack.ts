import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { EnvConfig } from '../../config/types';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const LAYER_SOURCE = path.join(REPO_ROOT, 'aws-infrastructure', 'layers', 'runtime-deps');

export const RUNTIME_LAYER_EXTERNAL_MODULES = [
  'aws-jwt-verify',
  'mongoose',
  'nodemailer',
  'razorpay',
];

interface RuntimeDepsStackProps extends cdk.StackProps {
  config: EnvConfig;
}

function bundleLayerLocally(outputDir: string): boolean {
  const sourceNodejs = path.join(LAYER_SOURCE, 'nodejs');
  const outputNodejs = path.join(outputDir, 'nodejs');
  fs.rmSync(outputNodejs, { recursive: true, force: true });
  fs.mkdirSync(outputNodejs, { recursive: true });

  for (const fileName of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(
      path.join(sourceNodejs, fileName),
      path.join(outputNodejs, fileName),
    );
  }

  const result = spawnSync('npm', ['ci', '--omit=dev', '--ignore-scripts'], {
    cwd: outputNodejs,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  return result.status === 0;
}

export class RuntimeDepsStack extends cdk.Stack {
  public readonly layer: lambda.ILayerVersion;

  constructor(scope: Construct, id: string, props: RuntimeDepsStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.layer = new lambda.LayerVersion(this, 'RuntimeDepsLayer', {
      layerVersionName: `vebgenix-runtime-deps-${config.stage}`,
      description: 'Stable Node.js runtime dependencies shared by Vebgenix Lambdas',
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      code: lambda.Code.fromAsset(LAYER_SOURCE, {
        assetHashType: cdk.AssetHashType.SOURCE,
        exclude: ['nodejs/node_modules', 'nodejs/npm-debug.log*'],
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          local: {
            tryBundle(outputDir: string) {
              return bundleLayerLocally(outputDir);
            },
          },
          command: [
            'bash',
            '-c',
            [
              'mkdir -p /asset-output/nodejs',
              'cp /asset-input/nodejs/package*.json /asset-output/nodejs/',
              'cd /asset-output/nodejs',
              'npm ci --omit=dev --ignore-scripts',
            ].join(' && '),
          ],
        },
      }),
    });

    new cdk.CfnOutput(this, 'RuntimeDepsLayerArn', {
      value: this.layer.layerVersionArn,
    });
  }
}
