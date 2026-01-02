#!/usr/bin/env node
/**
 * One-time script to clean HTML from intake summaries in DynamoDB
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'ledger-prod-intake';

function stripHtml(html) {
  if (!html) return html;
  return html
    // Remove HTML tags
    .replace(/<[^>]*>/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

async function main() {
  console.log('Scanning intake table...');

  let lastKey;
  let totalUpdated = 0;

  do {
    const scanResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastKey,
    }));

    for (const item of scanResult.Items || []) {
      if (item.summary && item.summary.includes('<')) {
        const cleanSummary = stripHtml(item.summary);

        console.log(`Updating ${item.intakeId}: "${item.title?.slice(0, 50)}..."`);

        await docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: item.PK,
            SK: item.SK,
          },
          UpdateExpression: 'SET summary = :summary',
          ExpressionAttributeValues: {
            ':summary': cleanSummary,
          },
        }));

        totalUpdated++;
      }
    }

    lastKey = scanResult.LastEvaluatedKey;
  } while (lastKey);

  console.log(`Done! Updated ${totalUpdated} items.`);
}

main().catch(console.error);
