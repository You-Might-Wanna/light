#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LedgerStack } from './stacks/ledger-stack';

const app = new cdk.App();

// Development stack
new LedgerStack(app, 'LedgerDevStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  environment: 'dev',
  domainName: process.env.DOMAIN_NAME,
});

// Production stack (deployed via tags)
new LedgerStack(app, 'LedgerProdStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  environment: 'prod',
  domainName: process.env.DOMAIN_NAME,
});

app.synth();
