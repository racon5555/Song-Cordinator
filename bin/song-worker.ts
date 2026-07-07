import { App } from 'aws-cdk-lib';
import { SongWorkerStack } from '../lib/song-worker-stack';

const app = new App();
new SongWorkerStack(app, 'SongWorkerStack', {
  env: { account: '602440905347', region: 'eu-central-1' },
  description: 'Async song worker for the IBB DevOps Praxisaufgabe',
});
