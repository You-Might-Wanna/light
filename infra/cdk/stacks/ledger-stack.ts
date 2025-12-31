import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigatewayAuthorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface LedgerStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  domainName?: string;
}

export class LedgerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LedgerStackProps) {
    super(scope, id, props);

    const { environment, domainName } = props;
    const prefix = `ledger-${environment}`;

    // Require domainName for production to ensure CORS is properly configured
    if (environment === 'prod' && !domainName) {
      throw new Error('domainName is required for production deployments to configure CORS');
    }

    // Build explicit CORS origins list
    const corsOrigins: string[] = [];
    if (environment === 'dev') {
      corsOrigins.push('http://localhost:5173'); // Vite dev server
      corsOrigins.push('http://localhost:3000'); // Alternative dev port
    }
    if (domainName) {
      // Support both www and non-www variants
      corsOrigins.push(`https://${domainName}`);
      if (domainName.startsWith('www.')) {
        corsOrigins.push(`https://${domainName.slice(4)}`);
      } else {
        corsOrigins.push(`https://www.${domainName}`);
      }
    }

    // ============================================================
    // KMS Key for signing verification manifests
    // ============================================================
    const signingKey = new kms.Key(this, 'SigningKey', {
      keySpec: kms.KeySpec.RSA_3072,
      keyUsage: kms.KeyUsage.SIGN_VERIFY,
      alias: `${prefix}-signing-key`,
      description: 'Asymmetric key for signing source verification manifests',
      enableKeyRotation: false, // Asymmetric keys don't support rotation
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // ============================================================
    // S3 Buckets
    // ============================================================

    // Immutable backup bucket with Object Lock (prod only)
    let backupBucket: s3.IBucket | undefined;
    if (environment === 'prod') {
      const cfnBackupBucket = new s3.CfnBucket(this, 'BackupBucketCfn', {
        bucketName: `${prefix}-backups-${this.account}`,
        objectLockEnabled: true,
        objectLockConfiguration: {
          objectLockEnabled: 'Enabled',
          rule: {
            defaultRetention: {
              mode: 'GOVERNANCE',
              years: 7,
            },
          },
        },
        versioningConfiguration: {
          status: 'Enabled',
        },
        bucketEncryption: {
          serverSideEncryptionConfiguration: [
            {
              serverSideEncryptionByDefault: {
                sseAlgorithm: 'AES256',
              },
            },
          ],
        },
        publicAccessBlockConfiguration: {
          blockPublicAcls: true,
          blockPublicPolicy: true,
          ignorePublicAcls: true,
          restrictPublicBuckets: true,
        },
      });
      cfnBackupBucket.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

      backupBucket = s3.Bucket.fromBucketName(
        this,
        'BackupBucket',
        cfnBackupBucket.ref
      );
    }

    // Sources bucket (private, versioned)
    const sourcesBucket = new s3.Bucket(this, 'SourcesBucket', {
      bucketName: `${prefix}-sources-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
      cors: corsOrigins.length > 0
        ? [
            {
              allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
              allowedOrigins: corsOrigins,
              // Explicit headers required for presigned uploads
              allowedHeaders: [
                'Content-Type',
                'Content-Length',
                'Content-MD5',
                'x-amz-content-sha256',
                'x-amz-date',
                'x-amz-security-token',
                'Authorization',
              ],
              exposedHeaders: ['ETag'],
              maxAge: 3600,
            },
          ]
        : undefined,
    });

    // Public site bucket (static hosting)
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `${prefix}-site-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
    });

    // ============================================================
    // DynamoDB Tables
    // ============================================================

    // Entities table
    const entitiesTable = new dynamodb.Table(this, 'EntitiesTable', {
      tableName: `${prefix}-entities`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    entitiesTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });

    // Cards table
    const cardsTable = new dynamodb.Table(this, 'CardsTable', {
      tableName: `${prefix}-cards`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    cardsTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });

    cardsTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
    });

    // Sources table
    const sourcesTable = new dynamodb.Table(this, 'SourcesTable', {
      tableName: `${prefix}-sources`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Audit table
    const auditTable = new dynamodb.Table(this, 'AuditTable', {
      tableName: `${prefix}-audit`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    auditTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });

    auditTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
    });

    // Idempotency table
    const idempotencyTable = new dynamodb.Table(this, 'IdempotencyTable', {
      tableName: `${prefix}-idempotency`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Always destroy, just cache
    });

    // ============================================================
    // Cognito User Pool
    // ============================================================
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${prefix}-admins`,
      selfSignUpEnabled: false, // Admin-only
      signInAliases: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: false,
        },
      },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Admin group - users must be in this group to access /admin/* routes
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'admin',
      description: 'Administrators with full access to admin API endpoints',
    });

    const userPoolClient = userPool.addClient('WebClient', {
      userPoolClientName: `${prefix}-web-client`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // ============================================================
    // SSM Parameters
    // ============================================================
    const readOnlyParam = new ssm.StringParameter(this, 'ReadOnlyParameter', {
      parameterName: `/${prefix}/readonly`,
      stringValue: 'false',
      description: 'Set to "true" to enable read-only mode (blocks all write operations)',
      tier: ssm.ParameterTier.STANDARD,
    });

    // ============================================================
    // Lambda Function
    // ============================================================
    const apiLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      'ApiLogGroup',
      `/aws/lambda/${prefix}-api`
    );

    const apiFunction = new lambda.Function(this, 'ApiFunction', {
      functionName: `${prefix}-api`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handlers/api.handler',
      code: lambda.Code.fromAsset('../../backend/dist'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logGroup: apiLogGroup,
      environment: {
        NODE_ENV: environment,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        ENTITIES_TABLE: entitiesTable.tableName,
        CARDS_TABLE: cardsTable.tableName,
        SOURCES_TABLE: sourcesTable.tableName,
        AUDIT_TABLE: auditTable.tableName,
        IDEMPOTENCY_TABLE: idempotencyTable.tableName,
        SOURCES_BUCKET: sourcesBucket.bucketName,
        KMS_SIGNING_KEY_ID: signingKey.keyId,
        LOG_LEVEL: environment === 'prod' ? 'info' : 'debug',
        READONLY_PARAM_NAME: readOnlyParam.parameterName,
      },
    });

    // Grant permissions
    entitiesTable.grantReadWriteData(apiFunction);
    cardsTable.grantReadWriteData(apiFunction);
    sourcesTable.grantReadWriteData(apiFunction);
    auditTable.grantReadWriteData(apiFunction);
    idempotencyTable.grantReadWriteData(apiFunction);
    sourcesBucket.grantReadWrite(apiFunction);
    signingKey.grant(apiFunction, 'kms:Sign', 'kms:GetPublicKey');
    readOnlyParam.grantRead(apiFunction);
    if (backupBucket) {
      backupBucket.grantWrite(apiFunction);
    }

    // ============================================================
    // API Gateway
    // ============================================================
    const httpApi = new apigateway.HttpApi(this, 'HttpApi', {
      apiName: `${prefix}-api`,
      corsPreflight: corsOrigins.length > 0
        ? {
            allowOrigins: corsOrigins,
            allowMethods: [
              apigateway.CorsHttpMethod.GET,
              apigateway.CorsHttpMethod.POST,
              apigateway.CorsHttpMethod.PUT,
              apigateway.CorsHttpMethod.OPTIONS,
            ],
            allowHeaders: [
              'Content-Type',
              'Authorization',
              'Idempotency-Key',
              'X-Request-Id',
            ],
            maxAge: cdk.Duration.minutes(10),
          }
        : undefined,
    });

    // JWT Authorizer for admin routes
    const jwtAuthorizer = new apigatewayAuthorizers.HttpJwtAuthorizer(
      'JwtAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [userPoolClient.userPoolClientId],
      }
    );

    const lambdaIntegration = new apigatewayIntegrations.HttpLambdaIntegration(
      'LambdaIntegration',
      apiFunction
    );

    // Public routes
    httpApi.addRoutes({
      path: '/health',
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/entities',
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/entities/{entityId}',
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/entities/{entityId}/cards',
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/cards',
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/cards/{cardId}',
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/sources/{sourceId}',
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/sources/{sourceId}/download',
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: '/sources/{sourceId}/verification',
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    // Admin routes (with JWT auth)
    httpApi.addRoutes({
      path: '/admin/{proxy+}',
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.POST, apigateway.HttpMethod.PUT],
      integration: lambdaIntegration,
      authorizer: jwtAuthorizer,
    });

    // ============================================================
    // WAF Web ACL (for CloudFront)
    // ============================================================
    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `${prefix}-waf`,
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${prefix}-waf`,
        sampledRequestsEnabled: true,
      },
      rules: [
        // Rate limit: 1000 requests per 5 minutes per IP
        {
          name: 'RateLimitRule',
          priority: 1,
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-rate-limit`,
            sampledRequestsEnabled: true,
          },
          statement: {
            rateBasedStatement: {
              limit: 1000,
              aggregateKeyType: 'IP',
            },
          },
        },
        // AWS Managed Rules - Common Rule Set
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-common-rules`,
            sampledRequestsEnabled: true,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
        },
        // AWS Managed Rules - Known Bad Inputs
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-bad-inputs`,
            sampledRequestsEnabled: true,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
        },
      ],
    });

    // ============================================================
    // CloudFront Security Headers Policy
    // ============================================================
    const securityHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
      responseHeadersPolicyName: `${prefix}-security-headers`,
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          // CSP for static SPA + same-origin API
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'", // Often needed for CSS-in-JS
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "upgrade-insecure-requests",
          ].join('; '),
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: {
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        xssProtection: {
          protection: true,
          modeBlock: true,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'Permissions-Policy',
            value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
            override: true,
          },
        ],
      },
    });

    // ============================================================
    // CloudFront Distribution
    // ============================================================
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      webAclId: webAcl.attrArn,
      defaultBehavior: {
        origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeadersPolicy,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new cloudfrontOrigins.HttpOrigin(
            `${httpApi.httpApiId}.execute-api.${this.region}.amazonaws.com`
          ),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          responseHeadersPolicy: securityHeadersPolicy,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.url || '',
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront Distribution ID',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'SourcesBucketName', {
      value: sourcesBucket.bucketName,
      description: 'Sources S3 Bucket',
    });

    new cdk.CfnOutput(this, 'SiteBucketName', {
      value: siteBucket.bucketName,
      description: 'Site S3 Bucket',
    });

    new cdk.CfnOutput(this, 'SigningKeyId', {
      value: signingKey.keyId,
      description: 'KMS Signing Key ID',
    });

    if (backupBucket) {
      new cdk.CfnOutput(this, 'BackupBucketName', {
        value: backupBucket.bucketName,
        description: 'Immutable Backup S3 Bucket (Object Lock enabled)',
      });
    }
  }
}
